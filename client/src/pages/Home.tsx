import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Cpu,
  FileImage,
  LoaderCircle,
  Radar,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Upload,
  Waves,
  X,
} from "lucide-react";
import {
  API_BASE_URL,
  averageConfidence,
  formatDuration,
  formatPercent,
  getHealth,
  requestDetection,
  type DetectionApiError,
  type DetectionResponse,
  type HealthResponse,
  type ModelId,
} from "@/lib/detection";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const modelCards: Array<{ id: ModelId; name: string; meta: string; description: string }> = [
  { id: "yolo26s", name: "YOLO26s", meta: "Precision profile", description: "Bundled trained litter checkpoint" },
  { id: "yolo26n", name: "YOLO26n", meta: "Speed profile", description: "Optional nano checkpoint" },
];

function ApiStatus({ health }: { health: HealthResponse | null }) {
  if (!health) {
    return <span className="api-status api-status--checking"><LoaderCircle size={13} /> Checking inference service</span>;
  }
  if (health.status === "healthy") {
    return <span className="api-status api-status--online"><span className="status-pulse" /> Inference service online</span>;
  }
  return <span className="api-status api-status--offline"><AlertCircle size={13} /> Service needs attention</span>;
}

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <strong className={accent ? "metric-value metric-value--accent" : "metric-value"}>{value}</strong>
    </div>
  );
}

function DetectionOverlay({ result }: { result: DetectionResponse }) {
  return (
    <svg
      aria-label={`${result.count} detection bounding boxes`}
      className="detection-overlay"
      viewBox={`0 0 ${result.imageSize.width} ${result.imageSize.height}`}
      preserveAspectRatio="none"
    >
      {result.detections.map((detection) => {
        const width = detection.bbox.x2 - detection.bbox.x1;
        const height = detection.bbox.y2 - detection.bbox.y1;
        const labelWidth = Math.max(110, Math.min(210, width));
        return (
          <g key={detection.id}>
            <rect className="detection-box" x={detection.bbox.x1} y={detection.bbox.y1} width={width} height={height} rx="3" />
            <rect className="detection-label-bg" x={detection.bbox.x1} y={Math.max(0, detection.bbox.y1 - 30)} width={labelWidth} height="27" rx="3" />
            <text className="detection-label" x={detection.bbox.x1 + 8} y={Math.max(17, detection.bbox.y1 - 11)}>
              {detection.className} {formatPercent(detection.confidence)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [model, setModel] = useState<ModelId>("yolo26s");
  const [status, setStatus] = useState<"idle" | "scanning" | "complete" | "error">("idle");
  const [result, setResult] = useState<DetectionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const selectedModel = useMemo(() => modelCards.find((entry) => entry.id === model)!, [model]);
  const modelHealth = health?.models.find((entry) => entry.id === model);
  const detectedConfidence = useMemo(() => averageConfidence(result?.detections || []), [result]);

  const refreshHealth = useCallback(async () => {
    try {
      const response = await getHealth();
      setHealth(response);
    } catch {
      setHealth({ status: "degraded", models: [] });
    }
  }, []);

  useEffect(() => {
    void refreshHealth();
  }, [refreshHealth]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      abortRef.current?.abort();
    };
  }, [previewUrl]);

  const selectFile = useCallback((candidate?: File) => {
    if (!candidate) return;
    if (!candidate.type.startsWith("image/")) {
      setError("Choose a JPEG, PNG, WebP, or another supported image file.");
      setStatus("error");
      return;
    }
    if (candidate.size > MAX_FILE_SIZE) {
      setError("This image is larger than 10 MB. Compress it and try again.");
      setStatus("error");
      return;
    }
    setFile(candidate);
    setPreviewUrl(URL.createObjectURL(candidate));
    setResult(null);
    setError(null);
    setStatus("idle");
  }, []);

  const clearWorkspace = useCallback(() => {
    abortRef.current?.abort();
    setFile(null);
    setPreviewUrl(null);
    setResult(null);
    setError(null);
    setStatus("idle");
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const runDetection = useCallback(async () => {
    if (!file) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("scanning");
    setError(null);
    setResult(null);
    try {
      const response = await requestDetection(file, model, controller.signal);
      setResult(response);
      setStatus("complete");
      void refreshHealth();
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      const apiError = caught as DetectionApiError;
      setError(apiError.message || "Detection could not be completed. Please try again.");
      setStatus("error");
      void refreshHealth();
    }
  }, [file, model, refreshHealth]);

  return (
    <div className="app-shell">
      <div className="ambient ambient--one" aria-hidden="true" />
      <div className="ambient ambient--two" aria-hidden="true" />

      <header className="topbar">
        <a className="brand" href="#workspace" aria-label="Tideline Intelligence workspace">
          <span className="brand-mark"><Waves size={20} /></span>
          <span>tideline<span className="brand-accent">.intel</span></span>
        </a>
        <div className="topbar-right">
          <ApiStatus health={health} />
          <a className="docs-link" href="#how-it-works">How it works <ArrowUpRight size={14} /></a>
        </div>
      </header>

      <main>
        <section className="hero" aria-labelledby="page-title">
          <div className="hero-copy">
            <div className="eyebrow"><Radar size={14} /> Visual intelligence for cleaner coastlines</div>
            <h1 id="page-title">See what the shoreline<br /><span>leaves behind.</span></h1>
            <p>Upload a coastal image and use a purpose-trained YOLO detector to identify litter, quantify confidence, and review every marked instance.</p>
          </div>
          <div className="hero-note" aria-label="Detection workflow">
            <span className="hero-note-label">Workflow</span>
            <span>Image → inference → review</span>
            <ChevronRight size={16} />
          </div>
        </section>

        <section id="workspace" className="workspace" aria-label="Litter detection workspace">
          <section className="source-panel panel">
            <div className="panel-header">
              <span className="panel-step">01</span>
              <div><span className="panel-overline">Source image</span><h2>Set the scene</h2></div>
            </div>

            {!previewUrl ? (
              <button
                type="button"
                className={`dropzone ${dragActive ? "dropzone--active" : ""}`}
                onClick={() => inputRef.current?.click()}
                onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(event) => { event.preventDefault(); setDragActive(false); selectFile(event.dataTransfer.files?.[0]); }}
              >
                <span className="dropzone-icon"><Upload size={22} /></span>
                <strong>Drop an image to begin</strong>
                <span>or choose a file from your device</span>
                <small>JPG, PNG, WebP · maximum 10 MB</small>
              </button>
            ) : (
              <div className="source-preview-wrap">
                <img className="source-preview" src={previewUrl} alt={`Selected image: ${file?.name || "coastal scene"}`} />
                <div className="source-preview-meta"><FileImage size={14} /><span>{file?.name}</span><button type="button" onClick={clearWorkspace} aria-label="Remove selected image"><X size={15} /></button></div>
              </div>
            )}
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => selectFile(event.target.files?.[0])} />

            <div className="model-section">
              <div className="field-heading"><span>Inference model</span><span className="field-value">{selectedModel.meta}</span></div>
              <div className="model-grid" role="radiogroup" aria-label="Inference model">
                {modelCards.map((entry) => {
                  const availability = health?.models.find((candidate) => candidate.id === entry.id);
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      role="radio"
                      aria-checked={model === entry.id}
                      onClick={() => { setModel(entry.id); setError(null); if (status === "error") setStatus("idle"); }}
                      className={`model-card ${model === entry.id ? "model-card--selected" : ""}`}
                    >
                      <span className="model-card-top"><Cpu size={15} /><span>{entry.name}</span>{availability && !availability.available && <em>asset needed</em>}</span>
                      <span className="model-card-copy">{entry.description}</span>
                    </button>
                  );
                })}
              </div>
              {modelHealth && !modelHealth.available && <p className="model-notice"><AlertCircle size={14} /> {modelHealth.detail || "This model asset is not installed on the inference service."}</p>}
            </div>

            <div className="actions">
              <button type="button" className="primary-action" disabled={!file || status === "scanning"} onClick={() => void runDetection()}>
                {status === "scanning" ? <><LoaderCircle className="spin" size={17} /> Analyzing image</> : <><Sparkles size={17} /> Analyze with {selectedModel.name}</>}
              </button>
              {file && <button type="button" className="clear-action" onClick={clearWorkspace}>Clear</button>}
            </div>

            {error && (
              <div className="error-state" role="alert">
                <AlertCircle size={18} />
                <div><strong>Analysis could not start</strong><p>{error}</p>{model === "yolo26n" && <p className="error-help">To enable YOLO26n, add its checkpoint at <code>inference-backend/models/yolo26n.pt</code> or set <code>YOLO26N_MODEL_PATH</code>.</p>}</div>
                <button type="button" onClick={() => void runDetection()} disabled={!file || status === "scanning"} aria-label="Retry detection"><RefreshCw size={16} /></button>
              </div>
            )}
          </section>

          <section className="results-panel panel" aria-live="polite">
            <div className="panel-header">
              <span className="panel-step">02</span>
              <div><span className="panel-overline">Detection review</span><h2>Read the findings</h2></div>
              {result && <span className="complete-badge"><CheckCircle2 size={14} /> Complete</span>}
            </div>

            {!previewUrl && <div className="results-empty"><span className="empty-orbit"><Radar size={30} /></span><h3>Waiting for an image</h3><p>Your annotated result, confidence metrics, and itemized findings will appear here.</p></div>}
            {previewUrl && status === "scanning" && <div className="analysis-pending"><div className="scan-window"><img src={previewUrl} alt="Image currently being analyzed" /><span className="scanner-line" /></div><LoaderCircle className="spin" size={18} /><strong>Running shoreline analysis</strong><p>The selected model is locating litter instances and calculating confidence.</p></div>}
            {previewUrl && status !== "scanning" && !result && <div className="results-empty results-empty--compact"><span className="empty-orbit"><FileImage size={26} /></span><h3>Image is ready</h3><p>Choose a model and start the analysis when ready.</p></div>}

            {previewUrl && result && status === "complete" && (
              <div className="result-content">
                <div className="annotated-image">
                  <img src={previewUrl} alt="Uploaded scene with litter detection boundaries" />
                  <DetectionOverlay result={result} />
                  <div className="image-key"><span /><span>Detected litter</span></div>
                </div>
                <div className="result-meta"><span><Cpu size={13} /> {result.modelLabel}</span><span><ShieldCheck size={13} /> Coordinates retained</span></div>
                <div className="metrics-grid">
                  <Metric label="Items detected" value={String(result.count).padStart(2, "0")} accent />
                  <Metric label="Mean confidence" value={formatPercent(detectedConfidence)} />
                  <Metric label="Inference time" value={formatDuration(result.inferenceTimeSec)} />
                </div>
                <div className="findings-header"><div><span className="panel-overline">Instances</span><h3>Detection ledger</h3></div><span>{result.count} total</span></div>
                {result.detections.length === 0 ? (
                  <div className="no-detections"><CheckCircle2 size={19} /><div><strong>No litter detected</strong><p>No instances met the configured confidence threshold for this image.</p></div></div>
                ) : (
                  <ol className="detection-list">
                    {[...result.detections].sort((a, b) => b.confidence - a.confidence).map((detection, index) => (
                      <li key={detection.id}>
                        <span className="row-index">{String(index + 1).padStart(2, "0")}</span>
                        <span className="row-class">{detection.className}</span>
                        <span className="row-coordinates">{Math.round(detection.bbox.x1)}, {Math.round(detection.bbox.y1)} → {Math.round(detection.bbox.x2)}, {Math.round(detection.bbox.y2)}</span>
                        <span className="confidence-track"><span style={{ width: `${detection.confidence * 100}%` }} /></span>
                        <strong className="row-confidence">{formatPercent(detection.confidence)}</strong>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </section>
        </section>

        <section id="how-it-works" className="method-strip">
          <div><span className="eyebrow">Built for review</span><h2>A focused path from field image to evidence.</h2></div>
          <div className="method-points"><span><b>01</b> Secure image upload</span><span><b>02</b> Server-side YOLO inference</span><span><b>03</b> Box-level inspection</span></div>
          <span className="api-footnote">API: {API_BASE_URL}</span>
        </section>
      </main>

      <footer><span>tideline.intel · litter detection workstation</span><span>YOLO-powered visual analysis</span></footer>
    </div>
  );
}
