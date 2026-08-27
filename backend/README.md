# BlueSentinel AI inference backend

This directory is the independently deployable FastAPI inference service for **BlueSentinel AI — Marine Debris Detection Platform**. It runs only the supplied, trusted **YOLO26s** checkpoint for marine-litter detection. The public API never accepts a model path or a model file from a browser; a request can only choose one of the fixed `yolo26n/s/m/l/x` identifiers, and only YOLO26s is currently installed.

## Structure

| Path | Purpose |
| --- | --- |
| `app/api/` | Thin HTTP routes for service status, model availability, and image detection. |
| `app/schemas/` | Pydantic response contracts, including safe error and runtime metadata models. |
| `app/services/` | Trusted image decoding, request rate limiting, model integrity verification, and serialized inference. |
| `app/core/` | Request IDs and privacy-conscious route-level audit logging. |
| `models/yolo26s.pt` | The supplied checkpoint, pinned by SHA-256 before it may be loaded. |
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

Public inference is serialized by default and protected by a small per-instance request window. This guard provides a reasonable public-demonstration control but is not a substitute for a shared, edge-enforced rate limiter when the service scales to several instances. The trusted YOLO26s checkpoint is checksum-verified before model loading. Because common PyTorch checkpoint formats use Python object serialization, the deployment must continue to source this file only from the controlled repository/build artifact; user-supplied checkpoints are never supported.

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

| Variable | Default | Purpose |
| --- | --- | --- |
| `CORS_ALLOWED_ORIGINS` | local origins plus the production Vercel origin | Comma-separated browser-origin allowlist. |
| `YOLO26S_MODEL_PATH` | `models/yolo26s.pt` | Trusted deployment path for the supplied checkpoint. |
| `YOLO26S_MODEL_SHA256` | supplied model fingerprint | Integrity pin for the trusted checkpoint. |
| `INFERENCE_IMAGE_SIZE` | `960` locally, `320` on Render | Input-side inference resolution; lower production resolution reduces free-instance memory pressure. |
| `INFERENCE_CONFIDENCE_THRESHOLD` | `0.25` | Confidence floor for detections. |
| `INFERENCE_IOU_THRESHOLD` | `0.45` | IoU setting supplied to the detector. |
| `MAX_UPLOAD_MB` | `10` locally, `4` on Render | Maximum accepted image file size. |
| `MAX_IMAGE_WIDTH`, `MAX_IMAGE_HEIGHT` | `6000` locally, `3000` on Render | Safe decoded-image dimension caps. |
| `MAX_IMAGE_PIXELS` | `20000000` locally, `6000000` on Render | Safe decoded-image pixel cap. |
| `INFERENCE_CONCURRENCY` | `1` | Maximum simultaneous model execution per instance. |
| `RATE_LIMIT_REQUESTS`, `RATE_LIMIT_WINDOW_SECONDS` | `6`, `60` | Per-instance public-demo request budget. |
