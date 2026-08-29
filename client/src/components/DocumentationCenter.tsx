import { BookOpen, Code2, ExternalLink, Info, Mail, UserRound } from "lucide-react";

export type DocumentationTopicId = "overview" | "how-it-works" | "model" | "api" | "limitations" | "credits";

type Topic = { id: DocumentationTopicId; label: string; icon: typeof BookOpen };

export const documentationTopics: Topic[] = [
  { id: "overview", label: "Overview", icon: BookOpen },
  { id: "how-it-works", label: "How it works", icon: Info },
  { id: "model", label: "Model", icon: Code2 },
  { id: "api", label: "API reference", icon: Code2 },
  { id: "limitations", label: "Limitations", icon: Info },
  { id: "credits", label: "Credits", icon: UserRound },
];

function DetailContent({ topicId }: { topicId: DocumentationTopicId }) {
  switch (topicId) {
    case "how-it-works":
      return <><h3>How it works</h3><p>Select a JPEG, PNG, or WebP image. The browser sends it to the FastAPI inference service, which validates and decodes the image, resizes it with the model’s letterbox preprocessing, and runs the deployed YOLO26s checkpoint. The response contains bounding boxes and confidence scores; the browser draws those boxes over your local preview.</p><p>Uploads are processed in memory and are not stored by this application.</p></>;
    case "model":
      return <><h3>Model</h3><p>The deployed model is YOLO26s, a single-class object detector trained or fine-tuned to identify <strong>litter</strong>. The repository includes the supplied checkpoint and a checksum-verified ONNX artifact for CPU inference. The original training dataset and full provenance record were not included, so this project does not claim a more specific dataset attribution.</p><p>The other YOLO26 variants are not presented as selectable features because compatible checkpoints are not installed.</p></>;
    case "api":
      return <><h3>API reference</h3><p>Check service status with <code>GET /health</code>. Run detection with <code>POST /v1/detections</code> using multipart fields <code>file</code> and optional <code>model=yolo26s</code>. The response includes <code>detections</code>, <code>count</code>, <code>image_size</code>, <code>inference_time_sec</code>, and runtime settings. Compatibility aliases are available at <code>GET /api/model</code> and <code>POST /api/detect/image</code>.</p><pre>{`curl -X POST https://litter-detect-inference.onrender.com/v1/detections \\\n  -F "file=@shoreline.jpg" \\\n  -F "model=yolo26s"`}</pre></>;
    case "limitations":
      return <><h3>Limitations</h3><p>This is a single-class detector. It does not identify material type, estimate environmental impact, or replace field inspection. Results can change with lighting, camera angle, distance, occlusion, image quality, and background conditions. A zero-detection response means no box crossed the configured confidence threshold; it does not prove that an image contains no litter.</p><p>The output has not been validated for scientific, environmental-regulatory, or operational decision-making.</p></>;
    case "credits":
      return <><h3>Credits</h3><p><strong>Built by Sonal Hegde.</strong> See the <a href="https://github.com/Sonalhegde" target="_blank" rel="noreferrer">GitHub profile <ExternalLink size={13} /></a>. LinkedIn and email details can be added here by the project owner.</p><p><strong>With thanks to Dr. Sachinandan Dutta</strong>, Assistant Professor, for guidance on the project. His areas of interest include fisheries management, ecosystem modelling, and marine ecology.</p><p className="credit-contact"><Mail size={14} /> s.dutta@squ.edu.om</p></>;
    default:
      return <><h3>Overview</h3><p>Shoreline Litter Detector is a small web tool for reviewing coastal photographs. Upload an image and it runs a YOLO26s model that looks for the trained <strong>litter</strong> class, then shows each returned box and confidence score.</p><p>The project keeps the interface intentionally simple so the result is easy to inspect and the model’s limits are clear.</p></>;
  }
}

export function DocumentationCenter({ activeTopic, onTopicChange }: { activeTopic: DocumentationTopicId; onTopicChange: (topic: DocumentationTopicId) => void }) {
  return <section id="documentation" className="docs-section" aria-labelledby="docs-title">
    <div className="docs-heading"><div><span className="section-kicker">Documentation</span><h2 id="docs-title">How this tool works</h2></div><p>Plain-language notes about the detector, its API, and its limits.</p></div>
    <nav className="docs-menu" aria-label="Documentation sections">{documentationTopics.map((topic) => { const Icon = topic.icon; return <button key={topic.id} type="button" className={activeTopic === topic.id ? "docs-menu-button docs-menu-button--active" : "docs-menu-button"} onClick={() => onTopicChange(topic.id)}><Icon size={15} />{topic.label}</button>; })}</nav>
    <article className="documentation-detail" aria-live="polite"><DetailContent topicId={activeTopic} /></article>
  </section>;
}

export default DocumentationCenter;

export const documentationContactIcons = { Mail };
