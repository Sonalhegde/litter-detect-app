# Sentinal inference backend

FastAPI inference service for **Sentinal — Marine Debris Detection Platform**. It serves the checksum-pinned **YOLO26s** ONNX artifact and optional additional YOLO26 variants when their checkpoints are present under `models/`. Clients choose only allowlisted model IDs (`yolo26n/s/m/l/x`); filesystem paths and user-supplied weights are never accepted.

## Structure

| Path | Purpose |
| --- | --- |
| `app/api/` | HTTP routes for health, model availability, relevance, and detection. |
| `app/schemas/` | Pydantic response contracts and safe error envelopes. |
| `app/services/` | Image decoding, optional rate limiting, model integrity checks, ONNX inference. |
| `app/core/` | Request IDs and privacy-conscious audit logging. |
| `models/yolo26s.onnx` | Checksum-pinned deployment artifact (currently exported at 320×320 input). |
| `tests/` | API, upload-security, CORS, rate-limit, settings, and integrity tests. |

## Public HTTP contract

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/` | Minimal service identity check. |
| `GET` | `/health` | Service health and five-model availability. |
| `GET` | `/models` and `/api/model` | Model registry (uninstalled variants report `available: false`). |
| `POST` | `/v1/detections` and `/api/detect/image` | JPEG, PNG, or WebP multipart detection with `file` and optional `model`. |
| `GET` | `/docs` | OpenAPI documentation. |

## Defensive controls (retained)

- Pillow-based decode and format verification (not filename/MIME alone).
- Upload byte, decoded dimension, and pixel caps (relaxed for local use; see defaults below).
- SHA-256 integrity pin for the trusted YOLO26s ONNX artifact before load.
- CLIP-based scene-relevance gate (optional degradation when artifacts missing).
- ONNX Runtime + OpenCV letterbox + NumPy NMS (no PyTorch in the default path — keeps dependencies small; optional `.pt` checkpoints for n/m/l/x are not bundled).

## Local setup

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# Unix: source .venv/bin/activate
python -m pip install -r requirements.txt pytest
pytest -q
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

From the repo root, start the frontend with `pnpm dev` (Express + Vite on port 3000). The dev server proxies `/inference-api` to `127.0.0.1:8000`.

Copy `backend/.env.example` to `backend/.env` and adjust if needed. Do not commit secrets or `.env`.

## Environment configuration (local defaults)

| Variable | Local default | Purpose |
| --- | --- | --- |
| `CORS_ALLOWED_ORIGINS` | `localhost` / `127.0.0.1` on ports **3000** and **5173** | Browser CORS allowlist. |
| `YOLO26S_MODEL_PATH` | `models/yolo26s.onnx` | Trusted ONNX artifact path. |
| `YOLO26S_MODEL_SHA256` | pinned digest in `config.py` | Integrity verification before load. |
| `INFERENCE_IMAGE_SIZE` | `1280` | Target side length when **re-exporting** YOLO ONNX; runtime uses the graph's fixed input (320 for the bundled artifact) until a new file is installed. |
| `INFERENCE_CONFIDENCE_THRESHOLD` | `0.25` | Global confidence floor (bandit may raise per class). |
| `INFERENCE_IOU_THRESHOLD` | `0.45` | NMS IoU threshold. |
| `MAX_UPLOAD_MB` | `50` | Max upload file size (guard against accidental huge files). |
| `MAX_IMAGE_WIDTH`, `MAX_IMAGE_HEIGHT` | `12000` each | Decoded dimension cap per side. |
| `MAX_IMAGE_PIXELS` | `120000000` | Decoded pixel cap (~120 MP). |
| `INFERENCE_CONCURRENCY` | logical CPU count | Max simultaneous ONNX runs (`asyncio.Semaphore`). |
| `ONNX_INTRA_OP_THREADS`, `ONNX_INTER_OP_THREADS` | `cpu_count // concurrency`, `1` | ONNX Runtime thread pools per session. |
| `RATE_LIMIT_ENABLED` | `false` | Set `true` to re-enable hosted-demo rate limiting. |
| `RATE_LIMIT_REQUESTS`, `RATE_LIMIT_WINDOW_SECONDS` | `120`, `60` | Used only when rate limiting is enabled. |
| `TRUST_PROXY_HEADERS` | `false` | Enable only behind a trusted reverse proxy. |

Historical Render/Vercel deployment files are archived under `docs/deployment-archive/`.

## Runtime engine

The service uses **ONNX Runtime on CPU** by default. PyTorch/Ultralytics (and CUDA) were not added: only `yolo26s.onnx` is shipped today, and re-export at higher `imgsz` is the supported path to better accuracy without pulling in torch. Drop additional verified `.onnx` files for n/m/l/x under `models/` to enable those IDs.

## Checksum pinning when replacing YOLO26s

```bash
# PowerShell
Get-FileHash models/yolo26s.onnx -Algorithm SHA256
```

Update `DEFAULT_TRUSTED_YOLO26S_SHA256` in `app/config.py` and `YOLO26S_MODEL_SHA256` in your `.env`.
