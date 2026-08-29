import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, FileImage, LoaderCircle, Upload, Waves, X } from "lucide-react";
import { DocumentationCenter, type DocumentationTopicId } from "@/components/DocumentationCenter";
import { API_BASE_URL, averageConfidence, formatDuration, formatPercent, getHealth, maxConfidence, requestDetection, type DetectionApiError, type DetectionResponse, type HealthResponse } from "@/lib/detection";

const MAX_FILE_SIZE = 4 * 1024 * 1024;
const SUPPORTED_BROWSER_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const RELEASE_SHA = __RELEASE_SHA__;

function DetectionOverlay({ result }: { result: DetectionResponse }) {
  return <svg aria-label={`${result.count} detection bounding boxes`} className="detection-overlay" viewBox={`0 0 ${result.imageSize.width} ${result.imageSize.height}`} preserveAspectRatio="none">
    {result.detections.map((detection) => {
      const width = detection.bbox.x2 - detection.bbox.x1;
      const height = detection.bbox.y2 - detection.bbox.y1;
      return <g key={detection.id}><rect className="detection-box" x={detection.bbox.x1} y={detection.bbox.y1} width={width} height={height} rx="3" /><text className="detection-label" x={detection.bbox.x1 + 6} y={Math.max(16, detection.bbox.y1 - 8)}>{detection.className} {formatPercent(detection.confidence)}</text></g>;
    })}
  </svg>;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "scanning" | "complete" | "error">("idle");
  const [result, setResult] = useState<DetectionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [activeDocumentation, setActiveDocumentation] = useState<DocumentationTopicId>("overview");
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refreshHealth = useCallback(async () => { try { setHealth(await getHealth()); } catch { setHealth({ status: "degraded", models: [] }); } }, []);
  useEffect(() => { void refreshHealth(); }, [refreshHealth]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); abortRef.current?.abort(); }, [previewUrl]);

  const selectFile = useCallback((candidate?: File) => {
    if (!candidate) return;
    if (candidate.type && !SUPPORTED_BROWSER_MIME_TYPES.has(candidate.type)) { setError("Choose a JPEG, PNG, or WebP image."); setStatus("error"); return; }
    if (candidate.size > MAX_FILE_SIZE) { setError("This image is larger than 4 MB. Compress it and try again."); setStatus("error"); return; }
    setFile(candidate); setPreviewUrl(URL.createObjectURL(candidate)); setResult(null); setError(null); setStatus("idle");
  }, []);

  const clearWorkspace = useCallback(() => { abortRef.current?.abort(); setFile(null); setPreviewUrl(null); setResult(null); setError(null); setStatus("idle"); if (inputRef.current) inputRef.current.value = ""; }, []);
  const runDetection = useCallback(async () => {
    if (!file) return;
    const selectedModel = health?.models.find((entry) => entry.id === "yolo26s");
    if (selectedModel && !selectedModel.available) { setError(selectedModel.detail || "The YOLO26s checkpoint is unavailable."); setStatus("error"); return; }
    abortRef.current?.abort(); const controller = new AbortController(); abortRef.current = controller; setStatus("scanning"); setError(null); setResult(null);
    try { setResult(await requestDetection(file, "yolo26s", controller.signal)); setStatus("complete"); void refreshHealth(); }
    catch (caught) { if (caught instanceof DOMException && caught.name === "AbortError") return; setError((caught as DetectionApiError).message || "Detection could not be completed. Please try again."); setStatus("error"); void refreshHealth(); }
  }, [file, health, refreshHealth]);

  const meanConfidence = useMemo(() => averageConfidence(result?.detections || []), [result]);
  const topConfidence = useMemo(() => maxConfidence(result?.detections || []), [result]);
  const apiStatus = health?.status === "healthy" ? "Inference service available" : health ? "Inference service needs attention" : "Checking inference service";

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="#workspace" aria-label="Shoreline Litter Detector"><span className="brand-mark"><Waves size={19} /></span><span>Shoreline Litter Detector</span></a><span className="service-status">{apiStatus}</span></header>
    <main>
      <section className="hero" aria-labelledby="page-title"><div><span className="section-kicker">Coastal image review</span><h1 id="page-title">Detect litter in a shoreline photo.</h1><p>Upload a coastal photo and this tool runs a YOLO26s model trained to detect litter, then shows you what it found.</p></div></section>
      <section id="workspace" className="workspace" aria-label="Litter detection workspace">
        <section className="panel source-panel"><div className="panel-heading"><div><span className="section-kicker">Upload</span><h2>Choose an image</h2></div><span className="file-note">JPG, PNG, or WebP · 4 MB max</span></div>
          {!previewUrl ? <button type="button" className={`dropzone ${dragActive ? "dropzone--active" : ""}`} onClick={() => inputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setDragActive(true); }} onDragLeave={() => setDragActive(false)} onDrop={(event) => { event.preventDefault(); setDragActive(false); selectFile(event.dataTransfer.files?.[0]); }}><Upload size={24} /><strong>Drop an image here</strong><span>or choose a file from your device</span></button> : <div className="source-preview-wrap"><img className="source-preview" src={previewUrl} alt={`Selected image: ${file?.name || "coastal scene"}`} /><div className="source-preview-meta"><FileImage size={15} /><span>{file?.name}</span><button type="button" onClick={clearWorkspace} aria-label="Remove selected image"><X size={16} /></button></div></div>}
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => selectFile(event.target.files?.[0])} />
          <div className="model-note"><strong>Model</strong><span>YOLO26s · single-class litter detector</span></div>
          <div className="actions"><button type="button" className="primary-action" disabled={!file || status === "scanning"} onClick={() => void runDetection()}>{status === "scanning" ? <><LoaderCircle className="spin" size={17} /> Analyzing image</> : "Run detection"}</button>{file && <button type="button" className="clear-action" onClick={clearWorkspace}>Clear</button>}</div>
          {error && <div className="error-state" role="alert"><AlertCircle size={18} /><div><strong>Detection failed</strong><p>{error}</p></div><button type="button" onClick={() => void runDetection()} disabled={!file || status === "scanning"} aria-label="Retry detection">Try again</button></div>}
        </section>
        <section className="panel results-panel" aria-live="polite"><div className="panel-heading"><div><span className="section-kicker">Result</span><h2>{status === "complete" ? "Detected litter" : "Your result"}</h2></div>{result && <span className="result-status"><CheckCircle2 size={15} /> Complete</span>}</div>
          {!previewUrl && <div className="results-empty"><FileImage size={30} /><h3>No image selected</h3><p>Your annotated image and detection details will appear here.</p></div>}
          {previewUrl && status === "scanning" && <div className="results-empty"><LoaderCircle className="spin" size={28} /><h3>Analyzing image</h3><p>The service is checking the image for the litter class.</p></div>}
          {previewUrl && status !== "scanning" && !result && <div className="results-empty"><FileImage size={30} /><h3>Ready to analyze</h3><p>Run detection to see the model output.</p></div>}
          {result && status === "complete" && <div className="result-content"><div className="annotated-image"><img src={previewUrl!} alt="Uploaded scene with detection boundaries" /><DetectionOverlay result={result} /></div><div className="result-summary"><div><strong>{result.count}</strong><span>{result.count === 1 ? "item" : "items"} detected</span></div><div><strong>{formatPercent(meanConfidence)}</strong><span>mean confidence</span></div><div><strong>{formatPercent(topConfidence)}</strong><span>highest confidence</span></div></div>{result.detections.length > 0 ? <ol className="detection-list">{[...result.detections].sort((a, b) => b.confidence - a.confidence).map((detection) => <li key={detection.id}><span>{detection.className}</span><strong>{formatPercent(detection.confidence)}</strong></li>)}</ol> : <div className="no-detections"><strong>No litter detected.</strong><p>No object crossed the configured confidence threshold. This does not prove the image contains no debris.</p></div>}<details className="advanced-details"><summary>Details</summary><p>{result.modelLabel} on {result.runtime.device.toUpperCase()} · {formatDuration(result.inferenceTimeSec)} · input {result.runtime.inputSize}px · threshold {formatPercent(result.runtime.confidenceThreshold)}</p></details></div>}
        </section>
      </section>
      <DocumentationCenter activeTopic={activeDocumentation} onTopicChange={setActiveDocumentation} />
    </main>
    <footer><span>Shoreline Litter Detector</span><span>API: {API_BASE_URL}</span><span>Release {RELEASE_SHA}</span></footer>
  </div>;
}
