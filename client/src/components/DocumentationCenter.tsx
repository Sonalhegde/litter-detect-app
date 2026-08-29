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
      return (
        <>
          <h3>How it works</h3>
          <p>
            Select a JPEG, PNG, or WebP image from your device. The browser sends it to the FastAPI inference service,
            which validates and decodes the image bytes with Pillow, applies a letterbox resize to fit the model's
            320&thinsp;×&thinsp;320 input, and runs the deployed YOLO26s checkpoint via ONNX Runtime on CPU.
            The model returns bounding box coordinates and a confidence score for each detected object. The service
            filters these by the configured confidence threshold (25%), runs non-maximum suppression, unscales the
            coordinates back to your original image dimensions, and sends the result to the browser.
          </p>
          <p>
            The browser draws the returned boxes as an SVG overlay on your local image preview — the original image
            is never re-downloaded. Uploads are processed in memory and not stored by this application.
          </p>
        </>
      );
    case "model":
      return (
        <>
          <h3>Model</h3>
          <p>
            The deployed model is a custom-trained YOLO26s checkpoint, a single-class object detector fine-tuned to
            identify <strong>litter</strong> in coastal and marine imagery. YOLO26s is part of the Ultralytics YOLO26
            family — a one-stage detector with a lighter detection head, DFL-free box regression, and an end-to-end
            inference path. At 9.5M fused parameters it balances speed and accuracy for CPU deployment.
          </p>
          <p>
            For deployment on Render's free CPU tier, the supplied <code>.pt</code> checkpoint was exported to a
            fixed-320 ONNX artifact. The service loads this artifact via ONNX Runtime directly, without importing
            PyTorch or Ultralytics in the request path. The artifact is checksum-pinned
            (SHA-256 <code>969bbf4…</code>) and verified on load.
          </p>
          <p>
            The training dataset appears to be a marine or coastal litter dataset in COCO-format, based on the
            class naming and image filenames in the supplied archive. The original dataset source and full
            provenance record were not included with the checkpoint, so this project does not claim a more
            specific dataset attribution. The model has one trained class: <strong>litter</strong>. It does not
            distinguish between plastic, metal, fabric, or other material types.
          </p>
          <p>
            The other YOLO26 variants (n, m, l, x) are not deployed because compatible fine-tuned checkpoints are
            not available. Only YOLO26s is offered.
          </p>
        </>
      );
    case "api":
      return (
        <>
          <h3>API reference</h3>
          <p>
            The inference service runs at{" "}
            <code>https://litter-detect-inference.onrender.com</code> on Render's free tier. It may take
            10–30 seconds to respond after a period of inactivity while the instance wakes up.
          </p>
          <p>
            <strong>Check service status</strong>
          </p>
          <pre>{`GET /health`}</pre>
          <p>
            <strong>Run detection</strong> — multipart/form-data with <code>file</code> (image) and optional{" "}
            <code>model</code> (default: <code>yolo26s</code>).
          </p>
          <pre>{`curl -X POST https://litter-detect-inference.onrender.com/v1/detections \\
  -F "file=@beach.jpg" \\
  -F "model=yolo26s"`}</pre>
          <p>
            The response includes <code>detections</code> (id, class_name, confidence, bbox), <code>count</code>,{" "}
            <code>image_size</code>, <code>inference_time_sec</code>, and <code>runtime</code> metadata.
            Compatibility aliases are available at <code>GET /api/model</code> and{" "}
            <code>POST /api/detect/image</code>. All error responses use a structured envelope:{" "}
            <code>{"{ success: false, error: { code, message }, request_id }"}</code>.
          </p>
        </>
      );
    case "limitations":
      return (
        <>
          <h3>Limitations</h3>
          <p>
            This is a single-class detector — it identifies "litter" as a category, not material type, quantity,
            or environmental impact. It does not tell you what kind of debris was found or how much of it there is
            by weight or volume. It does not classify scenes as "polluted" or "clean."
          </p>
          <p>
            Detection accuracy depends on lighting conditions, camera angle, distance from the subject, occlusion
            by waves or sand, image compression, and how similar the image is to the training data. Litter
            partially submerged, very small, or against a visually similar background may be missed.
          </p>
          <p>
            A result of zero detections means no object crossed the configured confidence threshold in this image.
            It does not prove the image contains no litter — the model may have missed items it was not confident
            about.
          </p>
          <p>
            This tool has not been validated for scientific research, environmental monitoring, regulatory
            reporting, or operational decision-making. Treat the output as an exploratory indication, not a
            measurement.
          </p>
        </>
      );
    case "credits":
      return (
        <>
          <h3>Credits</h3>
          <p>
            <strong>Built by Sonal Hegde.</strong>
          </p>
          <p className="credit-links">
            <a href="https://github.com/Sonalhegde" target="_blank" rel="noreferrer">
              GitHub <ExternalLink size={13} />
            </a>
            {" · "}
            <a href="https://www.linkedin.com/in/sonal-hegde-/" target="_blank" rel="noreferrer">
              LinkedIn <ExternalLink size={13} />
            </a>
          </p>
          <p>
            <strong>With thanks to Dr. Sachinandan Dutta</strong>, Assistant Professor, for guidance on the
            project. His areas of interest include fisheries management, ecosystem modelling, and marine ecology.
          </p>
          <p className="credit-contact">
            <Mail size={14} /> s.dutta@squ.edu.om
          </p>
          <p className="credit-stack">
            Built with React, Vite, FastAPI, ONNX Runtime, and Pillow. Deployed on Vercel (frontend) and
            Render (inference API).
          </p>
        </>
      );
    default:
      return (
        <>
          <h3>Overview</h3>
          <p>
            Sentinel is a web tool for reviewing coastal photographs. Upload a JPEG, PNG, or WebP image and the
            service runs a YOLO26s model that looks for the trained <strong>litter</strong> class, then shows
            each returned bounding box and confidence score overlaid on your image.
          </p>
          <p>
            The project was built as part of a marine ecology research context. The model is a single-class
            object detector fine-tuned on a coastal litter dataset. It is intentionally narrow in scope — it
            does not classify material type, estimate quantity, or replace field inspection. Results depend on
            image quality, lighting, and similarity to the training data.
          </p>
          <p>
            The interface keeps things simple: upload an image, run detection, see what the model found. The
            documentation sections below cover how the detection works, what model is deployed, the API for
            integrating with it, and its limitations.
          </p>
        </>
      );
  }
}

export function DocumentationCenter({
  activeTopic,
  onTopicChange,
}: {
  activeTopic: DocumentationTopicId;
  onTopicChange: (topic: DocumentationTopicId) => void;
}) {
  return (
    <section id="documentation" className="docs-section" aria-labelledby="docs-title">
      <div className="docs-heading">
        <div>
          <span className="section-kicker">Documentation</span>
          <h2 id="docs-title">About this tool</h2>
        </div>
        <p>Plain-language notes about the detector, how it works, and its limits.</p>
      </div>
      <nav className="docs-menu" aria-label="Documentation sections">
        {documentationTopics.map((topic) => {
          const Icon = topic.icon;
          return (
            <button
              key={topic.id}
              type="button"
              className={activeTopic === topic.id ? "docs-menu-button docs-menu-button--active" : "docs-menu-button"}
              onClick={() => onTopicChange(topic.id)}
            >
              <Icon size={15} />
              {topic.label}
            </button>
          );
        })}
      </nav>
      <article className="documentation-detail" aria-live="polite">
        <DetailContent topicId={activeTopic} />
      </article>
    </section>
  );
}

export default DocumentationCenter;

export const documentationContactIcons = { Mail };
