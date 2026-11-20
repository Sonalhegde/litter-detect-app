import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, FileImage, ImageOff, LoaderCircle, SlidersHorizontal, Sparkles, Upload, Waves, X } from "lucide-react";
import { Link } from "wouter";
import { SentinalLogo } from "@/components/SentinalLogo";
import {
  API_BASE_URL,
  averageConfidence,
  formatDuration,
  formatPercent,
  getHealth,
  maxConfidence,
  prepareImageForUpload,
  requestDetection,
  type Detection,
  type DetectionApiError,
  type DetectionResponse,
  type HealthResponse,
} from "@/lib/detection";

const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const RELEASE_SHA = __RELEASE_SHA__;

// ── Per-class colour ───────────────────────────────────────────────────────────
const CLASS_COLORS = [
  "var(--cls-0)", "var(--cls-1)", "var(--cls-2)", "var(--cls-3)",
  "var(--cls-4)", "var(--cls-5)", "var(--cls-6)", "var(--cls-7)",
  "var(--cls-8)", "var(--cls-9)", "var(--cls-10)", "var(--cls-11)",
  "var(--cls-12)", "var(--cls-13)", "var(--cls-14)", "var(--cls-15)",
];
function classColor(className: string, index: number) {
  let h = 0;
  for (let i = 0; i < className.length; i++)
    h = ((h << 5) - h + className.charCodeAt(i)) | 0;
  return CLASS_COLORS[Math.abs(h) % CLASS_COLORS.length] ?? CLASS_COLORS[index % CLASS_COLORS.length];
}

const CANONICAL_LABELS: Record<string, string> = {
  plastic_bottle: "Plastic Bottle",
  bottle_cap_lid: "Bottle Cap",
  plastic_bag: "Plastic Bag",
  food_wrapper: "Food Wrapper",
  plastic_container: "Plastic Container",
  can_metal: "Metal Can",
  fishing_net: "Fishing Net",
  rope_line: "Rope / Line",
  styrofoam: "Styrofoam",
  glass_bottle: "Glass Bottle",
  plastic: "Plastic",
  metal: "Metal",
  glass: "Glass",
  paper_cardboard: "Paper / Cardboard",
  fishing_gear: "Fishing Gear",
  natural_debris: "Natural Debris",
  other_litter: "Other Litter",
};

export function formatClassLabel(name: string): string {
  return CANONICAL_LABELS[name] ?? name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function DetectionOverlay({
  detections,
  imageSize,
  highSensitivity = false,
}: {
  detections: Detection[];
  imageSize: { width: number; height: number };
  highSensitivity?: boolean;
}) {
  const classNames = Array.from(new Set(detections.map((d) => d.className)));
  const colorMap = Object.fromEntries(classNames.map((c, i) => [c, classColor(c, i)]));

  // Compute scale-adaptive proportions based on native image coordinate space
  const minDim = Math.min(imageSize.width, imageSize.height);
  const fontSize = Math.max(14, Math.min(36, Math.round(minDim * 0.024)));
  const badgeHeight = Math.round(fontSize * 1.5);
  const strokeWidth = Math.max(2.5, Math.round(minDim * 0.0035));
  const cornerRadius = Math.max(3, Math.round(minDim * 0.006));

  return (
    <svg
      aria-label={`${detections.length} detection bounding ${detections.length === 1 ? "box" : "boxes"}`}
      className="detection-overlay"
      viewBox={`0 0 ${imageSize.width} ${imageSize.height}`}
      preserveAspectRatio="none"
    >
      {detections.map((det) => {
        const w = det.bbox.x2 - det.bbox.x1;
        const h = det.bbox.y2 - det.bbox.y1;
        const color = colorMap[det.className] ?? "var(--cls-0)";
        const isSubtle = highSensitivity && det.confidence < 0.35;
        const labelText = `${formatClassLabel(det.className)} · ${formatPercent(det.confidence)}${isSubtle ? " (Subtle)" : ""}`;
        const paddingX = Math.round(fontSize * 0.55);
        const badgeWidth = Math.round(labelText.length * fontSize * 0.58 + paddingX * 2);

        // Position badge above bounding box; flip inside if near top boundary
        const badgeY = det.bbox.y1 - badgeHeight >= 4 ? det.bbox.y1 - badgeHeight : det.bbox.y1;
        const badgeX = Math.max(2, Math.min(det.bbox.x1, imageSize.width - badgeWidth - 2));

        return (
          <g key={det.id}>
            {/* Crisp bounding box with 100% transparent interior */}
            <rect
              className="det-box"
              x={det.bbox.x1}
              y={det.bbox.y1}
              width={w}
              height={h}
              rx={cornerRadius}
              style={{
                stroke: color,
                strokeWidth,
                fill: "transparent",
                strokeDasharray: isSubtle ? "6,4" : undefined,
              }}
            />
            {/* Semi-transparent frosted glass pill badge */}
            <rect
              className="det-badge"
              x={badgeX}
              y={badgeY}
              width={badgeWidth}
              height={badgeHeight}
              rx={Math.round(badgeHeight * 0.32)}
              fill="rgba(15, 23, 42, 0.65)"
              stroke={color}
              strokeWidth={Math.max(1.2, strokeWidth * 0.55)}
            />
            {/* Neat, crisp high-contrast white text */}
            <text
              className="det-label"
              x={badgeX + paddingX}
              y={badgeY + badgeHeight * 0.72}
              style={{
                fontSize: `${fontSize}px`,
                letterSpacing: "0.02em",
                fill: "#ffffff",
                filter: "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.95))",
              }}
            >
              {labelText}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Status type ────────────────────────────────────────────────────────────────
type Status = "idle" | "compressing" | "scanning" | "complete" | "error" | "off-topic";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<DetectionResponse | null>(null);
  const [sensitivity, setSensitivity] = useState<"standard" | "high">("high");
  const [error, setError] = useState<string | null>(null);
  const [resizeNotice, setResizeNotice] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastScanTimeRef = useRef<number>(0);

  const refreshHealth = useCallback(async () => {
    try { setHealth(await getHealth()); }
    catch { setHealth({ status: "degraded", models: [] }); }
  }, []);

  useEffect(() => { void refreshHealth(); }, [refreshHealth]);
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    abortRef.current?.abort();
  }, [previewUrl]);

  // ── File selection with defensive auto-compression & dimension limits ──────
  const selectFile = useCallback(async (candidate?: File) => {
    if (!candidate) return;
    const isSupported = (candidate.type && SUPPORTED_TYPES.has(candidate.type)) || /\.(jpe?g|png|webp)$/i.test(candidate.name);
    if (!isSupported) {
      setError("Choose a JPEG, PNG, or WebP image."); setStatus("error"); return;
    }

    setStatus("compressing"); setError(null); setResizeNotice(null);

    let prepared: File;
    let wasResized = false;

    try {
      const result = await prepareImageForUpload(candidate);
      prepared = result.file;
      wasResized = result.resized;
      if (wasResized && result.resized) {
        const fromMb = (result.originalSize / 1024 / 1024).toFixed(1);
        const toMb = (prepared.size / 1024 / 1024).toFixed(1);
        const origDim = result.originalDim;
        const newDim = result.newDim;
        if (origDim && newDim && (origDim.width !== newDim.width || origDim.height !== newDim.height)) {
          setResizeNotice(
            `Optimized: Scaled from ${origDim.width}×${origDim.height} (${fromMb} MB) to ${newDim.width}×${newDim.height} (${toMb} MB) for safe inference.`
          );
        } else {
          setResizeNotice(`Image compressed from ${fromMb} MB to ${toMb} MB to fit the 25 MB upload limit.`);
        }
      }
    } catch (err) {
      setError((err as Error).message);
      setStatus("error");
      return;
    }

    // Build preview from the (possibly compressed) file
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(prepared);
    setPreviewUrl(URL.createObjectURL(prepared));
    setResult(null);
    setStatus("idle");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewUrl]);

  const clearWorkspace = useCallback(() => {
    abortRef.current?.abort();
    setFile(null); setPreviewUrl(null); setResult(null);
    setError(null); setResizeNotice(null); setStatus("idle");
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  // ── Run detection (with client-side cooldown & debounce) ────────────────────
  const runDetection = useCallback(async (force = false) => {
    if (!file) return;
    const now = Date.now();
    if (now - lastScanTimeRef.current < 1500) {
      setError("Please wait a moment before starting another scan.");
      setStatus("error");
      return;
    }
    lastScanTimeRef.current = now;

    const targetModelId = health?.models.find((m) => m.id === "yolo26m" && m.available) ? "yolo26m" : "yolo26s";
    const modelEntry = health?.models.find((m) => m.id === targetModelId);
    if (modelEntry && !modelEntry.available) {
      setError(modelEntry.detail ?? "The detection model service is currently connecting or initializing.");
      setStatus("error"); return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("scanning"); setError(null); setResult(null);

    try {
      const res = await requestDetection(file, targetModelId, controller.signal, force);

      // Hard-blocked by scene check and user didn't force: strictly override detection UI
      const isBlocked =
        !force &&
        (res.sceneRelevance.verdict === "block" ||
          (res.sceneRelevance.checkerAvailable && res.sceneRelevance.score < 0.15));

      if (isBlocked) {
        setResult({
          ...res,
          detections: [],
          count: 0,
          summary: [],
        });
        setStatus("off-topic");
      } else {
        setResult(res);
        setStatus("complete");
      }
      void refreshHealth();
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError((caught as DetectionApiError).message ?? "Detection could not be completed. Please try again.");
      setStatus("error");
      void refreshHealth();
    }
  }, [file, health, refreshHealth]);

  const activeThreshold = sensitivity === "high" ? 0.20 : 0.35;

  const activeDetections = useMemo(() => {
    if (!result) return [];
    return result.detections.filter((d) => d.confidence >= activeThreshold);
  }, [result, activeThreshold]);

  const hiddenCount = useMemo(() => {
    if (!result || sensitivity === "high") return 0;
    return result.detections.filter((d) => d.confidence < 0.35 && d.confidence >= 0.20).length;
  }, [result, sensitivity]);

  const meanConf = useMemo(() => averageConfidence(activeDetections), [activeDetections]);
  const topConf  = useMemo(() => maxConfidence(activeDetections), [activeDetections]);

  const isYolo26mAvailable = Boolean(health?.models.find((m) => m.id === "yolo26m" && m.available));

  const serviceLabel =
    health?.status === "healthy" ? "Inference service available" :
    health ? "Inference service needs attention" :
    "Checking inference service…";

  const classNames = Array.from(new Set(activeDetections.map((d) => d.className)));
  const colorMap = Object.fromEntries(classNames.map((c, i) => [c, classColor(c, i)]));

  // Soft-warn: scene checker said "warn" but detection ran anyway
  const sceneWarn = status === "complete" && result?.sceneRelevance.verdict === "warn";

  return (
    <div className="app-shell">
      {/* Header */}
      <header>
        <div className="page-width topbar">
          <div className="topbar-left">
            <a className="brand" href="/" aria-label="Sentinal home">
              <span className="brand-mark"><SentinalLogo size={32} /></span>
              Sentinal
            </a>
            <Link className="nav-link" href="/docs">Research notes ↗</Link>
          </div>
          <div className="status-indicator">
            <span className={`status-dot ${health?.status === "healthy" ? "status-dot--healthy" : "status-dot--degraded"}`} />
            <span className="service-status">
              {health?.status === "healthy" ? "Inference service online" : health ? "Inference service degraded" : "Checking service…"}
            </span>
          </div>
        </div>
      </header>

      <main>
        <div className="page-width">
          {/* Hero */}
          <section className="hero" aria-labelledby="page-title">
            <span className="kicker">
              <Waves size={14} /> VISUAL INTELLIGENCE FOR CLEANER COASTLINES
            </span>
            <h1 id="page-title">See what the shoreline leaves behind.</h1>
            <p>
              Upload a coastal or marine image and use Sentinal's multi-class detector to identify across
              10 marine debris categories (plastic bottles, fishing nets, rope, styrofoam, cans, wrappers, and more), quantify confidence, and review every marked instance.
            </p>
          </section>

          {/* Workspace */}
          <section id="workspace" className="workspace" aria-label="Litter detection workspace">

            {/* ── Upload panel ──────────────────────────────────────────── */}
            <section className="panel" aria-label="Image upload">
              <div className="panel-header">
                <div className="panel-header-meta">
                  <span className="step-badge">01 &nbsp; SOURCE IMAGE</span>
                  <h2>Set the scene</h2>
                </div>
                <span className="panel-constraint">JPEG, PNG, WebP · max 25 MB · up to 48 MP (auto-optimized)</span>
              </div>

              {/* Compressing spinner */}
              {status === "compressing" && (
                <div className="result-empty" style={{ minHeight: 160 }}>
                  <LoaderCircle className="spin" size={22} />
                  <div><h3>Preparing image…</h3><p>Optimizing dimensions &amp; compression for safe inference.</p></div>
                </div>
              )}

              {status !== "compressing" && !previewUrl && (
                <button
                  type="button"
                  className={`dropzone${dragActive ? " dropzone--active" : ""}`}
                  onClick={() => inputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragActive(false);
                    const dropped = e.dataTransfer.files;
                    if (!dropped || dropped.length === 0) return;
                    if (dropped.length > 1) {
                      setResizeNotice("Multiple files dropped: Sentinal analyzes one image per inference run. Analyzing the first image.");
                    }
                    void selectFile(dropped[0]);
                  }}
                >
                  <Upload size={24} />
                  <strong>Drop an image to begin</strong>
                  <span>or choose a file from your device</span>
                </button>
              )}

              {status !== "compressing" && previewUrl && (
                <div className="preview-wrap">
                  <img className="preview-img" src={previewUrl} alt={`Selected: ${file?.name ?? "image"}`} />
                  <div className="preview-meta">
                    <FileImage size={14} />
                    <span>{file?.name}</span>
                    <button type="button" onClick={clearWorkspace} aria-label="Remove image">
                      <X size={15} />
                    </button>
                  </div>
                </div>
              )}

              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={(e) => void selectFile(e.target.files?.[0])}
              />

              {/* Resize notice */}
              {resizeNotice && (
                <p className="resize-notice">{resizeNotice}</p>
              )}

              <div className="model-note">
                <strong>Model</strong>
                <span>
                  {isYolo26mAvailable
                    ? "Sentinal YOLO26m · 10-Class Marine Debris Detector (960px)"
                    : "Sentinal YOLO26s (Baseline 7-Class) · Redeploy Cloud Run to activate 10-Class YOLO26m"}
                </span>
              </div>

              {/* Sensitivity & Small Objects Control */}
              <div className="sensitivity-control">
                <div className="sensitivity-header">
                  <span className="sensitivity-title">
                    <SlidersHorizontal size={14} /> Sensitivity & Small Objects
                  </span>
                  <span className="sensitivity-status-pill">
                    {sensitivity === "high" ? "High (≥20% Threshold)" : "Standard (≥35% Threshold)"}
                  </span>
                </div>
                <div className="sensitivity-toggle-group">
                  <button
                    type="button"
                    className={`sensitivity-btn ${sensitivity === "standard" ? "sensitivity-btn--active" : ""}`}
                    onClick={() => setSensitivity("standard")}
                  >
                    <strong>Standard</strong>
                    <small>Prominent litter (≥35%)</small>
                  </button>
                  <button
                    type="button"
                    className={`sensitivity-btn ${sensitivity === "high" ? "sensitivity-btn--active" : ""}`}
                    onClick={() => setSensitivity("high")}
                  >
                    <strong>High Sensitivity</strong>
                    <small>Small caps & micro-debris (≥20%)</small>
                  </button>
                </div>
                <p className="sensitivity-hint">
                  {sensitivity === "high"
                    ? "🔍 High Sensitivity is ON: Detects small bottle caps, lids, and subtle litter that blend into pebbles and sand."
                    : "Standard mode focuses on large, obvious debris. Switch to High Sensitivity if small objects are missed."}
                </p>
              </div>

              <div className="btn-row">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!file || status === "scanning" || status === "compressing"}
                  onClick={() => void runDetection(false)}
                >
                  {status === "scanning"
                    ? <><LoaderCircle className="spin" size={16} /> Analyzing…</>
                    : "Run detection"}
                </button>
                {file && status !== "compressing" && (
                  <button type="button" className="btn-secondary" onClick={clearWorkspace}>
                    Clear
                  </button>
                )}
              </div>

              {/* Genuine error (bad file, network, server) */}
              {status === "error" && error && (
                <div className="error-banner" role="alert">
                  <AlertCircle size={17} style={{ flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <strong>Detection failed</strong>
                    <p>{error}</p>
                  </div>
                  {file && (
                    <button
                      type="button"
                      onClick={() => void runDetection(false)}
                      disabled={(status as string) === "scanning"}
                      aria-label="Retry detection"
                    >
                      Retry
                    </button>
                  )}
                </div>
              )}
            </section>

            {/* ── Result panel ──────────────────────────────────────────── */}
            <section className="panel" aria-label="Detection result" aria-live="polite">
              <div className="panel-header">
                <div className="panel-header-meta">
                  <span className="step-badge">02 &nbsp; DETECTION REVIEW</span>
                  <h2>
                    {status === "complete" && result
                      ? activeDetections.length > 0 ? "Read the findings" : "No litter found"
                      : status === "off-topic"
                      ? "Not a coastal scene"
                      : "Read the findings"}
                  </h2>
                </div>
              </div>

              {/* Empty */}
              {!previewUrl && status !== "compressing" && (
                <div className="result-empty">
                  <FileImage size={28} />
                  <div>
                    <h3>No image selected</h3>
                    <p>Your annotated image and detection details will appear here.</p>
                  </div>
                </div>
              )}

              {/* Scanning */}
              {previewUrl && status === "scanning" && (
                <div className="result-empty">
                  <LoaderCircle className="spin" size={26} />
                  <div>
                    <h3>Analyzing image</h3>
                    <p>The service is scanning across 10 marine debris categories.</p>
                  </div>
                </div>
              )}

              {/* Ready */}
              {previewUrl && status === "idle" && !result && (
                <div className="result-empty">
                  <FileImage size={28} />
                  <div>
                    <h3>Ready to analyze</h3>
                    <p>Run detection to see the model output.</p>
                  </div>
                </div>
              )}

              {/* ── Off-topic / scene blocked ──────────────────────────── */}
              {status === "off-topic" && result && (
                <div className="scene-block">
                  <ImageOff size={28} />
                  <div>
                    <h3>This doesn't look like a coastal photo.</h3>
                    <p>
                      The scene relevance check scored this image at{" "}
                      {formatPercent(result.sceneRelevance.score)}, which is below the
                      threshold for a shoreline scene. Results are likely to be meaningless
                      on a non-coastal image.
                    </p>
                    <div className="scene-block-actions">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={clearWorkspace}
                      >
                        Use a different image
                      </button>
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => void runDetection(true)}
                        disabled={(status as string) === "scanning"}
                      >
                        Run detection anyway
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Complete results ───────────────────────────────────── */}
              {result && status === "complete" && (
                <div>
                  {/* Soft scene warning */}
                  {sceneWarn && (
                    <div className="scene-warn" role="note">
                      <AlertCircle size={15} />
                      <p>
                        This image scored {formatPercent(result.sceneRelevance.score)} for coastal
                        relevance — results may not be meaningful if this isn't a shoreline photo.
                      </p>
                    </div>
                  )}

                  <div className="annotated-wrap">
                    <img src={previewUrl!} alt="Uploaded scene" />
                    <DetectionOverlay
                      detections={activeDetections}
                      imageSize={result.imageSize}
                      highSensitivity={sensitivity === "high"}
                    />
                  </div>

                  {/* Active model banner */}
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    fontSize: "0.8125rem",
                    marginTop: "12px",
                    marginBottom: "6px",
                    background: result.model === "yolo26m" ? "rgba(16, 185, 129, 0.12)" : "rgba(245, 158, 11, 0.12)",
                    border: result.model === "yolo26m" ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(245, 158, 11, 0.3)",
                    color: result.model === "yolo26m" ? "#10b981" : "#f59e0b",
                  }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 600 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: result.model === "yolo26m" ? "#10b981" : "#f59e0b" }} />
                      {result.model === "yolo26m" ? "YOLO26m (10-Class Debris Model · 960px)" : `${result.modelLabel} (Baseline Fallback)`}
                    </span>
                    <span style={{ color: "var(--text-2)", fontSize: "0.75rem" }}>
                      {formatDuration(result.inferenceTimeSec)}
                    </span>
                  </div>
                  {result.model !== "yolo26m" && (
                    <p style={{ fontSize: "0.75rem", color: "var(--text-2)", marginBottom: "10px" }}>
                      Note: Live backend is using the baseline model. Redeploy Cloud Run to activate the 10-class YOLO26m model.
                    </p>
                  )}

                  {/* Hidden small objects banner */}
                  {hiddenCount > 0 && (
                    <div className="hidden-debris-banner">
                      <span>
                        <Sparkles size={14} />
                        {hiddenCount} small or subtle {hiddenCount === 1 ? "item" : "items"} hidden by Standard filter
                      </span>
                      <button type="button" onClick={() => setSensitivity("high")}>
                        Show Small Items
                      </button>
                    </div>
                  )}

                  <div className="result-stats">
                    <div className="stat-tile">
                      <strong>{activeDetections.length}</strong>
                      <span>{activeDetections.length === 1 ? "item" : "items"} detected</span>
                    </div>
                    <div className="stat-tile">
                      <strong>{formatPercent(topConf)}</strong>
                      <span>highest confidence</span>
                    </div>
                  </div>

                  {activeDetections.length > 0 ? (
                    <ol className="detection-list">
                      {[...activeDetections]
                        .sort((a, b) => b.confidence - a.confidence)
                        .map((det) => (
                          <li key={det.id}>
                            <span className="det-class">
                              <span
                                className="det-swatch"
                                style={{ background: colorMap[det.className] ?? "var(--cls-0)" }}
                              />
                              {formatClassLabel(det.className)}
                              {sensitivity === "high" && det.confidence < 0.35 && (
                                <span className="small-object-tag">Small / Subtle</span>
                              )}
                            </span>
                            <span className="det-confidence">{formatPercent(det.confidence)}</span>
                          </li>
                        ))}
                    </ol>
                  ) : (
                    <div className="no-detections">
                      <strong>No marine debris detected.</strong>
                      <p>
                        {sensitivity === "standard" && hiddenCount > 0
                          ? `${hiddenCount} item(s) are below the 35% threshold. Switch to High Sensitivity to view them.`
                          : "No object crossed the confidence threshold. This does not rule out debris the model was uncertain about."}
                      </p>
                      {sensitivity === "standard" && hiddenCount > 0 && (
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ marginTop: "10px", width: "100%", fontSize: "0.8125rem", padding: "7px 12px" }}
                          onClick={() => setSensitivity("high")}
                        >
                          Switch to High Sensitivity
                        </button>
                      )}
                    </div>
                  )}

                  <details className="result-details">
                    <summary>Details ▾</summary>
                    <p>
                      {result.modelLabel} · {result.runtime.device.toUpperCase()} ·{" "}
                      {formatDuration(result.inferenceTimeSec)} · input {result.runtime.inputSize}px ·
                      mode {sensitivity} ({formatPercent(activeThreshold)}) ·
                      mean {formatPercent(meanConf)} · backend threshold{" "}
                      {formatPercent(result.runtime.confidenceThreshold)} · scene score{" "}
                      {formatPercent(result.sceneRelevance.score)}
                    </p>
                  </details>
                </div>
              )}
            </section>
          </section>
        </div>
      </main>

      <footer>
        <div className="page-width footer-inner">
          <span>Sentinal</span>
          <span>
            <Link href="/docs">Docs</Link>
            {" · "}
            <a href={API_BASE_URL} target="_blank" rel="noreferrer">API</a>
          </span>
          <span>Release {RELEASE_SHA}</span>
        </div>
        <div className="page-width footer-update">
          LAST UPDATE - 20 Nov 2026 20:15 GST · Production YOLO26m Active
        </div>
      </footer>
    </div>
  );
}
