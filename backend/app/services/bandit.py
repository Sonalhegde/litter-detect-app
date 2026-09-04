"""
Epsilon-greedy contextual bandit for per-class adaptive confidence thresholding.

Each class maintains its own logistic-regression weight vector over a small feature
context [confidence, log_confidence, confidence²] plus a bias term.  After each
feedback event the weights are updated via a single online gradient step (SGD).

The bandit decides "accept" (show detection to user) or "reject" (discard as noise).
The effective threshold is the confidence value at which the bandit is indifferent
between accept and reject — estimated numerically from the weight vector.

Persistence: weights are stored in a single SQLite file (default: /tmp/bandit.db or
configurable via BANDIT_DB_PATH).  The DB is created on first use.

Safety rail: effective threshold is clamped to [THRESHOLD_MIN, THRESHOLD_MAX] so a
burst of noisy feedback can't collapse it to 0 or 1.

Cold-start gate: a class needs at least MIN_FEEDBACK_EVENTS updates before its bandit
is trusted; below that threshold the static fallback value is used.
"""

from __future__ import annotations

import json
import math
import os
import sqlite3
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

# ── Constants ──────────────────────────────────────────────────────────────────
EPSILON = 0.10           # exploration rate (10% random decisions)
LEARNING_RATE = 0.05     # SGD step size for logistic regression update
THRESHOLD_MIN = 0.10     # safety floor — never go below 10%
THRESHOLD_MAX = 0.90     # safety ceiling — never go above 90%
STATIC_FALLBACK = 0.25   # used when class has too few feedback events
MIN_FEEDBACK_EVENTS = 10 # minimum events before bandit replaces static threshold
FEATURE_DIM = 4          # [bias, confidence, log(confidence+ε), confidence²]


# ── Feature extraction ─────────────────────────────────────────────────────────
def _features(confidence: float) -> np.ndarray:
    """Build a 4-dim feature vector from a raw confidence score."""
    c = float(np.clip(confidence, 1e-6, 1.0 - 1e-6))
    return np.array([1.0, c, math.log(c), c * c], dtype=np.float64)


def _sigmoid(x: float) -> float:
    if x >= 0:
        return 1.0 / (1.0 + math.exp(-x))
    exp_x = math.exp(x)
    return exp_x / (1.0 + exp_x)


# ── Per-class bandit state ─────────────────────────────────────────────────────
@dataclass
class ClassBandit:
    class_name: str
    weights: np.ndarray = field(default_factory=lambda: np.zeros(FEATURE_DIM, dtype=np.float64))
    feedback_count: int = 0
    last_updated: float = field(default_factory=time.time)

    # --------------------------------------------------------------------------
    def accept_probability(self, confidence: float) -> float:
        """P(accept | confidence) from the current weight vector."""
        return _sigmoid(float(self.weights @ _features(confidence)))

    def should_accept(self, confidence: float, rng: np.random.Generator) -> bool:
        """Epsilon-greedy decision: explore randomly EPSILON fraction of the time."""
        if rng.random() < EPSILON:
            return bool(rng.random() < 0.5)
        return self.accept_probability(confidence) >= 0.5

    # --------------------------------------------------------------------------
    def update(self, confidence: float, accepted: bool, reward: float) -> None:
        """
        Online SGD update.
        reward > 0  → correct decision (user confirmed or no complaint)
        reward < 0  → wrong decision (user rejected FP or flagged FN)
        """
        phi = _features(confidence)
        p = self.accept_probability(confidence)
        # Label: 1 = should accept, 0 = should reject
        label = 1.0 if reward > 0 else 0.0
        error = label - p
        self.weights += LEARNING_RATE * error * phi
        self.feedback_count += 1
        self.last_updated = time.time()

    # --------------------------------------------------------------------------
    def effective_threshold(self) -> float:
        """
        Confidence value where accept_probability ≈ 0.5.
        Solved numerically: binary search on [THRESHOLD_MIN, THRESHOLD_MAX].
        Falls back to STATIC_FALLBACK if cold-start gate not met.
        """
        if self.feedback_count < MIN_FEEDBACK_EVENTS:
            return STATIC_FALLBACK

        lo, hi = THRESHOLD_MIN, THRESHOLD_MAX
        for _ in range(40):
            mid = (lo + hi) / 2
            if self.accept_probability(mid) >= 0.5:
                hi = mid
            else:
                lo = mid
        threshold = (lo + hi) / 2
        return float(np.clip(threshold, THRESHOLD_MIN, THRESHOLD_MAX))


# ── Bandit registry (one bandit per class, persisted to SQLite) ────────────────
class BanditRegistry:
    """
    Thread-safe registry of ClassBandit instances, backed by SQLite.
    All public methods are safe to call from multiple threads / async contexts.
    """

    def __init__(self, db_path: Path | None = None) -> None:
        default = os.environ.get("BANDIT_DB_PATH", "/tmp/sentinel_bandit.db")
        self._db_path = db_path or Path(default)
        self._bandits: dict[str, ClassBandit] = {}
        # Reentrant: record_feedback holds this lock and calls get_or_create,
        # which acquires it again on the same thread.
        self._lock = threading.RLock()
        self._rng = np.random.default_rng()
        self._init_db()
        self._load_all()

    # ── DB setup ───────────────────────────────────────────────────────────────
    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS bandit_state (
                    class_name    TEXT PRIMARY KEY,
                    weights_json  TEXT NOT NULL,
                    feedback_count INTEGER NOT NULL DEFAULT 0,
                    last_updated  REAL NOT NULL
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS feedback_log (
                    id            INTEGER PRIMARY KEY AUTOINCREMENT,
                    ts            REAL NOT NULL,
                    class_name    TEXT NOT NULL,
                    confidence    REAL NOT NULL,
                    accepted      INTEGER NOT NULL,
                    reward        REAL NOT NULL,
                    image_hash    TEXT,
                    detection_id  INTEGER
                )
            """)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self._db_path), timeout=10, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    # ── Persistence ────────────────────────────────────────────────────────────
    def _load_all(self) -> None:
        with self._connect() as conn:
            for row in conn.execute("SELECT * FROM bandit_state"):
                bandit = ClassBandit(
                    class_name=row["class_name"],
                    weights=np.array(json.loads(row["weights_json"]), dtype=np.float64),
                    feedback_count=row["feedback_count"],
                    last_updated=row["last_updated"],
                )
                self._bandits[row["class_name"]] = bandit

    def _save(self, bandit: ClassBandit, conn: sqlite3.Connection) -> None:
        conn.execute(
            """INSERT INTO bandit_state (class_name, weights_json, feedback_count, last_updated)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(class_name) DO UPDATE SET
                 weights_json   = excluded.weights_json,
                 feedback_count = excluded.feedback_count,
                 last_updated   = excluded.last_updated""",
            (
                bandit.class_name,
                json.dumps(bandit.weights.tolist()),
                bandit.feedback_count,
                bandit.last_updated,
            ),
        )

    # ── Public API ─────────────────────────────────────────────────────────────
    def get_or_create(self, class_name: str) -> ClassBandit:
        with self._lock:
            if class_name not in self._bandits:
                self._bandits[class_name] = ClassBandit(class_name=class_name)
            return self._bandits[class_name]

    def effective_threshold(self, class_name: str) -> float:
        return self.get_or_create(class_name).effective_threshold()

    def should_accept(self, class_name: str, confidence: float) -> bool:
        bandit = self.get_or_create(class_name)
        with self._lock:
            return bandit.should_accept(confidence, self._rng)

    def record_feedback(
        self,
        class_name: str,
        confidence: float,
        accepted: bool,
        reward: float,
        image_hash: str | None = None,
        detection_id: int | None = None,
    ) -> None:
        """Update the bandit weights and persist everything atomically."""
        with self._lock:
            bandit = self.get_or_create(class_name)
            bandit.update(confidence, accepted, reward)

        with self._connect() as conn:
            self._save(self._bandits[class_name], conn)
            conn.execute(
                """INSERT INTO feedback_log
                   (ts, class_name, confidence, accepted, reward, image_hash, detection_id)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (time.time(), class_name, confidence, int(accepted), reward, image_hash, detection_id),
            )

    def status(self) -> list[dict]:
        """Summary of every known class's bandit state — for admin/debug inspection."""
        with self._lock:
            result = []
            for name, bandit in sorted(self._bandits.items()):
                result.append({
                    "class_name": name,
                    "effective_threshold": round(bandit.effective_threshold(), 4),
                    "feedback_count": bandit.feedback_count,
                    "trusted": bandit.feedback_count >= MIN_FEEDBACK_EVENTS,
                    "last_updated": bandit.last_updated,
                })
            return result

    def offline_eval(self) -> dict:
        """
        Offline evaluation: compare bandit decisions vs static threshold on the
        full feedback log.  Returns per-class precision/recall estimates.
        """
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT class_name, confidence, accepted, reward FROM feedback_log ORDER BY ts"
            ).fetchall()

        if not rows:
            return {"message": "No feedback data yet."}

        from collections import defaultdict
        stats: dict[str, dict[str, int]] = defaultdict(lambda: {
            "bandit_tp": 0, "bandit_fp": 0, "bandit_fn": 0, "bandit_tn": 0,
            "static_tp": 0, "static_fp": 0, "static_fn": 0, "static_tn": 0,
        })

        for row in rows:
            cn = row["class_name"]
            conf = row["confidence"]
            reward = row["reward"]
            ground_truth = reward > 0  # positive feedback → correct object

            bandit = self.get_or_create(cn)
            bandit_pred = bandit.accept_probability(conf) >= 0.5
            static_pred = conf >= STATIC_FALLBACK

            s = stats[cn]
            for pred, prefix in [(bandit_pred, "bandit"), (static_pred, "static")]:
                if ground_truth and pred:
                    s[f"{prefix}_tp"] += 1
                elif ground_truth and not pred:
                    s[f"{prefix}_fn"] += 1
                elif not ground_truth and pred:
                    s[f"{prefix}_fp"] += 1
                else:
                    s[f"{prefix}_tn"] += 1

        result: dict[str, dict] = {}
        for cn, s in stats.items():
            def metrics(tp: int, fp: int, fn: int) -> dict:
                precision = tp / (tp + fp) if (tp + fp) > 0 else None
                recall = tp / (tp + fn) if (tp + fn) > 0 else None
                return {"precision": round(precision, 3) if precision is not None else None,
                        "recall": round(recall, 3) if recall is not None else None}

            result[cn] = {
                "bandit": metrics(s["bandit_tp"], s["bandit_fp"], s["bandit_fn"]),
                "static": metrics(s["static_tp"], s["static_fp"], s["static_fn"]),
                "n": len([r for r in rows if r["class_name"] == cn]),
            }
        return result
