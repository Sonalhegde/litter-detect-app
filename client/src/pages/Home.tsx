import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle, Download, FileImage, FileJson, FileSpreadsheet,
  HelpCircle, ImageOff, LoaderCircle, Maximize2, Minus, Plus, RotateCcw, ScanSearch, Table2, Upload, Waves, X,
} from "lucide-react";
import { Link } from "wouter";
import {
  API_BASE_URL,
  formatDuration,
  formatPercent,
  getHealth,
  prepareImageForUpload,
  requestDetection,
  requestRelevance,
  type Detection,
  type DetectionApiError,
  type DetectionResponse,
  type HealthResponse,
  type RelevanceCheck,
} from "@/lib/detection";
import { StatusChip } from "@/components/detector/StatusChip";

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

// ── Status chips (spec §18) are shared: see components/detector/StatusChip ────
type MetricState = "value" | "under-progress" | "not-available";

function Metric({ label, state, children }: {
  label: string;
  state: MetricState;
  children?: React.ReactNode;
}) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      {state === "value"
        ? <span className="metric-value">{children}</span>
        : <StatusChip state={state} />}
    </div>
  );
}

function UnderProgressCard({ title, note, rows }: { title: string; note: string; rows: string[] }) {
  return (
    <div className="subpanel">
      <div className="subpanel-header">
        <h3>{title}</h3>
        <StatusChip state="under-progress" />
      </div>
      <p className="subpanel-note">{note}</p>
      <ul className="metric-rows">
        {rows.map((row) => (
          <li key={row}>
            <span>{row}</span>
            <StatusChip state="under-progress" />
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Detection canvas overlay ──────────────────────────────────────────────────
function DetectionOverlay({ detections, imageWidth, imageHeight, colorMap, selectedId, onSelect }: {
  detections: Detection[];
  imageWidth: number;
  imageHeight: number;
  colorMap: Record<string, string>;
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <svg
      aria-label={`${detections.length} detection bounding ${detections.length === 1 ? "box" : "boxes"}`}
      className="detection-overlay"
      viewBox={`0 0 ${imageWidth} ${imageHeight}`}
      preserveAspectRatio="none"
    >
      {detections.map((det) => {
        const w = det.bbox.x2 - det.bbox.x1;
        const h = det.bbox.y2 - det.bbox.y1;
        const color = colorMap[det.className] ?? "var(--cls-0)";
        const selected = det.id === selectedId;
        return (
          <g
            key={det.id}
            className={`det-group${selected ? " det-group--selected" : ""}`}
            onClick={() => onSelect(det.id)}
          >
            <rect
              className={`det-box${selected ? " det-box--selected" : ""}`}
              x={det.bbox.x1} y={det.bbox.y1} width={w} height={h} rx="3"
              style={{ stroke: color }}
              vectorEffect="non-scaling-stroke"
            />
            <text className="det-label" x={det.bbox.x1 + 5} y={Math.max(15, det.bbox.y1 - 6)} style={{ fill: color }}>
              {det.className} {formatPercent(det.confidence)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Explicit analysis state machine — spec §17 ────────────────────────────────
// No ambiguous booleans: every pipeline phase and outcome is a named state.
type AnalysisState =
  | "idle"                    // IDLE
  | "validating"              // VALIDATING (file validation + decode + preprocessing)
  | "checking-relevance"      // CHECKING_RELEVANCE (Anti-Analyzer running)
  | "relevance-uncertain"     // RELEVANCE_UNCERTAIN (user decision required)
  | "relevance-unavailable"   // RELEVANCE UNAVAILABLE (service failure ≠ unrelated)
  | "unrelated"               // UNRELATED (analysis not available)
  | "running-detector"        // RUNNING_DETECTOR
  | "detection-complete"      // DETECTION_COMPLETE (count > 0)
  | "no-detection"            // NO_DETECTION (relevant image, zero debris above threshold)
  | "analysis-failed"         // ANALYSIS_FAILED
  | "service-unavailable";    // SERVICE_UNAVAILABLE

type ImageMeta = {
  name: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
};

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

// ── Confidence histogram buckets (spec §8) ────────────────────────────────────
const CONF_BUCKETS: Array<{ label: string; min: number; max: number }> = [
  { label: "90–100%", min: 0.9, max: 1.01 },
  { label: "80–90%", min: 0.8, max: 0.9 },
  { label: "70–80%", min: 0.7, max: 0.8 },
  { label: "60–70%", min: 0.6, max: 0.7 },
  { label: "<60%", min: 0, max: 0.6 },
];

const MIN_DETECTIONS_FOR_CHART = 5;

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<ImageMeta | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [state, setState] = useState<AnalysisState>("idle");
  const [result, setResult] = useState<DetectionResponse | null>(null);
  const [relevance, setRelevance] = useState<RelevanceCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resizeNotice, setResizeNotice] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // Explicit user opt-ins (spec §12, §15) — never set silently
  const [continuedDespiteUncertain, setContinuedDespiteUncertain] = useState(false);
  const [continuedWithoutRelevance, setContinuedWithoutRelevance] = useState(false);
  const [legacyBackend, setLegacyBackend] = useState(false);

  // Detector view state
  const [view, setView] = useState<"detection" | "original">("detection");
  const [zoom, setZoom] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [threshold, setThreshold] = useState(0.25);
  const [lowConfCut, setLowConfCut] = useState(0.6);

  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const refreshHealth = useCallback(async () => {
    try { setHealth(await getHealth()); }
    catch { setHealth({ status: "degraded", models: [] }); }
  }, []);

  useEffect(() => { void refreshHealth(); }, [refreshHealth]);
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    abortRef.current?.abort();
  }, [previewUrl]);

  const resetPipeline = useCallback(() => {
    setResult(null);
    setRelevance(null);
    setSelectedId(null);
    setContinuedDespiteUncertain(false);
    setContinuedWithoutRelevance(false);
  }, []);

  // ── File selection: UPLOAD → VALIDATE → DECODE → PREPROCESS — spec §1 ─────
  const selectFile = useCallback(async (candidate?: File) => {
    if (!candidate) return;
    if (candidate.type && !SUPPORTED_TYPES.has(candidate.type)) {
      setError("Unsupported file. Choose a JPEG, PNG, or WebP image."); setState("analysis-failed"); return;
    }
    if (candidate.size === 0) {
      setError("The selected file is empty."); setState("analysis-failed"); return;
    }

    abortRef.current?.abort();
    setState("validating"); setError(null); setResizeNotice(null);

    let prepared: File;

    try {
      const preparedResult = await prepareImageForUpload(candidate);
      prepared = preparedResult.file;
      if (preparedResult.resized) {
        const fromMb = (preparedResult.originalSize / 1024 / 1024).toFixed(1);
        setResizeNotice(`Image resized from ${fromMb} MB to fit the 8 MB upload limit.`);
      }
    } catch (err) {
      setError((err as Error).message);
      setState("analysis-failed");
      return;
    }

    // Decode check — a corrupted image is rejected here, before the pipeline runs
    let width: number | null = null;
    let height: number | null = null;
    try {
      const bitmap = await createImageBitmap(prepared);
      width = bitmap.width; height = bitmap.height;
      bitmap.close();
    } catch {
      setError("The selected file could not be decoded as an image. It may be corrupted.");
      setState("analysis-failed");
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(prepared);
    setMeta({ name: prepared.name, sizeBytes: prepared.size, width, height });
    setPreviewUrl(URL.createObjectURL(prepared));
    setState("idle");
    resetPipeline();
    setZoom(1);
    setView("detection");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewUrl, resetPipeline]);

  const clearWorkspace = useCallback(() => {
    abortRef.current?.abort();
    setFile(null); setMeta(null); setPreviewUrl(null);
    setError(null); setResizeNotice(null); setZoom(1);
    setState("idle");
    resetPipeline();
    if (inputRef.current) inputRef.current.value = "";
  }, [resetPipeline]);

  // ── Phase 2: run the debris detector (only reached when relevant/allowed) ──
  const runDetectorPhase = useCallback(async () => {
    if (!file) return;
    const modelEntry = health?.models.find((m) => m.id === "yolo26s");
    if (modelEntry && !modelEntry.available) {
      setError(modelEntry.detail ?? "The detection model is unavailable.");
      setState("service-unavailable"); return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState("running-detector"); setError(null);

    try {
      const res = await requestDetection(file, "yolo26s", controller.signal, false);
      setResult(res);
      setThreshold(res.runtime.confidenceThreshold);
      // Legacy single-call fallback: the backend attached scene_relevance to the response
      if (!legacyBackend && relevance === null && res.sceneRelevance.checkerAvailable) {
        setRelevance({
          inputValid: true,
          status: res.sceneRelevance.verdict === "pass" ? "relevant"
            : res.sceneRelevance.verdict === "warn" ? "uncertain" : "unrelated",
          score: res.sceneRelevance.score,
          checkerAvailable: true,
        });
      }
      setState(res.count > 0 ? "detection-complete" : "no-detection");
      void refreshHealth();
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      const apiError = caught as DetectionApiError;
      setError(apiError.message ?? "Detection could not be completed. Please try again.");
      // Detector/service failure ≠ "no debris" — spec §22
      setState(
        apiError.category === "timeout" || apiError.category === "server_error" || apiError.category === "cors_or_network"
          ? "service-unavailable"
          : "analysis-failed"
      );
      void refreshHealth();
    }
  }, [file, health, refreshHealth, legacyBackend, relevance]);

  // ── Phase 1: Anti-Analyzer relevance check — spec §1, §2 ──────────────────
  const runAnalysis = useCallback(async () => {
    if (!file) return;
    const modelEntry = health?.models.find((m) => m.id === "yolo26s");
    if (modelEntry && !modelEntry.available) {
      setError(modelEntry.detail ?? "The detection model is unavailable.");
      setState("service-unavailable"); return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    resetPipeline();
    setError(null);
    setState("checking-relevance");

    let relevanceCheck: RelevanceCheck | null;
    try {
      relevanceCheck = await requestRelevance(file, controller.signal);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      const apiError = caught as DetectionApiError;
      setError(apiError.message ?? "The input relevance service could not be reached.");
      // Relevance service failure ≠ unrelated image — spec §13
      setState("relevance-unavailable");
      void refreshHealth();
      return;
    }

    if (relevanceCheck === null) {
      // Deployed backend predates the relevance endpoint — fall back to the
      // legacy single-call flow; the detection response still carries scene info.
      setLegacyBackend(true);
      void runDetectorPhase();
      return;
    }

    setRelevance(relevanceCheck);

    if (relevanceCheck.status === "unrelated") {
      // Stop the pipeline — spec §11. No detection, no partial analysis output.
      setState("unrelated");
      return;
    }
    if (relevanceCheck.status === "uncertain") {
      // User decision — spec §12
      setState("relevance-uncertain");
      return;
    }
    if (relevanceCheck.status === "unavailable") {
      setState("relevance-unavailable");
      return;
    }
    // relevant → continue to the detector — spec §9
    void runDetectorPhase();
  }, [file, health, refreshHealth, resetPipeline, runDetectorPhase]);

  const continueDespiteUncertain = useCallback(() => {
    setContinuedDespiteUncertain(true);
    void runDetectorPhase();
  }, [runDetectorPhase]);

  const continueWithoutRelevance = useCallback(() => {
    // Explicit user opt-in to bypass the unavailable Anti-Analyzer — spec §15
    setContinuedWithoutRelevance(true);
    void runDetectorPhase();
  }, [runDetectorPhase]);

  // ── Derived values — every number below comes from the backend response ───
  const allDetections = result?.detections ?? [];
  const detections = useMemo(
    () => allDetections.filter((d) => d.confidence >= threshold),
    [allDetections, threshold],
  );
  const lowConfCount = useMemo(
    () => detections.filter((d) => d.confidence < lowConfCut).length,
    [detections, lowConfCut],
  );

  const confidenceStats = useMemo(() => {
    if (detections.length === 0) return null;
    const values = detections.map((d) => d.confidence);
    return {
      mean: values.reduce((t, v) => t + v, 0) / values.length,
      highest: Math.max(...values),
      lowest: Math.min(...values),
    };
  }, [detections]);

  const classCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const det of detections) counts.set(det.className, (counts.get(det.className) ?? 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [detections]);

  const confidenceHistogram = useMemo(() => {
    if (detections.length < MIN_DETECTIONS_FOR_CHART) return null;
    const max = Math.max(...CONF_BUCKETS.map((b) => detections.filter((d) => d.confidence >= b.min && d.confidence < b.max).length));
    return CONF_BUCKETS.map((b) => ({
      label: b.label,
      count: detections.filter((d) => d.confidence >= b.min && d.confidence < b.max).length,
      max,
    }));
  }, [detections]);

  const colorMap = useMemo(() => {
    const names = Array.from(new Set(allDetections.map((d) => d.className)));
    return Object.fromEntries(names.map((c, i) => [c, classColor(c, i)]));
  }, [allDetections]);

  const modelEntry = health?.models.find((m) => m.id === "yolo26s") ?? null;

  const hasResult = state === "detection-complete" || state === "no-detection";
  const analysisBusy = state === "validating" || state === "checking-relevance" || state === "running-detector";

  // ── Export helpers (actual detection data only) ───────────────────────────
  const downloadBlob = useCallback((blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }, []);

  const exportJson = useCallback(() => {
    if (!result || !meta) return;
    const payload = {
      image: meta.name,
      model: result.model,
      detections: detections.map((d) => ({
        id: d.id,
        class: d.className,
        confidence: Number(d.confidence.toFixed(4)),
        bbox: [
          Math.round(d.bbox.x1), Math.round(d.bbox.y1),
          Math.round(d.bbox.x2 - d.bbox.x1), Math.round(d.bbox.y2 - d.bbox.y1),
        ],
      })),
      threshold,
      exported_at: new Date().toISOString(),
    };
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), "detections.json");
  }, [result, meta, detections, threshold, downloadBlob]);

  const exportCsv = useCallback(() => {
    if (!detections.length) return;
    const rows = [
      "Detection ID,Class,Confidence,X,Y,Width,Height",
      ...detections.map((d) =>
        `${d.id},${d.className},${(d.confidence * 100).toFixed(1)}%,` +
        `${Math.round(d.bbox.x1)},${Math.round(d.bbox.y1)},` +
        `${Math.round(d.bbox.x2 - d.bbox.x1)},${Math.round(d.bbox.y2 - d.bbox.y1)}`,
      ),
    ];
    downloadBlob(new Blob([rows.join("\n")], { type: "text/csv" }), "detections.csv");
  }, [detections, downloadBlob]);

  const exportAnnotated = useCallback(() => {
    if (!previewUrl || !result) return;
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = result.imageSize.width;
      canvas.height = result.imageSize.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const det of detections) {
        const x = det.bbox.x1, y = det.bbox.y1;
        const w = det.bbox.x2 - det.bbox.x1, h = det.bbox.y2 - det.bbox.y1;
        ctx.strokeStyle = "#10b981";
        ctx.lineWidth = Math.max(2, canvas.width / 500);
        ctx.strokeRect(x, y, w, h);
        const label = `${det.className} ${formatPercent(det.confidence)}`;
        const fontSize = Math.max(14, Math.round(canvas.width / 60));
        ctx.font = `${fontSize}px Inter, sans-serif`;
        const textWidth = ctx.measureText(label).width;
        const labelY = Math.max(fontSize, y - 6);
        ctx.fillStyle = "#10b981";
        ctx.fillRect(x, labelY - fontSize, textWidth + 10, Math.round(fontSize * 1.3));
        ctx.fillStyle = "#06130e";
        ctx.fillText(label, x + 5, labelY);
      }
      canvas.toBlob((blob) => { if (blob) downloadBlob(blob, "detections_annotated.png"); }, "image/png");
    };
    image.src = previewUrl;
  }, [previewUrl, result, detections, downloadBlob]);

  // ── Zoom controls ─────────────────────────────────────────────────────────
  const clampZoom = (z: number) => Math.min(5, Math.max(1, z));
  const zoomIn = () => setZoom((z) => clampZoom(z * 1.25));
  const zoomOut = () => setZoom((z) => clampZoom(z / 1.25));
  const resetZoom = () => setZoom(1);
  const fitToScreen = () => setZoom(1); // fit is the base layout (object-fit: contain)
  const toggleFullscreen = useCallback(() => {
    const node = canvasRef.current;
    if (!node) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void node.requestFullscreen();
  }, []);

  const relevanceLabel = relevance
    ? relevance.status === "relevant" ? "Relevant"
      : relevance.status === "uncertain" ? "Uncertain"
      : relevance.status === "unrelated" ? "Unrelated"
      : "Unavailable"
    : null;

  return (
    <div className="app-shell">
      {/* Header */}
      <header>
        <div className="page-width topbar">
          <div className="topbar-left">
            <a className="brand" href="/" aria-label="Sentinal home">
              <span className="brand-mark"><Waves size={18} /></span>
              Sentinal
            </a>
            <Link className="nav-link" href="/docs">Research notes ↗</Link>
            <Link className="nav-link" href="/evaluation">Model evaluation</Link>
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
          {/* Hero — spec §3 */}
          <section className="hero" aria-labelledby="page-title">
            <span className="kicker">
              <Waves size={14} /> MARINE DEBRIS DETECTOR
            </span>
            <h1 id="page-title">AI-powered detection and analysis of marine debris and beach litter.</h1>
            <p>
              Upload a coastal image, run the detection model, and review every marked
              instance with its actual class and confidence. Every image is first checked
              for relevance to the supported marine/coastal domain.
            </p>
            <p className="hero-model-status">
              {modelEntry
                ? <><strong>{modelEntry.label}</strong> · {modelEntry.available ? "model online" : "model unavailable"}</>
                : <>Model information — <StatusChip state="under-progress" /></>}
            </p>
          </section>

          {/* Workspace — 70/30 dashboard split, spec §20 */}
          <section id="workspace" className="workspace workspace--dashboard" aria-label="Litter detection workspace">

            {/* ════ LEFT COLUMN — upload + canvas ══════════════════════════ */}
            <div className="workspace-col">

              {/* ── Upload panel — spec §4 ──────────────────────────────── */}
              <section className="panel" aria-label="Image upload">
                <div className="panel-header">
                  <div className="panel-header-meta">
                    <span className="step-badge">01 &nbsp; SOURCE IMAGE</span>
                    <h2>Upload image</h2>
                  </div>
                  <span className="panel-constraint">JPG, JPEG, PNG, WebP · max 8 MB</span>
                </div>

                {state === "validating" && (
                  <div className="result-empty" style={{ minHeight: 160 }}>
                    <LoaderCircle className="spin" size={22} />
                    <div><h3>Validating image…</h3><p>Checking format, size, and decoding the file.</p></div>
                  </div>
                )}

                {state !== "validating" && !previewUrl && (
                  <button
                    type="button"
                    className={`dropzone${dragActive ? " dropzone--active" : ""}`}
                    onClick={() => inputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={(e) => { e.preventDefault(); setDragActive(false); void selectFile(e.dataTransfer.files?.[0]); }}
                  >
                    <Upload size={24} />
                    <strong>Drag and drop an image, or browse files</strong>
                    <span>Upload a beach or marine image to begin analysis · supported formats: JPG, PNG, WebP</span>
                  </button>
                )}

                {state !== "validating" && previewUrl && (
                  <div className="preview-wrap">
                    <img className="preview-img" src={previewUrl} alt={`Selected: ${meta?.name ?? "image"}`} />
                    <div className="preview-meta">
                      <FileImage size={14} />
                      <span>{meta?.name}</span>
                      <button type="button" onClick={clearWorkspace} aria-label="Remove image">
                        <X size={15} />
                      </button>
                    </div>
                  </div>
                )}

                {/* File metadata — only actual values, spec §4 */}
                {meta && (
                  <div className="file-meta">
                    <span>{meta.name}</span>
                    <span>
                      {meta.width !== null && meta.height !== null
                        ? `${meta.width} × ${meta.height}`
                        : <>Resolution <StatusChip state="not-available" /></>}
                    </span>
                    <span>{formatBytes(meta.sizeBytes)}</span>
                  </div>
                )}

                <input
                  ref={inputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  hidden
                  onChange={(e) => void selectFile(e.target.files?.[0])}
                />

                {resizeNotice && <p className="resize-notice">{resizeNotice}</p>}

                <div className="btn-row">
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={!file || analysisBusy}
                    onClick={() => void runAnalysis()}
                  >
                    {state === "checking-relevance"
                      ? <><LoaderCircle className="spin" size={16} /> Checking relevance…</>
                      : state === "running-detector"
                      ? <><LoaderCircle className="spin" size={16} /> Analyzing image…</>
                      : <><ScanSearch size={16} /> Analyze image</>}
                  </button>
                  {file && state !== "validating" && (
                    <>
                      <button type="button" className="btn-secondary" onClick={() => inputRef.current?.click()}>
                        Replace image
                      </button>
                      <button type="button" className="btn-secondary" onClick={clearWorkspace}>
                        Remove
                      </button>
                    </>
                  )}
                </div>

                {/* Error banners — spec §22 */}
                {(state === "analysis-failed" || state === "service-unavailable") && error && (
                  <div className="error-banner" role="alert">
                    <AlertCircle size={17} style={{ flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <strong>
                        {state === "service-unavailable" ? "Detection service unavailable" : "Detection failed"}
                      </strong>
                      <p>{error}</p>
                    </div>
                    {file && (
                      <button type="button" onClick={() => void runAnalysis()} aria-label="Try again">
                        Try again
                      </button>
                    )}
                  </div>
                )}
              </section>

              {/* ── Detection canvas — spec §5, §11, §12 ────────────────── */}
              <section className="panel" aria-label="Detection canvas">
                <div className="panel-header">
                  <div className="panel-header-meta">
                    <span className="step-badge">02 &nbsp; DETECTION CANVAS</span>
                    <h2>Detection view</h2>
                  </div>

                  {/* Original / Detection toggle — spec §11 */}
                  {previewUrl && hasResult && (
                    <div className="view-toggle" role="tablist" aria-label="Image view">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={view === "original"}
                        className={view === "original" ? "view-toggle-btn--active" : ""}
                        onClick={() => setView("original")}
                      >
                        Original
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={view === "detection"}
                        className={view === "detection" ? "view-toggle-btn--active" : ""}
                        onClick={() => setView("detection")}
                      >
                        Detection
                      </button>
                    </div>
                  )}
                </div>

                {/* Empty state — spec §23 */}
                {!previewUrl && state !== "validating" && (
                  <div className="result-empty">
                    <FileImage size={28} />
                    <div>
                      <h3>No image selected</h3>
                      <p>Upload a beach or marine image to begin analysis. Your annotated image and detection details will appear here.</p>
                    </div>
                  </div>
                )}

                {/* CHECKING_RELEVANCE — the Anti-Analyzer runs first */}
                {previewUrl && state === "checking-relevance" && (
                  <div className="result-empty">
                    <LoaderCircle className="spin" size={26} />
                    <div>
                      <h3>Checking image relevance…</h3>
                      <p>Verifying that this image belongs to the marine/coastal analysis domain before running detection.</p>
                    </div>
                  </div>
                )}

                {/* RUNNING_DETECTOR — spec §21 */}
                {previewUrl && state === "running-detector" && (
                  <div className="result-empty loading-state">
                    <LoaderCircle className="spin" size={26} />
                    <div>
                      <h3>Analyzing marine debris…</h3>
                      <ol className="loading-steps">
                        <li className="loading-step--done">Relevance check passed</li>
                        <li className="loading-step--active">Running detection</li>
                        <li>Processing results</li>
                      </ol>
                    </div>
                  </div>
                )}

                {/* Ready */}
                {previewUrl && state === "idle" && !result && (
                  <div className="result-empty">
                    <FileImage size={28} />
                    <div>
                      <h3>Ready to analyze</h3>
                      <p>Run detection to see the model output.</p>
                    </div>
                  </div>
                )}

                {/* UNRELATED — spec §11: stop the pipeline, no analysis output */}
                {state === "unrelated" && (
                  <div className="scene-block">
                    <ImageOff size={28} />
                    <div>
                      <h3>Analysis not available.</h3>
                      <p>
                        This image does not appear to belong to the supported marine/coastal
                        debris-analysis domain. Please upload a suitable beach, coastal, or
                        marine image.
                      </p>
                      {relevance?.checkerAvailable && relevance.score !== null && (
                        <p className="caption">Relevance score: {formatPercent(relevance.score)}</p>
                      )}
                      <div className="scene-block-actions">
                        <button type="button" className="btn-primary" onClick={clearWorkspace}>
                          Upload another image
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* RELEVANCE_UNCERTAIN — spec §12: user decides */}
                {state === "relevance-uncertain" && (
                  <div className="scene-block">
                    <HelpCircle size={28} />
                    <div>
                      <h3>Image relevance uncertain.</h3>
                      <p>
                        The system cannot confidently determine whether this image belongs to
                        the supported analysis domain.
                      </p>
                      {relevance?.score !== null && relevance?.score !== undefined && (
                        <p className="caption">Relevance score: {formatPercent(relevance.score)}</p>
                      )}
                      <div className="scene-block-actions">
                        <button type="button" className="btn-primary" onClick={continueDespiteUncertain}>
                          Continue analysis
                        </button>
                        <button type="button" className="btn-secondary" onClick={clearWorkspace}>
                          Upload another image
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* RELEVANCE_UNAVAILABLE — spec §13: failure ≠ unrelated */}
                {state === "relevance-unavailable" && (
                  <div className="scene-block">
                    <AlertCircle size={28} />
                    <div>
                      <h3>Relevance check unavailable.</h3>
                      <p>
                        The input relevance service could not be reached, so this image has
                        not been checked for domain relevance. This is a service issue, not a
                        verdict on your image.
                      </p>
                      <div className="scene-block-actions">
                        <button type="button" className="btn-primary" onClick={() => void runAnalysis()}>
                          Retry
                        </button>
                        <button type="button" className="btn-secondary" onClick={continueWithoutRelevance}>
                          Continue without relevance check
                        </button>
                        <button type="button" className="btn-ghost" onClick={clearWorkspace}>
                          Use a different image
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* CANVAS — actual results */}
                {previewUrl && hasResult && result && (
                  <div className="canvas-block">
                    {/* Downstream uncertainty markers — spec §12, §15 */}
                    {continuedDespiteUncertain && (
                      <div className="scene-warn" role="note">
                        <AlertCircle size={15} />
                        <p>
                          Image relevance was uncertain — you chose to continue, so treat
                          these results as unverified.
                        </p>
                      </div>
                    )}
                    {continuedWithoutRelevance && (
                      <div className="scene-warn" role="note">
                        <AlertCircle size={15} />
                        <p>
                          The relevance check was unavailable — you chose to continue, so
                          these results have not been domain-filtered and may include false
                          positives on unrelated images.
                        </p>
                      </div>
                    )}
                    {!continuedDespiteUncertain && !continuedWithoutRelevance && result.sceneRelevance.checkerAvailable === false && (
                      <div className="scene-warn" role="note">
                        <AlertCircle size={15} />
                        <p>
                          Content-relevance filtering is currently unavailable on the detection
                          service, so this image was not checked for whether it's actually a
                          shoreline photo. Detections on unrelated images may be false positives.
                        </p>
                      </div>
                    )}
                    {!continuedDespiteUncertain && !continuedWithoutRelevance && result.sceneRelevance.verdict === "warn" && (
                      <div className="scene-warn" role="note">
                        <AlertCircle size={15} />
                        <p>
                          This image scored {formatPercent(result.sceneRelevance.score)} for coastal
                          relevance — results may not be meaningful if this isn't a shoreline photo.
                        </p>
                      </div>
                    )}

                    <div className="canvas-toolbar">
                      <span className="canvas-zoom-label">{Math.round(zoom * 100)}%</span>
                      <button type="button" onClick={zoomOut} aria-label="Zoom out"><Minus size={14} /></button>
                      <button type="button" onClick={zoomIn} aria-label="Zoom in"><Plus size={14} /></button>
                      <button type="button" onClick={resetZoom} aria-label="Reset zoom"><RotateCcw size={14} /></button>
                      <button type="button" onClick={fitToScreen} aria-label="Fit to screen">Fit</button>
                      <button type="button" onClick={toggleFullscreen} aria-label="Fullscreen"><Maximize2 size={14} /></button>
                    </div>

                    <div className="canvas-stage" ref={canvasRef}>
                      <div className="canvas-stage-inner" style={{ transform: `scale(${zoom})` }}>
                        <img
                          className="canvas-img"
                          src={previewUrl}
                          alt={view === "original" ? "Uploaded image, unmodified" : "Uploaded scene with detection overlay"}
                        />
                        {view === "detection" && detections.length > 0 && (
                          <DetectionOverlay
                            detections={detections}
                            imageWidth={result.imageSize.width}
                            imageHeight={result.imageSize.height}
                            colorMap={colorMap}
                            selectedId={selectedId}
                            onSelect={setSelectedId}
                          />
                        )}
                      </div>
                    </div>
                    {view === "original" && (
                      <p className="caption canvas-note">Original uploaded image — untouched, no annotations.</p>
                    )}
                  </div>
                )}
              </section>
            </div>

            {/* ════ RIGHT COLUMN — summary + analysis panels ═══════════════ */}
            <div className="workspace-col">

              {/* ── Detection summary — spec §6 ─────────────────────────── */}
              <section className="panel" aria-label="Detection summary">
                <div className="panel-header">
                  <div className="panel-header-meta">
                    <span className="step-badge">03 &nbsp; DETECTION SUMMARY</span>
                    <h2>Results</h2>
                  </div>
                </div>

                {!hasResult ? (
                  <p className="subpanel-note">
                    Run analysis on an image to populate this summary. No values are shown
                    before an analysis has actually been performed.
                  </p>
                ) : (
                  <>
                    <div className="summary-grid">
                      <div className="stat-tile">
                        <strong>{detections.length}</strong>
                        <span>objects detected{threshold !== 0.25 ? ` at ${formatPercent(threshold)}` : ""}</span>
                      </div>
                      {confidenceStats ? (
                        <>
                          <div className="stat-tile">
                            <strong>{formatPercent(confidenceStats.highest)}</strong>
                            <span>highest confidence</span>
                          </div>
                          <div className="stat-tile">
                            <strong>{formatPercent(confidenceStats.lowest)}</strong>
                            <span>lowest confidence</span>
                          </div>
                          <div className="stat-tile">
                            <strong>{formatPercent(confidenceStats.mean)}</strong>
                            <span>average confidence</span>
                          </div>
                        </>
                      ) : (
                        <div className="stat-tile stat-tile--empty">
                          <StatusChip state="not-available" />
                          <span>no detections to summarize</span>
                        </div>
                      )}
                    </div>

                    {/* Input relevance — actual Anti-Analyzer outcome (spec §7, §18) */}
                    {relevanceLabel && (
                      <div className="metric">
                        <span className="metric-label">Input relevance</span>
                        <span className="metric-value metric-value--muted">
                          {relevanceLabel}
                          {relevance?.checkerAvailable && relevance.score !== null && ` (${formatPercent(relevance.score)})`}
                        </span>
                      </div>
                    )}

                    {/* Processing time — actual backend value only */}
                    <Metric label="Processing time (reported by backend)" state={(result?.inferenceTimeSec ?? 0) > 0 ? "value" : "not-available"}>
                      {formatDuration(result?.inferenceTimeSec ?? 0)}
                    </Metric>
                  </>
                )}
              </section>

              {/* ── Confidence threshold — spec §9 ──────────────────────── */}
              {hasResult && (
                <section className="panel" aria-label="Detection threshold">
                  <div className="panel-header">
                    <div className="panel-header-meta">
                      <span className="step-badge">04 &nbsp; DETECTION THRESHOLD</span>
                      <h2>Confidence filter</h2>
                    </div>
                  </div>
                  <div className="threshold-row">
                    <input
                      type="range"
                      min={0.05}
                      max={0.95}
                      step={0.05}
                      value={threshold}
                      onChange={(e) => setThreshold(Number(e.target.value))}
                      aria-label="Detection confidence threshold"
                    />
                    <span className="threshold-value">{formatPercent(threshold)}</span>
                  </div>
                  <p className="caption">
                    {detections.length} detection{detections.length === 1 ? "" : "s"} at threshold {formatPercent(threshold)}
                    {" "}· filters the {allDetections.length} detection{allDetections.length === 1 ? "" : "s"} actually returned by the model.
                  </p>
                </section>
              )}

              {/* ── Class breakdown — spec §7 ───────────────────────────── */}
              {hasResult && (
                <section className="panel" aria-label="Detected classes">
                  <div className="panel-header">
                    <div className="panel-header-meta">
                      <span className="step-badge">05 &nbsp; {classCounts.length === 1 ? "DETECTED CLASS" : "DETECTED CLASSES"}</span>
                      <h2>{classCounts.length === 1 ? "Detected class" : "Class breakdown"}</h2>
                    </div>
                  </div>
                  {classCounts.length === 0 ? (
                    <p className="subpanel-note">No classes to report — no detections passed the threshold.</p>
                  ) : (
                    <ul className="class-list">
                      {classCounts.map(([className, count]) => (
                        <li key={className}>
                          <span className="det-class">
                            <span className="det-swatch" style={{ background: colorMap[className] ?? "var(--cls-0)" }} />
                            {className}
                          </span>
                          <span className="class-count">{count} detection{count === 1 ? "" : "s"}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              {/* ── Confidence distribution — spec §8 ───────────────────── */}
              {hasResult && (
                <section className="panel" aria-label="Confidence distribution">
                  <div className="panel-header">
                    <div className="panel-header-meta">
                      <span className="step-badge">06 &nbsp; CONFIDENCE DISTRIBUTION</span>
                      <h2>Confidence spread</h2>
                    </div>
                  </div>
                  {confidenceHistogram ? (
                    <div className="histogram">
                      {confidenceHistogram.map((bucket) => (
                        <div key={bucket.label} className="histogram-row">
                          <span className="histogram-label">{bucket.label}</span>
                          <span className="histogram-bar-track">
                            <span
                              className="histogram-bar"
                              style={{ width: bucket.max > 0 ? `${(bucket.count / bucket.max) * 100}%` : "0%" }}
                            />
                          </span>
                          <span className="histogram-count">{bucket.count}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="subpanel-note">
                      A distribution needs more detections to be meaningful.
                      {" "}<StatusChip state="under-progress" />
                    </p>
                  )}
                </section>
              )}

              {/* ── Detection table — spec §10 ──────────────────────────── */}
              {hasResult && (
                <section className="panel" aria-label="Detection table">
                  <div className="panel-header">
                    <div className="panel-header-meta">
                      <span className="step-badge">07 &nbsp; DETAILED DETECTIONS</span>
                      <h2><Table2 size={16} style={{ verticalAlign: "-2px" }} /> Detection table</h2>
                    </div>
                  </div>
                  {detections.length === 0 ? (
                    <div className="no-detections">
                      <strong>No debris detected.</strong>
                      <p>
                        The image appears relevant to the supported marine/coastal domain, but
                        no supported debris objects were detected above the current detection
                        threshold. This does not rule out debris the model was not confident about.
                      </p>
                    </div>
                  ) : (
                    <div className="table-scroll">
                      <table className="detection-table">
                        <thead>
                          <tr>
                            <th scope="col">ID</th>
                            <th scope="col">Class</th>
                            <th scope="col">Confidence</th>
                            <th scope="col">Location</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...detections].sort((a, b) => b.confidence - a.confidence).map((det) => (
                            <tr
                              key={det.id}
                              className={det.id === selectedId ? "det-row--selected" : ""}
                              onClick={() => setSelectedId(det.id === selectedId ? null : det.id)}
                            >
                              <td>{String(det.id).padStart(2, "0")}</td>
                              <td>
                                <span className="det-class">
                                  <span className="det-swatch" style={{ background: colorMap[det.className] ?? "var(--cls-0)" }} />
                                  {det.className}
                                </span>
                              </td>
                              <td>{formatPercent(det.confidence)}</td>
                              <td>
                                <button
                                  type="button"
                                  className="link-btn"
                                  onClick={(e) => { e.stopPropagation(); setSelectedId(det.id); }}
                                >
                                  View
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {detections.length > 0 && (
                    <p className="caption">Click a row or its bounding box to highlight both.</p>
                  )}
                </section>
              )}

              {/* ── Low-confidence warning — spec §13 ───────────────────── */}
              {hasResult && detections.length > 0 && (
                <section className="panel" aria-label="Low confidence warning">
                  <div className="panel-header">
                    <div className="panel-header-meta">
                      <span className="step-badge">08 &nbsp; UNCERTAINTY</span>
                      <h2>Low-confidence check</h2>
                    </div>
                  </div>
                  <div className="threshold-row threshold-row--inline">
                    <label htmlFor="lowconf-cut">Flag detections below</label>
                    <input
                      id="lowconf-cut"
                      type="range"
                      min={0.3}
                      max={0.9}
                      step={0.05}
                      value={lowConfCut}
                      onChange={(e) => setLowConfCut(Number(e.target.value))}
                    />
                    <span className="threshold-value">{formatPercent(lowConfCut)}</span>
                  </div>
                  {lowConfCount > 0 ? (
                    <div className="scene-warn" role="note">
                      <AlertCircle size={15} />
                      <p>
                        <strong>Possible uncertain detection{lowConfCount === 1 ? "" : "s"}.</strong>{" "}
                        {lowConfCount} detection{lowConfCount === 1 ? " has" : "s have"} confidence below{" "}
                        {formatPercent(lowConfCut)}. These low-confidence predictions should be
                        manually verified.
                      </p>
                    </div>
                  ) : (
                    <p className="caption">No detections fall below the current low-confidence cut-off.</p>
                  )}
                </section>
              )}

              {/* ── Model information — spec §15 (actual metadata only) ─── */}
              <section className="panel" aria-label="Model information">
                <div className="panel-header">
                  <div className="panel-header-meta">
                    <span className="step-badge">09 &nbsp; MODEL INFORMATION</span>
                    <h2>Model details</h2>
                  </div>
                </div>
                {modelEntry ? (
                  <div className="metric-rows">
                    <div className="metric"><span className="metric-label">Model</span><span className="metric-value">{modelEntry.label}</span></div>
                    <Metric label="Architecture" state="under-progress" />
                    <Metric label="Version" state="under-progress" />
                    <div className="metric">
                      <span className="metric-label">Classes</span>
                      <span className="metric-value metric-value--muted">
                        {modelEntry.classes?.length ? modelEntry.classes.join(", ") : <StatusChip state="under-progress" />}
                      </span>
                    </div>
                    <div className="metric">
                      <span className="metric-label">Relevance checker</span>
                      <span className="metric-value metric-value--muted">
                        {legacyBackend
                          ? <StatusChip state="not-available" />
                          : relevance?.checkerAvailable
                          ? "online"
                          : relevance
                          ? <StatusChip state="not-available" />
                          : <StatusChip state="under-progress" />}
                      </span>
                    </div>
                    {result && (
                      <>
                        <div className="metric">
                          <span className="metric-label">Input resolution</span>
                          <span className="metric-value">{result.runtime.inputSize > 0 ? `${result.runtime.inputSize} px` : <StatusChip state="not-available" />}</span>
                        </div>
                        <div className="metric">
                          <span className="metric-label">Inference device</span>
                          <span className="metric-value">{result.runtime.device.toUpperCase()}</span>
                        </div>
                        <div className="metric">
                          <span className="metric-label">Confidence threshold (backend)</span>
                          <span className="metric-value">{formatPercent(result.runtime.confidenceThreshold)}</span>
                        </div>
                        <div className="metric">
                          <span className="metric-label">IoU threshold</span>
                          <span className="metric-value">{formatPercent(result.runtime.iouThreshold)}</span>
                        </div>
                      </>
                    )}
                    {!result && (
                      <>
                        <Metric label="Input resolution" state="under-progress" />
                        <Metric label="Inference device" state="under-progress" />
                      </>
                    )}
                  </div>
                ) : (
                  <div className="metric-rows">
                    <Metric label="Model" state="under-progress" />
                    <Metric label="Architecture" state="under-progress" />
                    <Metric label="Version" state="under-progress" />
                  </div>
                )}
              </section>

              {/* ── Image quality — spec §14 (not implemented) ──────────── */}
              <UnderProgressCard
                title="Image Quality Analysis"
                note="This metric will be available once the corresponding analysis module is implemented."
                rows={["Blur assessment", "Brightness assessment", "Visibility assessment", "Occlusion assessment"]}
              />

              {/* ── Detection history — spec §17 (not implemented) ──────── */}
              <UnderProgressCard
                title="Detection History"
                note="Persistent detection history is not implemented yet. This section will appear once session or cloud storage is connected."
                rows={["Recent analyses"]}
              />

              {/* ── Export — spec §16 ───────────────────────────────────── */}
              {hasResult && (
                <section className="panel" aria-label="Export">
                  <div className="panel-header">
                    <div className="panel-header-meta">
                      <span className="step-badge">10 &nbsp; EXPORT</span>
                      <h2>Export results</h2>
                    </div>
                  </div>
                  <div className="btn-row btn-row--wrap">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={exportAnnotated}
                      disabled={detections.length === 0}
                    >
                      <Download size={15} /> Annotated image
                    </button>
                    <button type="button" className="btn-secondary" onClick={exportJson}>
                      <FileJson size={15} /> Export JSON
                    </button>
                    <button type="button" className="btn-secondary" onClick={exportCsv} disabled={detections.length === 0}>
                      <FileSpreadsheet size={15} /> Export CSV
                    </button>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Generate report</span>
                    <StatusChip state="under-progress" />
                  </div>
                </section>
              )}
            </div>
          </section>
        </div>
      </main>

      <footer>
        <div className="page-width footer-inner">
          <span>Sentinal</span>
          <span>
            <Link href="/docs">Docs</Link>
            {" · "}
            <Link href="/evaluation">Model evaluation</Link>
            {" · "}
            <a href={API_BASE_URL} target="_blank" rel="noreferrer">API</a>
          </span>
          <span>Release {RELEASE_SHA}</span>
        </div>
        <div className="page-width footer-update">
          LAST UPDATE - 02 Sep 2026 18:35 GST
        </div>
      </footer>
    </div>
  );
}
