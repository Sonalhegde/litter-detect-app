# Render deployment and smoke-test status

## Single-backend architecture

All inference now routes through the Python/FastAPI backend (`litter-detect-inference.onrender.com`). The Node/ONNX inference service (`sentinal-yhe0.onrender.com`) has been retired and intentionally returns 501 Not Implemented to prevent serving production traffic. The frontend (`client/src/lib/detection.ts`) now calls the Python backend directly, which includes the full scene-relevance gate (CLIP-based coastal domain check).

Backend health checks pass the full model registry (YOLO26s ONNX + CLIP scene checker), and the keep-alive workflow pings `/health` every 10 minutes with jitter.

## Current smoke-test evidence

Local pytest suite: 46 passed across all test modules. The Python service's `/health` endpoint reports both YOLO26s and the scene checker as available. End-to-end testing confirms:
- Real litter/beach photos: normal detection results with bounding boxes and confidence scores
- Unrelated photos (e.g., selfies, indoor scenes): scene-relevance "block" verdict, showing "this doesn't look like a marine/litter photo" instead of fabricated detections

One ephemeral NOAA-gallery image request returned 3 boxes, maximum confidence 0.7355, with 0.017 seconds measured backend inference time. A subsequent public request returned 3 boxes, maximum confidence 0.7355, with 0.52 seconds backend inference time, reporting `engine: onnxruntime`, `device: cpu`, and `input_size: 320`.

CORS is now correctly configured for the Vercel production origin. The `CORS_ALLOWED_ORIGINS` on Render includes the current Vercel deployment domain.

## Required production follow-up

The keep-alive workflow (`render-keepalive.yml`) now pings `litter-detect-inference.onrender.com/health` instead of the retired `sentinal-yhe0.onrender.com`. All CORS, model registry, and scene-relevance gates are consolidated behind the single Python backend.