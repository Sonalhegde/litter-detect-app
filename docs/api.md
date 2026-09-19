# API

Base URL (local default): `http://127.0.0.1:8000`

`GET /` returns a small service identity payload. `GET /health` returns service status and an availability entry for YOLO26n, YOLO26s, YOLO26m, YOLO26l, and YOLO26x. `GET /models` returns the same availability registry without a health-status wrapper. `POST /v1/detections` accepts multipart form fields `file` and `model`, where `model` is one of the five YOLO26 IDs. It returns the selected model, detections, confidence values, box coordinates, image size, summary counts, and inference duration.

The service validates supported image formats, file size, image readability, and model availability. Missing checkpoints return a structured 503 response rather than silently substituting another model. OpenAPI UI is available at `/docs`.

Example:

```bash
curl -X POST http://127.0.0.1:8000/v1/detections \
  -F 'file=@shoreline.png' \
  -F 'model=yolo26s'
```

When using the frontend dev server on port 3000, the same paths are available under the `/inference-api` prefix (e.g. `http://localhost:3000/inference-api/health`).
