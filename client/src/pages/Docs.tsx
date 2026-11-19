import { useEffect, useState } from "react";
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
import { API_BASE_URL, getHealth } from "@/lib/detection";

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

const CANONICAL_CLASSES = [
  "plastic_bottle",
  "bottle_cap_lid",
  "plastic_bag",
  "food_wrapper",
  "plastic_container",
  "can_metal",
  "fishing_net",
  "rope_line",
  "styrofoam",
  "glass_bottle",
];

function SectionContent({ id, classes }: { id: SectionId; classes: string[] }) {
  const activeClasses = classes.length > 0 ? classes : CANONICAL_CLASSES;
  const classText = activeClasses.join(", ");
  const isMulti = activeClasses.length > 1;

  switch (id) {

    case "overview":
      return (
        <div className="docs-section-body">
          <h3>Overview</h3>
          <p>
            Sentinal is a web-based visual intelligence system for screening coastal and marine debris.
            Upload a JPEG, PNG, or WebP image and the service executes an advanced YOLO marine debris detector,
            displaying detected objects as high-resolution bounding boxes with calibrated confidence scores and multi-class categorization.
          </p>
          <p>
            The project was developed as part of a marine ecology research context, supervised by
            Dr. Sachinandan Dutta at Sultan Qaboos University. The goal is to provide rapid, automated
            visual screening of coastal shorelines and benthic imagery to support cleanup operations,
            ecological surveys, and marine conservation initiatives.
          </p>
          <p>
            The active detection pipeline supports candidate classification across {isMulti ? `${activeClasses.length} distinct marine debris categories (${classText})` : `the "${classText}" category`}.
            The pipeline is fully multi-class ready and applies per-class non-maximum suppression (NMS) and adaptive confidence thresholding.
          </p>
        </div>
      );

    case "how-it-works":
      return (
        <div className="docs-section-body">
          <h3>How it works</h3>
          <p>
            You select an image file. The browser sends it as a multipart POST request to the
            FastAPI inference service hosted on Google Cloud Run. The service validates the uploaded bytes with Pillow —
            checking that they represent a valid JPEG, PNG, or WebP file within the 25&thinsp;MB size limit — then decodes the image to an RGB array in memory. The original file is never written to disk.
          </p>
          <p>
            The image is letterbox-resized to fit the model's high-resolution input grid (up to 1280&thinsp;×&thinsp;1280):
            it is scaled down proportionally to preserve aspect ratio, and the remaining space
            is padded with neutral grey (value 114). Operating at high resolution ensures small debris objects
            (such as bottle caps, lids, and fragmented rope lines) remain distinct rather than collapsing into single-pixel artifacts.
            The padded image is normalized to 0–1 float32 and passed to the ONNX Runtime engine.
          </p>
          <p>
            The model's output tensor contains candidate bounding boxes and class confidence scores across all 10 marine debris categories.
            The service filters candidates below threshold, runs class-aware non-maximum suppression at
            an IoU threshold of 0.45, and un-scales the surviving box coordinates back to the
            dimensions of your original image. The resulting detections and summary statistics are serialized to JSON and
            returned to the browser.
          </p>
          <p>
            The browser draws the returned boxes as an SVG overlay directly on your local image preview.
            The image itself is never re-fetched — the overlay is positioned seamlessly over the object URL
            the browser created when you selected the file.
          </p>
        </div>
      );

    case "model":
      return (
        <div className="docs-section-body">
          <h3>Model</h3>
          <p>
            The deployed model is a custom-trained YOLO marine debris detector fine-tuned to detect{" "}
            <strong>10 canonical debris categories</strong> in coastal and marine photographs.
            The architecture utilizes an efficient convolutional backbone, an optimized detection head,
            and an end-to-end inference path that eliminates post-processing bottlenecks.
          </p>
          <p>
            The model is exported to an optimized ONNX runtime artifact. This lets the service on Google Cloud Run
            use ONNX Runtime directly with multi-threaded CPU execution without loading PyTorch or Ultralytics in the request path,
            minimizing cold-start latency and memory overhead. The artifact is SHA-256 pinned and integrity-verified on service initialization.
          </p>
          <p>
            Active detection classes: <strong>{classText}</strong>.
          </p>
          <p>
            The pipeline is configured for multi-scale inference supporting up to 1280px resolution, enabling precise localization of small shoreline debris and large submerged fishing gear alike.
          </p>
        </div>
      );

    case "dataset":
      return (
        <div className="docs-section-body">
          <h3>Dataset</h3>
          <p>
            Sentinal is trained on a consolidated multi-source benchmark uniting <strong>8 diverse marine debris and coastal litter datasets</strong>, encompassing over 10,000+ annotated debris instances across varied lighting, water turbidity, and terrain:
          </p>
          <ul style={{ paddingLeft: "1.25rem", margin: "0.75rem 0", lineHeight: 1.6 }}>
            <li>
              <strong>TACO (Trash Annotations in Context)</strong>: High-resolution coastal, shoreline, and terrestrial litter providing primary annotations for bottle caps, lids, cans, bottles, and food wrappers.
            </li>
            <li>
              <strong>TrashCan 1.0 (University of Minnesota)</strong>: Underwater and benthic ROV imagery capturing submerged debris, nets, ropes, and trash on the seafloor.
            </li>
            <li>
              <strong>ICT Mentoring Marine Debris</strong>: Coastal shoreline survey imagery containing plastic bottles, cans, fishing nets, rope lines, and styrofoam.
            </li>
            <li>
              <strong>MV02 Marine Litter</strong>: Real-world marine debris imagery capturing buoyant plastics, containers, and packaging.
            </li>
            <li>
              <strong>Global Solution Marine Litter</strong>: Multi-environment coastal imagery covering plastic bags, plastic bottles, and marine waste.
            </li>
            <li>
              <strong>Marine Debris & Nets</strong>: Specialized dataset focused on abandoned, lost, or discarded fishing gear (ALDFG), derelict nets, and ropes.
            </li>
            <li>
              <strong>Debris KHPOO</strong>: Extensive coastal survey dataset for rubber, plastics, and shoreline litter.
            </li>
            <li>
              <strong>Deep-Sea Debris</strong>: Autonomous underwater vehicle and ROV captures of benthic debris.
            </li>
          </ul>
          <p>
            All datasets were standardized to a unified 10-class canonical schema (<code>plastic_bottle</code>, <code>bottle_cap_lid</code>, <code>plastic_bag</code>, <code>food_wrapper</code>, <code>plastic_container</code>, <code>can_metal</code>, <code>fishing_net</code>, <code>rope_line</code>, <code>styrofoam</code>, <code>glass_bottle</code>) with coordinate re-projection, polygon-to-bounding-box conversion, and name-based category alignment to prevent class index drift.
          </p>
          <span className="license-badge">Academic & Open Data Benchmarks</span>
        </div>
      );

    case "api":
      return (
        <div className="docs-section-body">
          <h3>API reference</h3>
          <p>
            The inference service runs on Google Cloud Run at{" "}
            <code>https://sentinal-backend-163815383571.us-central1.run.app</code>.
            It provides high-performance auto-scaling with dedicated memory allocation (2&thinsp;GB RAM, 2 vCPUs) and fast response times.
          </p>

          <p><strong>Service status</strong></p>
          <pre><code>{`GET /health`}</code></pre>
          <p>Returns service status, model availability, and class names. Example response:</p>
          <pre><code>{`{
  "status": "healthy",
  "models": [
    {
      "id": "yolo26s",
      "label": "YOLO26s",
      "available": true,
      "classes": [
        "plastic_bottle",
        "bottle_cap_lid",
        "plastic_bag",
        "food_wrapper",
        "plastic_container",
        "can_metal",
        "fishing_net",
        "rope_line",
        "styrofoam",
        "glass_bottle"
      ],
      "detail": "Production ONNX artifact loaded; multi-class marine debris detector active."
    }
  ]
}`}</code></pre>

          <p><strong>Run detection</strong></p>
          <pre><code>{`POST /v1/detections
Content-Type: multipart/form-data

file   — JPEG, PNG, or WebP image (required, up to 25 MB)
model  — model ID (optional; default: yolo26s)`}</code></pre>

          <pre><code>{`curl -X POST https://sentinal-backend-163815383571.us-central1.run.app/v1/detections \\
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
      "class_name": "plastic_bottle",
      "confidence": 0.884,
      "bbox": { "x1": 142.3, "y1": 88.1, "x2": 298.7, "y2": 201.5 }
    },
    {
      "id": 2,
      "class_name": "fishing_net",
      "confidence": 0.812,
      "bbox": { "x1": 310.0, "y1": 150.2, "x2": 450.6, "y2": 290.0 }
    }
  ],
  "image_size": { "width": 1920, "height": 1080 },
  "inference_time_sec": 0.28,
  "runtime": {
    "input_size": 1280,
    "device": "cpu",
    "engine": "onnxruntime",
    "confidence_threshold": 0.25,
    "per_class_thresholds": {
      "plastic_bottle": 0.25,
      "fishing_net": 0.25
    },
    "iou_threshold": 0.45
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
            Detection accuracy depends on lighting, camera angle, distance from the subject,
            occlusion by sand, water, or other objects, image compression quality, and how closely
            the image resembles the training data. Litter that is partially submerged, very small,
            strongly backlit, or against a visually similar background is more likely to be missed.
          </p>
          <p>
            A result of zero detections means no object exceeded the configured confidence
            threshold. It does not prove the image contains no litter — the model may have
            assigned a lower confidence to items it was uncertain about.
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
              Deployed on Vercel (frontend) and Google Cloud Run (inference API).
            </p>
          </div>
        </div>
      );
  }
}

export default function Docs() {
  const [active, setActive] = useState<SectionId>("overview");
  const [classes, setClasses] = useState<string[]>([]);

  useEffect(() => {
    getHealth()
      .then((h) => {
        const yolo26s = h.models.find((m) => m.id === "yolo26s");
        if (yolo26s?.classes && yolo26s.classes.length > 0) {
          setClasses(yolo26s.classes);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="app-shell">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header>
        <div className="page-width topbar">
          <div className="topbar-left">
            <a className="brand" href="/" aria-label="Sentinal home">
              <span className="brand-mark"><Waves size={17} /></span>
              Sentinal
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
              Plain-language notes about what Sentinal does, how the detection pipeline works,
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
              <SectionContent id={active} classes={classes} />
            </article>
          </div>
        </div>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer>
        <div className="page-width footer-inner">
          <span>Sentinal</span>
          <span>
            <Link href="/">Detector</Link>
            {" · "}
            <a href={API_BASE_URL} target="_blank" rel="noreferrer">API</a>
          </span>
          <span>Release {RELEASE_SHA}</span>
        </div>
        <div className="page-width footer-update">
          LAST UPDATE - 19 Nov 2026 19:00 GST
        </div>
      </footer>
    </div>
  );
}
