# YOLO26s Training Log — litter detector

Honest record of training runs for the 7-class litter detection model. Nothing here is
rounded up: the current model is a genuinely weak baseline (mAP50 ≈ 0.163), and this
file exists so nobody repeats failed experiments or mistakes it for production quality.

## Dataset (shared by both runs)

- **BePLi v2** — 118,572 instances
- **SALSA** — 2,569 images, remapped to the 7-class taxonomy
- **868 sourced negative images** (no-label backgrounds)
- **8× oversampling** of `glass`, `metal`, `paper_cardboard` (train split only)
- **546 manually / GLM-annotated `natural_debris` boxes** across 210 images

Taxonomy: `0=plastic, 1=metal, 2=glass, 3=paper_cardboard, 4=fishing_gear,
5=natural_debris, 6=other_litter`

## Run 1

| Config | Value |
|---|---|
| Epochs | 56 (early stopping, patience=20) |
| imgsz | 320 |
| Outcome | Peaked at epoch 36: **mAP50=0.158, mAP50-95=0.093** |

Full per-class validation results (⚠️ from run 1's completed validation — the closest
available full breakdown. Run 2 converged to similar aggregate territory
(mAP50 0.158 → 0.163), so treat these as directionally representative of both runs,
NOT as run 2's exact per-class numbers):

| Class | Precision | Recall | mAP50 | mAP50-95 |
|---|---|---|---|---|
| plastic | 0.362 | 0.345 | 0.250 | 0.122 |
| metal | 0.282 | 0.316 | 0.193 | 0.159 |
| glass | 0.150 | 0.250 | 0.249 | 0.187 |
| paper_cardboard | 0.140 | 0.167 | 0.065 | 0.042 |
| fishing_gear | 0.321 | 0.152 | 0.123 | 0.063 |
| natural_debris | 0.117 | 0.151 | 0.039 | 0.015 |
| other_litter | 0.388 | 0.244 | 0.189 | 0.064 |

## Run 2 (shipped checkpoint)

| Config | Value |
|---|---|
| Epochs | 150 (early stopping **disabled**) |
| imgsz | 320 |
| Outcome | Peaked at epoch 38: **mAP50=0.163, mAP50-95=0.099** — then **degraded** for the remaining ~112 epochs, falling to mAP50 ≈ 0.108–0.12 by epoch 150 |

Ultralytics' `best.pt` checkpointing selected the epoch-38 weights, so the shipped
checkpoint is the run's actual best — but the extra 112 epochs produced **no net
improvement** over run 1 (+0.005 mAP50) and mildly overfit past the peak. Aggregate
peak metrics: precision ≈ 0.269, recall ≈ 0.230, mAP50 ≈ 0.163.

## Known weaknesses

- **`natural_debris` is data-starved** — only 355 train instances; mAP50 ≈ 0.039.
  More epochs cannot fix this; it needs more annotated data.
- **`paper_cardboard` is data-starved** — 816 instances; mAP50 ≈ 0.065 despite 8×
  oversampling.
- **`fishing_gear` underperforms relative to its instance count** for reasons not yet
  diagnosed. Possible label noise from GLM auto-annotation — a manual spot-check of
  those labels has **not been done** and is the cheapest next diagnostic.
- **`glass` precision is very low (0.150)** even after oversampling — likely confusion
  with natural debris and reflective wet sand.

## What was tried and did NOT help

- **Removing early stopping and extending to 150 epochs** (run 2): +0.005 mAP50 at the
  peak, followed by sustained degradation. Do not repeat this experiment expecting a
  different outcome without changing something else first (data, resolution, or
  architecture).

## Deployed artifact

- Run 2 `best.pt` (epoch 38) shipped as `yolo26s.pt`
  (SHA-256 `a94e1be3900b8fecb3bf20477726ade371212f9982443494f25bd8d5aa50ce77`).
- ONNX export at 320 px shipped as `yolo26s.onnx`
  (SHA-256 `b72f5cdef5451af4abb2d0051d9c95d0092e8a85f3cdf2fdb3d7644d6a56d6d7`).
- Run 2 `last.pt` deliberately excluded (degraded weights).
- Checkpoint uploaded for integration on **2026-09-06 ~12:53 local time**
  (`yolo26s_320_full_export.zip` containing `best.pt`, `last.pt`, `best.onnx`).
