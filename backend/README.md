# Shoreline Litter Detector inference backend

This directory is the independently deployable FastAPI inference service for **Shoreline Litter Detector — Marine Debris Detection Platform**. It serves only the supplied, trusted **YOLO26s** model through a checksum-pinned ONNX artifact derived from the preserved supplied checkpoint. The public API never accepts a model path or a model file from a browser; a request can only choose one of the fixed `yolo26n/s/m/l/x` identifiers, and only YOLO26s is currently installed.

## Structure

| Path | Purpose |
| --- | --- |
| `app/api/` | Thin HTTP routes for service status, model availability, and image detection. |
| `app/schemas/` | Pydantic response contracts, including safe error and runtime metadata models. |
| `app/services/` | Trusted image decoding, request rate limiting, model integrity verification, and serialized inference. |
| `app/core/` | Request IDs and privacy-conscious route-level audit logging. |
| `models/yolo26s.pt` | The supplied checkpoint, preserved byte-for-byte and retained as the source artifact. |
| `models/yolo26s.onnx` | The checksum-pinned, fixed-320 deployment artifact derived from the supplied YOLO26s checkpoint. |
| `tests/` | API, upload-security, CORS, rate-limit, settings, and integrity regression tests. |

## Public HTTP contract

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/` | Minimal service identity check. |
| `GET` | `/health` | Service health and five-model availability. |
| `GET` | `/models` and `/api/model` | Five-model registry, including truthfully unavailable variants. |
| `POST` | `/v1/detections` and `/api/detect/image` | JPEG, PNG, or WebP multipart image detection with `file` and optional `model` fields. |
| `GET` | `/docs` | Framework-generated OpenAPI documentation. |

All client failures use a safe envelope such as `{"success": false, "error": {"code": "invalid_image", "message": "…"}, "request_id": "…"}`. Tracebacks, filesystem paths, headers, credentials, model tensors, and raw image bytes are not returned.

## Defensive controls

The service validates image bytes with Pillow rather than trusting the filename or declared MIME type. It accepts only verified JPEG, PNG, and WebP content; limits upload bytes, decoded width, decoded height, and decoded pixels; normalizes pixels in memory; then closes the upload object. It does not persist uploaded images.

Public inference is serialized by default and protected by a small per-instance request window. This guard provides a reasonable public-demonstration control but is not a substitute for a shared, edge-enforced rate limiter when the service scales to several instances. The trusted YOLO26s deployment artifact is checksum-verified before model loading. The service calls ONNX Runtime directly with explicit OpenCV letterboxing and NumPy non-maximum suppression, so it does not import PyTorch or Ultralytics in the deployed request path. The source `.pt` file is retained only as the supplied controlled artifact; user-supplied checkpoints are never supported.

## Local setup and verification

Install the pinned production dependencies in an isolated environment, then run the service from this directory.

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt pytest pip-audit bandit
pytest -q
python -m compileall -q app tests
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

For a local browser, set `VITE_INFERENCE_API_URL=http://127.0.0.1:8000` in the frontend environment, or use the configured development proxy. Do not commit literal credentials or an `.env` file.

## Environment configuration

The deployment requirements use `onnxruntime`, NumPy, and headless OpenCV rather than PyTorch, torchvision, or Ultralytics. This reduces the Render Free container’s heavyweight model-runtime dependency surface; it does not remove the free service’s CPU, memory, cold-start, or 180-second request constraints.

| Variable | Default | Purpose |
| --- | --- | --- |
| `CORS_ALLOWED_ORIGINS` | local origins plus the production Vercel origin | Comma-separated browser-origin allowlist. |
| `YOLO26S_MODEL_PATH` | `models/yolo26s.onnx` | Trusted derived deployment artifact path. |
| `YOLO26S_MODEL_SHA256` | derived artifact fingerprint | Integrity pin for the trusted deployment artifact. |
| `INFERENCE_IMAGE_SIZE` | `960` locally, `320` on Render | Input-side inference resolution; lower production resolution reduces free-instance memory pressure. |
| `INFERENCE_CONFIDENCE_THRESHOLD` | `0.25` | Confidence floor for detections. |
| `INFERENCE_IOU_THRESHOLD` | `0.45` | IoU setting supplied to the detector. |
| `MAX_UPLOAD_MB` | `10` locally, `4` on Render | Maximum accepted image file size. |
| `MAX_IMAGE_WIDTH`, `MAX_IMAGE_HEIGHT` | `6000` locally, `3000` on Render | Safe decoded-image dimension caps. |
| `MAX_IMAGE_PIXELS` | `20000000` locally, `6000000` on Render | Safe decoded-image pixel cap. |
| `INFERENCE_CONCURRENCY` | `1` | Maximum simultaneous model execution per instance. |
| `RATE_LIMIT_REQUESTS`, `RATE_LIMIT_WINDOW_SECONDS` | `6`, `60` | Per-instance public-demo request budget. |

Successful detection responses include `runtime.engine: "onnxruntime"` and `runtime.device: "cpu"` so clients can distinguish the deployed engine from model-family availability.
