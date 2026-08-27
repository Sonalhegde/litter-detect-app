import { useMemo } from "react";
import { Activity, BookOpen, Boxes, Braces, Database, FileCheck2, GitBranch, LockKeyhole, Network, ShieldCheck } from "lucide-react";

export type DocumentationTopicId = "overview" | "how-it-works" | "architecture" | "yolo26" | "model-family" | "dataset" | "data-cleaning" | "training" | "metrics" | "security" | "api" | "deployment" | "limitations" | "future-work" | "credits";

type Topic = { id: DocumentationTopicId; label: string; eyebrow: string; title: string; summary: string; icon: typeof BookOpen };

export const documentationTopics: Topic[] = [
  { id: "overview", label: "Overview", eyebrow: "Research scope", title: "Marine-debris detection, with boundaries made explicit.", summary: "BlueSentinel AI is a single-class object-detection prototype. It identifies only the trained `litter` class; it does not classify a scene, identify material type, or prove environmental impact.", icon: BookOpen },
  { id: "how-it-works", label: "How It Works", eyebrow: "Method", title: "From a selected image to reviewable coordinates.", summary: "The browser validates a selected image, sends a multipart request to the inference API, and overlays only the returned bounding boxes on the original local preview. The API returns no generated annotation image and does not persist uploads.", icon: Activity },
  { id: "architecture", label: "Architecture Diagram", eyebrow: "System design", title: "A narrow, traceable inference path.", summary: "Each stage has a deliberate boundary: the browser supplies untrusted image bytes, the API validates and normalizes them in memory, a configured local checkpoint performs inference, and typed JSON drives safe text and SVG rendering.", icon: Network },
  { id: "yolo26", label: "YOLO26", eyebrow: "Model context", title: "Object detection rather than general scene understanding.", summary: "The application uses the supplied YOLO26s checkpoint through Ultralytics. YOLO detection predicts bounding boxes and a confidence score for the checkpoint’s trained class. Confidence is a model score, not a probability of environmental truth.", icon: Boxes },
  { id: "model-family", label: "Model Family", eyebrow: "Variant registry", title: "One installed checkpoint; four honest placeholders.", summary: "The selector exposes YOLO26n, YOLO26s, YOLO26m, YOLO26l, and YOLO26x so future controlled experiments have a consistent interface. Only the supplied YOLO26s checkpoint is installed; the other choices remain unavailable until genuine compatible weights are deployed.", icon: GitBranch },
  { id: "dataset", label: "Dataset", eyebrow: "Declared data", title: "Reported split sizes are not a substitute for access to labels.", summary: "The supplied project reports 2,765 training images, 864 validation images, and 852 locked test images for one `litter` class. The image set and locked test labels were not included with this deployment, so independent test-set metrics are pending.", icon: Database },
  { id: "data-cleaning", label: "Data Cleaning", eyebrow: "Reproducibility", title: "Data-cleaning provenance is currently incomplete.", summary: "No authoritative preprocessing log, source attribution, or class-audit record was supplied with the checkpoint. BlueSentinel therefore does not claim deduplication, leakage control, annotation review, or augmentation settings beyond what can be independently reproduced from a provided training record.", icon: FileCheck2 },
  { id: "training", label: "Training", eyebrow: "Training record", title: "Known settings are reported as supplied, not reconstructed.", summary: "The supplied record describes a 109-epoch training run lasting approximately 4.24 hours, with the selected checkpoint around epoch 89 and a nominal 1280-pixel training image size. These details should be verified against the original experiment artifacts before academic publication.", icon: Braces },
  { id: "metrics", label: "Metrics", eyebrow: "Validation evidence", title: "Validation figures are not final test figures.", summary: "The supplied validation analysis reports peak precision 61.89%, recall 53.61%, mAP@50 55.44%, and mAP@50–95 27.16%. BlueSentinel labels these as validation-only. Precision, recall, F1, mAP, threshold curves, and latency on the locked 852-image test split remain PENDING TEST-SET EVALUATION.", icon: Activity },
  { id: "security", label: "Security & Reliability", eyebrow: "Defensive controls", title: "Designed to reject untrusted input before inference.", summary: "The API verifies JPEG, PNG, and WebP content bytes; caps upload size and decoded image dimensions; limits public request frequency; serializes CPU inference; uses a fixed model allowlist; verifies the trusted YOLO26s checksum; and returns safe structured errors. Uploaded images remain in request memory only and are not stored by the application.", icon: ShieldCheck },
  { id: "api", label: "API", eyebrow: "Integration contract", title: "A small typed surface for status and detection.", summary: "`GET /health` reports five-model availability, while `POST /v1/detections` accepts a `file` plus an allowlisted optional `model`. Compatibility aliases exist at `GET /api/model` and `POST /api/detect/image`. Errors distinguish malformed requests, unsupported media, size limits, busy inference, rate limiting, and unavailable models without exposing internal paths.", icon: Braces },
  { id: "deployment", label: "Deployment", eyebrow: "Runtime", title: "Static frontend, isolated inference backend.", summary: "The public frontend is hosted on Vercel and calls a separately deployed Render FastAPI service through a configured inference URL. Production CORS permits only the documented frontend origin. Render runs CPU inference with a lower 640-pixel input setting to reduce free-instance memory pressure; this is a deployment trade-off, not an accuracy claim.", icon: Network },
  { id: "limitations", label: "Limitations", eyebrow: "Interpretation", title: "Use the output as a model signal, not a field decision by itself.", summary: "The model is single-class and may miss small, occluded, underwater, low-contrast, or out-of-distribution debris, and it may emit false positives. A zero-detection result means no object crossed the configured threshold; it does not prove the scene contains no debris or no objects.", icon: LockKeyhole },
  { id: "future-work", label: "Future Work", eyebrow: "Next evidence", title: "Improve evidence before expanding claims.", summary: "Priority work includes acquiring the locked labeled test set, independently calculating test metrics and confidence-threshold trade-offs, recording data provenance, benchmarking CPU latency at safe input sizes, deploying additional genuine variant weights, and replacing the per-instance limiter with a shared edge control if traffic increases.", icon: GitBranch },
  { id: "credits", label: "Credits", eyebrow: "Acknowledgements", title: "Technology acknowledgements and attribution boundaries.", summary: "BlueSentinel AI uses Ultralytics and PyTorch for inference; FastAPI and Uvicorn for the API; React and Vite for the frontend; and Pillow plus the compatible OpenCV runtime required by the inference stack. Dataset attribution remains incomplete because no authoritative creator or source record was supplied.", icon: BookOpen },
];

function ArchitectureDiagram() {
  const stages = [
    ["01", "Browser", "Client-side file-size/type check"],
    ["02", "Vercel UI", "Multipart request and safe response rendering"],
    ["03", "Render API", "CORS, request limits, safe error envelopes"],
    ["04", "Image gate", "Verified decode, dimensions and pixel cap"],
    ["05", "YOLO26s", "Checksum-pinned local checkpoint; one inference at a time"],
    ["06", "Review", "Typed JSON, original image preview, SVG boxes"],
  ];
  return <div className="architecture-diagram" role="img" aria-label="Browser to Vercel user interface to Render API to image validation to trusted YOLO26s inference to browser review">
    {stages.map(([number, name, detail], index) => <div className="architecture-stage" key={name}>
      <span className="architecture-number">{number}</span><strong>{name}</strong><small>{detail}</small>{index < stages.length - 1 && <span className="architecture-arrow" aria-hidden="true">→</span>}
    </div>)}
  </div>;
}

function DetailContent({ topicId }: { topicId: DocumentationTopicId }) {
  const content = useMemo(() => documentationTopics.find((topic) => topic.id === topicId)!, [topicId]);
  const Icon = content.icon;
  return <article className="documentation-detail" aria-live="polite">
    <div className="documentation-detail-title"><span className="documentation-icon"><Icon size={17} /></span><div><span className="panel-overline">{content.eyebrow}</span><h3>{content.title}</h3></div></div>
    <p>{content.summary}</p>
    {topicId === "architecture" && <ArchitectureDiagram />}
    {topicId === "model-family" && <div className="variant-table" role="table" aria-label="Model availability"><div role="row" className="variant-table-head"><span role="columnheader">Variant</span><span role="columnheader">Deployment state</span><span role="columnheader">Purpose</span></div><div role="row"><strong role="cell">YOLO26s</strong><span role="cell" className="ready-state">Installed</span><span role="cell">Supplied marine-litter checkpoint</span></div>{["YOLO26n", "YOLO26m", "YOLO26l", "YOLO26x"].map((variant) => <div role="row" key={variant}><strong role="cell">{variant}</strong><span role="cell" className="pending-state">Not available yet</span><span role="cell">Genuine compatible checkpoint required</span></div>)}</div>}
    {topicId === "metrics" && <div className="metric-disclosure"><span>Supplied validation metrics</span><div><b>61.89%</b><small>Precision</small></div><div><b>53.61%</b><small>Recall</small></div><div><b>55.44%</b><small>mAP@50</small></div><div><b>27.16%</b><small>mAP@50–95</small></div></div>}
    {topicId === "security" && <div className="security-grid"><span>Content-based image verification</span><span>Size, dimension, and pixel limits</span><span>Checksum-pinned local model</span><span>Safe structured error responses</span><span>Rate limit and single-inference gate</span><span>No persistent image storage</span></div>}
  </article>;
}

export function DocumentationCenter({ activeTopic, onTopicChange }: { activeTopic: DocumentationTopicId; onTopicChange: (topic: DocumentationTopicId) => void }) {
  return <section id="documentation" className="docs-index" aria-labelledby="docs-title">
    <div><span className="eyebrow">Documentation</span><h2 id="docs-title">Research notes for reproducible review.</h2></div>
    <p>Read project methods, system architecture, data boundaries, security controls, and limitations without leaving BlueSentinel AI.</p>
    <nav className="docs-menu" aria-label="Documentation menu">{documentationTopics.map((topic) => <button key={topic.id} type="button" className={activeTopic === topic.id ? "docs-menu-button docs-menu-button--active" : "docs-menu-button"} onClick={() => onTopicChange(topic.id)}>{topic.label}</button>)}</nav>
    <DetailContent topicId={activeTopic} />
  </section>;
}
