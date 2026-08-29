import { useState } from "react";
import {
  BookOpen,
  Code2,
  ExternalLink,
  Info,
  Mail,
  UserRound,
  Waves,
  Database,
} from "lucide-react";
import { Link } from "wouter";
import { API_BASE_URL } from "@/lib/detection";

const RELEASE_SHA = __RELEASE_SHA__;

type SectionId =
  | "overview"
  | "how-it-works"
  | "model"
  | "dataset"
  | "api"
  | "limitations"
  | "credits";

type Section = { id: SectionId; label: string; icon: typeof BookOpen };

const SECTIONS: Section[] = [
  { id: "overview",     label: "Overview",     icon: BookOpen   },
  { id: "how-it-works", label: "How it works",  icon: Info       },
  { id: "model",        label: "Model",         icon: Code2      },
  { id: "dataset",      label: "Dataset",       icon: Database   },
  { id: "api",          label: "API reference", icon: Code2      },
  { id: "limitations",  label: "Limitations",   icon: Info       },
  { id: "credits",      label: "Credits",       icon: UserRound  },
];

function SectionContent({ id }: { id: SectionId }) {
  switch (id) {

    case "overview":
      return (
        <div className="docs-section-body">
          <h3>Overview</h3>
          <p>
            Sentinel is a web tool for reviewing coastal photographs. Upload a JPEG, PNG, or WebP
            image and the service runs a YOLO26s model trained on marine litter imagery, then shows
            you each detected object as a bounding box with its confidence score.
          </p>
          <p>
            The project was developed as part of a marine ecology research context, supervised by
            Dr. Sachinandan Dutta at Sultan Qaboos University. The goal is to make it easier to
            visually screen coastal images for debris, not to replace field surveys or produce
            scientifically validated measurements.
          </p>
          <p>
            The current model is a single-class detector — it finds "litter" as one category and
            does not distinguish between plastic bottles, fishing nets, packaging, or other debris
            types. A multi-class model trained on the BePLi v2 dataset is in progress; this
            documentation will be updated when it ships.
          </p>
        </div>
      );

    case "how-it-works":
      return (
        <div className="docs-section-body">
          <h3>How it works</h3>
          <p>
            You select an image file. The browser sends it as a multipart POST request to the
            FastAPI inference service. The service validates the uploaded bytes with Pillow —
            checking that they are a real JPEG, PNG, or WebP file within the size and dimension
            limits — then decodes the image to an RGB array in memory. The original file is never
            written to disk.
          </p>
          <p>
            The image is letterbox-resized to fit the model's 320&thinsp;×&thinsp;320 input:
            it is scaled down proportionally to fit within a 320px square, and the remaining space
            is padded with grey (value 114). The padded image is normalised to 0–1 float32 and
            passed to the YOLO26s ONNX artifact via ONNX Runtime.
          </p>
          <p>
            The model's output tensor contains candidate bounding boxes and class confidence scores.
            The service filters these at a 25% confidence threshold, runs non-maximum suppression at
            an IoU threshold of 0.45, and unscales the surviving box coordinates back to the
            dimensions of your original image. The resulting detections are serialised to JSON and
            returned to the browser.
          </p>
          <p>
            The browser draws the returned boxes as an SVG overlay on your local image preview.
            The image itself is never re-fetched — the overlay is positioned over the object URL
            the browser created when you selected the file.
          </p>
        </div>
      );

    case "model":
      return (
        <div className="docs-section-body">
          <h3>Model</h3>
          <p>
            The deployed model is a custom-trained YOLO26s checkpoint fine-tuned to detect{" "}
            <strong>litter</strong> in coastal and marine photographs. YOLO26s is part of the
            Ultralytics YOLO26 family, a one-stage object detector with a lighter detection head,
            DFL-free box regression, and an end-to-end (NMS-free) inference path. At 9.5M fused
            parameters it runs on CPU within Render's free-tier memory constraints.
          </p>
          <p>
            For the Render deployment, the supplied <code>.pt</code> checkpoint was exported to a
            fixed-320 ONNX artifact. This lets the service use ONNX Runtime directly without
            loading PyTorch or Ultralytics in the request path, which reduces cold-start time and
            peak memory. The artifact is SHA-256 pinned and verified on load.
          </p>
          <p>
            The model currently has one trained class: <strong>litter</strong>. It does not
            distinguish debris type. A multi-class model trained on the BePLi v2 dataset is in
            development and will replace this checkpoint when it is ready.
          </p>
          <p>
            YOLO26n, m, l, and x variants are not deployed — no fine-tuned checkpoints for those
            scales are available.
          </p>
        </div>
      );

    case "dataset":
      return (
        <div className="docs-section-body">
          <h3>Dataset</h3>
          <p>
            The current single-class model was trained on a marine litter dataset in COCO format.
            The exact dataset source was not included with the supplied checkpoint, so a specific
            attribution cannot be confirmed. Based on the image filenames and class structure in
            the supplied archive, it appears to be a COCO-derived coastal litter dataset.
          </p>
          <p>
            The next model will be trained on <strong>BePLi v2</strong> (Beach Plastic Litter
            version 2), a dataset of annotated coastal images from beaches in Japan. It contains
            multiple litter-type categories — plastic bottles, bags, styrofoam, fishing gear, and
            others — collected to support automated marine debris monitoring. Because some
            categories have far fewer training examples than others, per-class detection accuracy
            will vary; common categories like plastic bottles will generally perform better than
            rare ones.
          </p>
          <p>
            BePLi v2 is released under a{" "}
            <strong>CC BY-NC-SA 4.0</strong> licence — non-commercial use only, with attribution
            required and any derivative works shared under the same licence. This matters if you
            intend to reuse a model trained on it in a commercial product.
          </p>
          <span className="license-badge">CC BY-NC-SA 4.0</span>
        </div>
      );

    case "api":
      return (
        <div className="docs-section-body">
          <h3>API reference</h3>
          <p>
            The inference service runs at{" "}
            <code>https://litter-detect-inference.onrender.com</code> on Render's free tier.
            After a period of inactivity the instance spins down; the first request after that
            can take 10–30 seconds to respond while it wakes up. Subsequent requests within the
            same activity window are faster.
          </p>

          <p><strong>Service status</strong></p>
          <pre><code>{`GET /health`}</code></pre>
          <p>Returns service status and model availability. Example response:</p>
          <pre><code>{`{
  "status": "healthy",
  "models": [
    { "id": "yolo26s", "label": "YOLO26s", "available": true,
      "detail": "Trusted derived ONNX artifact from the supplied YOLO26s checkpoint." }
  ]
}`}</code></pre>

          <p><strong>Run detection</strong></p>
          <pre><code>{`POST /v1/detections
Content-Type: multipart/form-data

file   — JPEG, PNG, or WebP image (required)
model  — model ID (optional; default: yolo26s)`}</code></pre>

          <pre><code>{`curl -X POST https://litter-detect-inference.onrender.com/v1/detections \\
  -F "file=@beach.jpg" \\
  -F "model=yolo26s"`}</code></pre>

          <p>Example success response:</p>
          <pre><code>{`{
  "success": true,
  "model": "yolo26s",
  "count": 2,
  "detections": [
    {
      "id": 1,
      "class_name": "litter",
      "confidence": 0.812,
      "bbox": { "x1": 142.3, "y1": 88.1, "x2": 298.7, "y2": 201.5 }
    }
  ],
  "image_size": { "width": 1280, "height": 720 },
  "inference_time_sec": 0.52,
  "runtime": {
    "input_size": 320, "device": "cpu", "engine": "onnxruntime",
    "confidence_threshold": 0.25, "iou_threshold": 0.45
  }
}`}</code></pre>

          <p>
            All error responses use a structured envelope with a <code>code</code> field and a
            human-readable <code>message</code>:
          </p>
          <pre><code>{`{
  "success": false,
  "error": { "code": "invalid_image", "message": "The selected file could not be read as a supported image." },
  "request_id": "a3f2e1b0"
}`}</code></pre>

          <p>
            Compatibility aliases: <code>GET /api/model</code> and{" "}
            <code>POST /api/detect/image</code>.
          </p>
        </div>
      );

    case "limitations":
      return (
        <div className="docs-section-body">
          <h3>Limitations</h3>
          <p>
            The current model is a single-class detector. It identifies the presence of "litter"
            as a category — it does not tell you what type of debris it found, how much there is
            by weight or volume, or whether a scene should be classified as "polluted" or "clean."
          </p>
          <p>
            Detection accuracy depends on lighting, camera angle, distance from the subject,
            occlusion by sand, water, or other objects, image compression quality, and how closely
            the image resembles the training data. Litter that is partially submerged, very small,
            strongly backlit, or against a visually similar background is more likely to be missed.
          </p>
          <p>
            A result of zero detections means no object exceeded the configured confidence
            threshold (25%). It does not prove the image contains no litter — the model may have
            assigned a lower confidence to items it was uncertain about.
          </p>
          <p>
            Once the multi-class model ships, per-class accuracy will vary because the BePLi v2
            training data is imbalanced — some litter types appear far more often than others.
            Common categories will generally detect more reliably than rare ones.
          </p>
          <p>
            This tool has not been validated for scientific research, environmental monitoring,
            regulatory reporting, or operational field decisions. Treat the output as an
            exploratory indication, not a measurement.
          </p>
        </div>
      );

    case "credits":
      return (
        <div className="docs-section-body">
          <h3>Credits</h3>

          <div className="credit-block">
            <p className="credit-name">Sonal Hegde</p>
            <p className="credit-role">Developer</p>
            <div className="credit-links">
              <a href="https://github.com/Sonalhegde" target="_blank" rel="noreferrer">
                GitHub <ExternalLink size={12} />
              </a>
              <a href="https://www.linkedin.com/in/sonal-hegde-/" target="_blank" rel="noreferrer">
                LinkedIn <ExternalLink size={12} />
              </a>
              <a href="mailto:sonalhhegde@gmail.com">
                <Mail size={12} /> sonalhhegde@gmail.com
              </a>
            </div>
          </div>

          <div className="credit-block">
            <p className="credit-name">Dr. Sachinandan Dutta</p>
            <p className="credit-role">
              Associate Professor, Department of Marine Science and Fisheries<br />
              Sultan Qaboos University, Muscat, Oman
            </p>
            <p>
              With thanks to Dr. Dutta for guidance and mentorship on this project.
              His research interests include fisheries management, ecosystem modelling,
              and marine ecology.
            </p>
            <div className="credit-links">
              <a href="mailto:s.dutta@squ.edu.om">
                <Mail size={12} /> s.dutta@squ.edu.om
              </a>
            </div>
          </div>

          <div className="credit-block">
            <p className="credit-name">Tech stack</p>
            <p>
              Built with React, Vite, TypeScript, FastAPI, ONNX Runtime, Pillow, and OpenCV.
              Deployed on Vercel (frontend) and Render (inference API).
            </p>
          </div>
        </div>
      );
  }
}

export default function Docs() {
  const [active, setActive] = useState<SectionId>("overview");

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
            <Link className="nav-link nav-link--active" href="/docs">Docs</Link>
          </div>
        </div>
      </header>

      {/* ── Main ───────────────────────────────────────────────────────── */}
      <main>
        <div className="page-width docs-page">
          <div className="docs-page-header">
            <h1>Documentation</h1>
            <p>
              Plain-language notes about what Sentinel does, how the detection pipeline works,
              what model and data are used, the API, and its limits.
            </p>
          </div>

          <div className="docs-layout">
            {/* Sidebar */}
            <aside className="docs-sidebar">
              <nav aria-label="Documentation sections">
                {SECTIONS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    className={`docs-nav-btn${active === id ? " docs-nav-btn--active" : ""}`}
                    onClick={() => setActive(id)}
                    aria-current={active === id ? "page" : undefined}
                  >
                    <Icon size={15} />
                    {label}
                  </button>
                ))}
              </nav>
            </aside>

            {/* Content */}
            <article aria-live="polite">
              <SectionContent id={active} />
            </article>
          </div>
        </div>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer>
        <div className="page-width footer-inner">
          <span>Sentinel</span>
          <span>
            <Link href="/">Detector</Link>
            {" · "}
            <a href={API_BASE_URL} target="_blank" rel="noreferrer">API</a>
          </span>
          <span>Release {RELEASE_SHA}</span>
        </div>
      </footer>
    </div>
  );
}
