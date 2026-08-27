# Render smoke-test findings

- Commit `70b0146` is live on Render service `litter-detect-inference`.
- `GET /health` returns `status: healthy`; `yolo26s` is `available: true`; YOLO26n/m/l/x remain unavailable as intended.
- `GET /models` returns the five-model registry successfully.
- Production Vercel site `https://litter-detect-app.vercel.app` displays BlueSentinel AI, the five model choices, and `Inference service online`.
- A real multipart `POST /v1/detections` using `/home/ubuntu/upload/pasted_file_cUOzjI_image.png` and `model_id=yolo26s` returned HTTP 502.
- Render application logs showed Ultralytics initialization followed by a service restart around the request; the concrete traceback was not exposed in the extracted log text. The next step is to inspect the full logs or reduce inference memory/runtime for the Render Free instance.
