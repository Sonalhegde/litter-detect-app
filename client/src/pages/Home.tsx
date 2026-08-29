import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, FileImage, LoaderCircle, Upload, Waves, X } from "lucide-react";
import { Link } from "wouter";
import {
  API_BASE_URL,
  averageConfidence,
  formatDuration,
  formatPercent,
  getHealth,
  maxConfidence,
  requestDetection,
  type DetectionApiError,
  type DetectionResponse,
  type HealthResponse,
} from "@/lib/detection";

const MAX_FILE_SIZE = 4 * 1024 * 1024;
const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const RELEASE_SHA = __RELEASE_SHA__;

// Deterministic per-class colour from the CSS token palette
const CLASS_COLORS = [
  "var(--cls-0)", "var(--cls-1)", "var(--cls-2)", "var(--cls-3)",
  "var(--cls-4)", "var(--cls-5)", "var(--cls-6)", "var(--cls-7)",
];
function classColor(className: string, index: number) {
  // Stable hash so the same class name always gets the same colour
  let h = 0;
  for (let i = 0; i < className.length; i++) h = ((h << 5) - h + className.charCodeAt(i)) | 0;
  return CLASS_COLORS[Math.abs(h) % CLASS_COLORS.length] ?? CLASS_COLORS[index % CLASS_COLORS.length];
}

function DetectionOverlay({ result }: { result: DetectionResponse }) {
  // Build a stable class→colour map
  const classNames = [...new Set(result.detections.map((d) => d.className))];
  const colorMap = Object.fromEntries(classNames.map((c, i) => [c, classColor(c, i)]));

  return (
    <svg
      aria-label={`${result.count} detection bounding ${result.count === 1 ? "box" : "boxes"}`}
      className="detection-overlay"
      viewBox={`0 0 ${result.imageSize.width} ${result.imageSize.height}`}
      preserveAspectRatio="none"
    >
      {result.detections.map((det) => {
        const w = det.bbox.x2 - det.bbox.x1;
        const h = det.bbox.y2 - det.bbox.y1;
        const color = colorMap[det.className] ?? "var(--cls-0)";
        return (
          <g key={det.id}>
            <rect
              className="det-box"
              x={det.bbox.x1} y={det.bbox.y1} width={w} height={h} rx="3"
              style={{ stroke: color }}
            />
            <text
              className="det-label"
              x={det.bbox.x1 + 5}
              y={Math.max(15, det.bbox.y1 - 6)}
            >
              {det.className} {formatPercent(det.confidence)}
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
  const [status, setStatus] = useState<"idle" | "scanning" | "complete" | "error">("idle");
  const [result, setResult] = useState<DetectionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refreshHealth = useCallback(async () => {
    try { setHealth(await getHealth()); }
    catch { setHealth({ status: "degraded", models: [] }); }
  }, []);

  useEffect(() => { void refreshHealth(); }, [refreshHealth]);
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    abortRef.current?.abort();
  }, [previewUrl]);

  const selectFile = useCallback((candidate?: File) => {
    if (!candidate) return;
    if (candidate.type && !SUPPORTED_TYPES.has(candidate.type)) {
      setError("Choose a JPEG, PNG, or WebP image."); setStatus("error"); return;
    }
    if (candidate.size > MAX_FILE_SIZE) {
      setError("This image is larger than 4 MB. Compress it and try again."); setStatus("error"); return;
    }
    setFile(candidate);
    setPreviewUrl(URL.createObjectURL(candidate));
    setResult(null); setError(null); setStatus("idle");
  }, []);

  const clearWorkspace = useCallback(() => {
    abortRef.current?.abort();
    setFile(null); setPreviewUrl(null); setResult(null); setError(null); setStatus("idle");
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const runDetection = useCallback(async () => {
    if (!file) return;
    const modelEntry = health?.models.find((m) => m.id === "yolo26s");
    if (modelEntry && !modelEntry.available) {
      setError(modelEntry.detail ?? "The YOLO26s checkpoint is unavailable.");
      setStatus("error"); return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("scanning"); setError(null); setResult(null);
    try {
      setResult(await requestDetection(file, "yolo26s", controller.signal));
      setStatus("complete");
      void refreshHealth();
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError((caught as DetectionApiError).message ?? "Detection could not be completed. Please try again.");
      setStatus("error");
      void refreshHealth();
    }
  }, [file, health, refreshHealth]);

  const meanConf = useMemo(() => averageConfidence(result?.detections ?? []), [result]);
  const topConf  = useMemo(() => maxConfidence(result?.detections ?? []), [result]);

  const serviceLabel =
    health?.status === "healthy" ? "Inference service available" :
    health ? "Inference service needs attention" :
    "Checking inference service…";

  // Build class→colour map for the results list
  const classNames = result ? [...new Set(result.detections.map((d) => d.className))] : [];
  const colorMap = Object.fromEntries(classNames.map((c, i) => [c, classColor(c, i)]));

  return (
    <div className="app-shell">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header>
        <div className="page-width topbar">
          <div className="topbar-left">
            <a className="brand" href="/" aria-label="Sentinel home">
              <span className="brand-mark"><Waves size={17} /></span>
              Sentinel
            </a>
            <Link className="nav-link" href="/docs">Docs</Link>
          </div>
          <span className="service-status">{serviceLabel}</span>
        </div>
      </header>

      {/* ── Main ───────────────────────────────────────────────────────── */}
      <main>
        <div className="page-width">
          {/* Hero */}
          <section className="hero" aria-labelledby="page-title">
            <span className="kicker">Coastal image review</span>
            <h1 id="page-title">Detect litter in a shoreline photo.</h1>
            <p>
              Upload a coastal image and this tool runs a YOLO26s model trained on marine litter,
              then shows you the bounding boxes and confidence scores for what it found.
            </p>
          </section>

          {/* Workspace */}
          <section id="workspace" className="workspace" aria-label="Litter detection workspace">

            {/* Upload panel */}
            <section className="panel" aria-label="Image upload">
              <div className="panel-header">
                <div className="panel-header-meta">
                  <h2>Choose an image</h2>
                </div>
                <span className="panel-constraint">JPEG, PNG, WebP · 4 MB max</span>
              </div>

              {!previewUrl ? (
                <button
                  type="button"
                  className={`dropzone${dragActive ? " dropzone--active" : ""}`}
                  onClick={() => inputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={(e) => { e.preventDefault(); setDragActive(false); selectFile(e.dataTransfer.files?.[0]); }}
                >
                  <Upload size={22} />
                  <strong>Drop an image here</strong>
                  <span>or tap to choose a file</span>
                </button>
              ) : (
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
                onChange={(e) => selectFile(e.target.files?.[0])}
              />

              <div className="model-note">
                <strong>Model</strong>
                <span>YOLO26s · single-class litter detector</span>
              </div>

              <div className="btn-row">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!file || status === "scanning"}
                  onClick={() => void runDetection()}
                >
                  {status === "scanning"
                    ? <><LoaderCircle className="spin" size={16} /> Analyzing…</>
                    : "Run detection"}
                </button>
                {file && (
                  <button type="button" className="btn-secondary" onClick={clearWorkspace}>
                    Clear
                  </button>
                )}
              </div>

              {error && (
                <div className="error-banner" role="alert">
                  <AlertCircle size={17} style={{ flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <strong>Detection failed</strong>
                    <p>{error}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void runDetection()}
                    disabled={!file || status === "scanning"}
                    aria-label="Retry detection"
                  >
                    Retry
                  </button>
                </div>
              )}
            </section>

            {/* Result panel */}
            <section className="panel" aria-label="Detection result" aria-live="polite">
              <div className="panel-header">
                <div className="panel-header-meta">
                  <h2>
                    {status === "complete" && result
                      ? result.count > 0 ? "Litter detected" : "No litter found"
                      : "Result"}
                  </h2>
                </div>
              </div>

              {/* Empty — no file chosen */}
              {!previewUrl && (
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
                    <p>The service is checking for the litter class.</p>
                  </div>
                </div>
              )}

              {/* Ready — file chosen, not yet run */}
              {previewUrl && status !== "scanning" && !result && (
                <div className="result-empty">
                  <FileImage size={28} />
                  <div>
                    <h3>Ready to analyze</h3>
                    <p>Run detection to see the model output.</p>
                  </div>
                </div>
              )}

              {/* Complete */}
              {result && status === "complete" && (
                <div>
                  <div className="annotated-wrap">
                    <img src={previewUrl!} alt="Uploaded scene" />
                    <DetectionOverlay result={result} />
                  </div>

                  <div className="result-stats">
                    <div className="stat-tile">
                      <strong>{result.count}</strong>
                      <span>{result.count === 1 ? "item" : "items"} detected</span>
                    </div>
                    <div className="stat-tile">
                      <strong>{formatPercent(topConf)}</strong>
                      <span>highest confidence</span>
                    </div>
                  </div>

                  {result.detections.length > 0 ? (
                    <ol className="detection-list">
                      {[...result.detections]
                        .sort((a, b) => b.confidence - a.confidence)
                        .map((det) => (
                          <li key={det.id}>
                            <span className="det-class">
                              <span
                                className="det-swatch"
                                style={{ background: colorMap[det.className] ?? "var(--cls-0)" }}
                              />
                              {det.className}
                            </span>
                            <span className="det-confidence">{formatPercent(det.confidence)}</span>
                          </li>
                        ))}
                    </ol>
                  ) : (
                    <div className="no-detections">
                      <strong>No litter detected.</strong>
                      <p>
                        No object crossed the confidence threshold. This does not rule out litter
                        the model was not confident about.
                      </p>
                    </div>
                  )}

                  <details className="result-details">
                    <summary>Details ▾</summary>
                    <p>
                      {result.modelLabel} · {result.runtime.device.toUpperCase()} · {formatDuration(result.inferenceTimeSec)} ·
                      input {result.runtime.inputSize}px · mean confidence {formatPercent(meanConf)} ·
                      threshold {formatPercent(result.runtime.confidenceThreshold)}
                    </p>
                  </details>
                </div>
              )}
            </section>
          </section>
        </div>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer>
        <div className="page-width footer-inner">
          <span>Sentinel</span>
          <span>
            <Link href="/docs">Docs</Link>
            {" · "}
            <a href={API_BASE_URL} target="_blank" rel="noreferrer">API</a>
          </span>
          <span>Release {RELEASE_SHA}</span>
        </div>
      </footer>
    </div>
  );
}
