# Sentinal

A web tool for detecting litter in coastal photographs. Upload a shoreline image and a YOLO26s model finds litter in it, returning bounding boxes, class labels, and confidence scores drawn over the image.

This repository is configured for **local development** — no hosted deployment is required.

---

## Screenshot

![Sentinal — marine litter detection platform](docs/screenshot.png)

---

## What it does

- Upload a JPEG, PNG, or WebP coastal photograph (up to **50 MB** locally; large high-resolution images supported)
- Sends the image to a FastAPI inference service on your machine
- Runs a checksum-pinned **YOLO26s** ONNX model (7 litter-type classes)
- Optionally checks scene relevance (coastal/shoreline) before detection
- Returns bounding boxes, confidence scores, and inference metadata
- Draws the boxes as an SVG overlay on your image in the browser

**Current classes:** `plastic`, `metal`, `glass`, `paper_cardboard`, `fishing_gear`, `natural_debris`, `other_litter`.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, Express dev shell |
| Backend | Python 3.11+, FastAPI, Uvicorn |
| Model runtime | ONNX Runtime (CPU), OpenCV, Pillow, NumPy |
| Model | YOLO26s — multi-class marine-litter ONNX artifact (320×320 input) |
| Scene gate | CLIP ViT-B/32 (quantized ONNX) |

Legacy hosted-deployment notes (if ever needed again) live in [`docs/deployment-archive/`](docs/deployment-archive/).

---

## How it works

The browser sends the image as a multipart POST to the FastAPI service. The service validates bytes with Pillow (not filename or declared MIME alone), optionally scores scene relevance, letterbox-resizes to the model's declared input size (320×320 for the bundled ONNX), normalises pixels to float32, and runs inference via ONNX Runtime. Detections are filtered by per-class adaptive thresholds (contextual bandit) and non-maximum suppression (IoU 0.45). Box coordinates are mapped back to the original image dimensions and returned as JSON. The browser draws an SVG overlay — the original file is never re-fetched.

See also [`backend/README.md`](backend/README.md) for the inference API contract.

---

## Running locally

You need [Node.js](https://nodejs.org) (v18+), [pnpm](https://pnpm.io), and Python 3.11+.

**Clone the repo**

```bash
git clone https://github.com/Sonalhegde/litter-detect-app.git
cd litter-detect-app
```

**Configure environment (optional but recommended)**

```bash
cp client/.env.example client/.env
cp backend/.env.example backend/.env
```

**Install dependencies**

```bash
# Frontend
pnpm install

# Backend
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
```

**Start the inference API** (terminal 1)

```bash
cd backend
# activate .venv first
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**Start the frontend** (terminal 2, repo root)

```bash
# Windows PowerShell
$env:NODE_ENV="development"; pnpm exec tsx watch server/_core/index.ts

# macOS/Linux
NODE_ENV=development pnpm dev
```

Open **http://localhost:3000**. The dev server proxies `/inference-api` → `http://127.0.0.1:8000`, so you do not need `VITE_INFERENCE_API_URL` for local development.

---

## Environment variables

**Frontend** (`client/.env`)

| Variable | Default | Description |
|---|---|---|
| `VITE_INFERENCE_API_URL` | `/inference-api` (dev) or `http://127.0.0.1:8000` (prod build) | Backend origin when not using the dev proxy. |

**Backend** (`backend/.env`) — local defaults

| Variable | Default | Description |
|---|---|---|
| `CORS_ALLOWED_ORIGINS` | `localhost` / `127.0.0.1` on ports 3000 and 5173 | Comma-separated browser-origin allowlist. |
| `YOLO26S_MODEL_PATH` | `models/yolo26s.onnx` | Path to the trusted ONNX artifact. |
| `YOLO26S_MODEL_SHA256` | pinned in `config.py` | SHA-256 integrity check before load. |
| `INFERENCE_IMAGE_SIZE` | `1280` | Target side length when re-exporting ONNX; runtime uses the graph's fixed input until re-exported. |
| `INFERENCE_CONFIDENCE_THRESHOLD` | `0.25` | Global confidence floor. |
| `INFERENCE_IOU_THRESHOLD` | `0.45` | NMS IoU threshold. |
| `MAX_UPLOAD_MB` | `50` | Maximum upload file size. |
| `MAX_IMAGE_WIDTH`, `MAX_IMAGE_HEIGHT` | `12000` each | Decoded dimension caps. |
| `MAX_IMAGE_PIXELS` | `120000000` | Decoded pixel cap (~120 MP). |
| `INFERENCE_CONCURRENCY` | logical CPU count | Max simultaneous ONNX runs. |
| `RATE_LIMIT_ENABLED` | `false` | Set `true` to enable per-IP rate limiting. |
| `RATE_LIMIT_REQUESTS`, `RATE_LIMIT_WINDOW_SECONDS` | `120`, `60` | Used only when rate limiting is enabled. |

Full table and checksum workflow: [`backend/README.md`](backend/README.md).

---

## Dataset and model

The deployed model is a YOLO26s checkpoint fine-tuned for marine litter in coastal images. The bundled ONNX artifact detects seven litter-type classes (see above).

Future training targets **BePLi v2** (Beach Plastic Litter v2), annotated coastal photographs from beaches in Japan.

**BePLi v2 licence: [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)** — non-commercial use only, attribution required, derivatives must use the same licence. This applies to the training data and model weights derived from it; it does not apply to the application code (see [License](#license)).

---

## Limitations

- **Accuracy varies.** Detection quality depends on lighting, angle, distance, occlusion, compression, and similarity to training data. Small or partially submerged objects are easily missed.
- **Fixed ONNX input size.** The bundled model runs at 320×320; re-export at a higher `imgsz` to improve small-object recall on very large photos.
- **Zero detections ≠ no litter.** An empty result means nothing crossed the confidence threshold, not that the scene is debris-free.
- **Not validated for formal use.** Not intended for regulatory reporting, scientific publication, or operational field decisions without independent validation.
- **Per-class imbalance.** Some litter categories are rarer in training data and will have lower recall.

---

## Roadmap

- Higher-resolution ONNX export (1280+) for local/GPU setups
- Additional YOLO26 variants (n/m/l/x) when verified checkpoints are available
- BePLi v2 fine-tune for expanded class coverage

---

## Running the tests

```bash
# Frontend type check and unit tests
pnpm run check
pnpm test

# Backend tests
cd backend
pytest -q
```

---

## Credits

Built by **Sonal Hegde**
[GitHub](https://github.com/Sonalhegde) · [LinkedIn](https://www.linkedin.com/in/sonal-hegde-/) · [sonalhhegde@gmail.com](mailto:sonalhhegde@gmail.com)

With guidance and mentorship from **Dr. Sachinandan Dutta**, Associate Professor, Department of Marine Science and Fisheries, Sultan Qaboos University, Muscat, Oman.
Research interests: fisheries management, ecosystem modelling, marine ecology.

---

## License

The application code is released under the [MIT License](LICENSE).

The training dataset (BePLi v2) is separately licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). That licence covers the data and any model weights derived from it; it does not govern the application source code.
