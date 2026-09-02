import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, FileImage, ImageOff, LoaderCircle, Upload, Waves, X } from "lucide-react";
import { Link } from "wouter";
import {
  API_BASE_URL,
  averageConfidence,
  formatDuration,
  formatPercent,
  getHealth,
  maxConfidence,
  prepareImageForUpload,
  requestDetection,
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

function DetectionOverlay({ result }: { result: DetectionResponse }) {
  const classNames = Array.from(new Set(result.detections.map((d) => d.className)));
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
            <text className="det-label" x={det.bbox.x1 + 5} y={Math.max(15, det.bbox.y1 - 6)}>
              {det.className} {formatPercent(det.confidence)}
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
  const [error, setError] = useState<string | null>(null);
  const [resizeNotice, setResizeNotice] = useState<string | null>(null);
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

  // ── File selection with auto-compression ──────────────────────────────────
  const selectFile = useCallback(async (candidate?: File) => {
    if (!candidate) return;
    if (candidate.type && !SUPPORTED_TYPES.has(candidate.type)) {
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
        setResizeNotice(`Image resized from ${fromMb} MB to fit the 8 MB upload limit.`);
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

  // ── Run detection (optionally forcing past scene block) ───────────────────
  const runDetection = useCallback(async (force = false) => {
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
      const res = await requestDetection(file, "yolo26s", controller.signal, force);

      // Hard-blocked by scene check and user didn't force
      if (res.sceneRelevance.verdict === "block" && !force) {
        setResult(res);
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

  const meanConf = useMemo(() => averageConfidence(result?.detections ?? []), [result]);
  const topConf  = useMemo(() => maxConfidence(result?.detections ?? []), [result]);

  const serviceLabel =
    health?.status === "healthy" ? "Inference service available" :
    health ? "Inference service needs attention" :
    "Checking inference service…";

  const classNames = result ? Array.from(new Set(result.detections.map((d) => d.className))) : [];
  const colorMap = Object.fromEntries(classNames.map((c, i) => [c, classColor(c, i)]));

  // Soft-warn: scene checker said "warn" but detection ran anyway
  const sceneWarn = status === "complete" && result?.sceneRelevance.verdict === "warn";

  return (
    <div className="app-shell">
      {/* Header */}
      <header>
        <div className="page-width topbar">
          <div className="topbar-left">
            <a className="brand" href="/" aria-label="Sentinal AI home">
              <span className="brand-mark"><Waves size={18} /></span>
              Sentinal AI
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
              Upload a coastal image and use the supplied YOLO26s marine-litter detector to identify the
              trained <strong>litter</strong> class, quantify confidence, and review every marked instance.
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
                <span className="panel-constraint">JPEG, PNG, WebP · max 8 MB</span>
              </div>

              {/* Compressing spinner */}
              {status === "compressing" && (
                <div className="result-empty" style={{ minHeight: 160 }}>
                  <LoaderCircle className="spin" size={22} />
                  <div><h3>Preparing image…</h3><p>Resizing to fit upload limits.</p></div>
                </div>
              )}

              {status !== "compressing" && !previewUrl && (
                <button
                  type="button"
                  className={`dropzone${dragActive ? " dropzone--active" : ""}`}
                  onClick={() => inputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={(e) => { e.preventDefault(); setDragActive(false); void selectFile(e.dataTransfer.files?.[0]); }}
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
                <span>YOLO26s · single-class litter detector</span>
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
                      ? result.count > 0 ? "Read the findings" : "No litter found"
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
                    <p>The service is checking for the litter class.</p>
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
                        disabled={status === "scanning"}
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
                      {result.modelLabel} · {result.runtime.device.toUpperCase()} ·{" "}
                      {formatDuration(result.inferenceTimeSec)} · input {result.runtime.inputSize}px ·
                      mean {formatPercent(meanConf)} · threshold{" "}
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
          <span>Sentinal AI</span>
          <span>
            <Link href="/docs">Docs</Link>
            {" · "}
            <a href={API_BASE_URL} target="_blank" rel="noreferrer">API</a>
          </span>
          <span>Release {RELEASE_SHA}</span>
        </div>
        <div className="page-width footer-update">
          LAST UPDATE - 02 Sep 2026 17:53 GST
        </div>
      </footer>
    </div>
  );
}
