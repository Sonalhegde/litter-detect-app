# Shoreline Litter Detector

Shoreline Litter Detector is a web tool for reviewing coastal photographs. Upload a JPEG, PNG, or WebP image and the service runs the supplied YOLO26s object detector, which has one trained class: `litter`. The browser shows the returned bounding boxes and confidence scores over the uploaded image.

## Run locally

Start the inference API:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

In a second terminal, start the frontend:

```bash
pnpm install
pnpm dev
```

The local Vite setup proxies `/inference-api` to the backend. For a separate deployment, set `VITE_INFERENCE_API_URL` to the backend origin.

## Configuration

The backend reads `CORS_ALLOWED_ORIGINS`, model paths and `YOLO26S_MODEL_SHA256`, `INFERENCE_IMAGE_SIZE`, `INFERENCE_CONFIDENCE_THRESHOLD`, `INFERENCE_IOU_THRESHOLD`, upload and image limits, the inference concurrency limit, and rate-limit settings. The frontend reads `VITE_INFERENCE_API_URL`. Do not commit `.env` files; use `.env.example` when documenting local values.

The deployed ONNX artifact declares a fixed 320 × 320 input. The backend now reads that size from the loaded model at runtime, so preprocessing and coordinate restoration cannot silently disagree with the checkpoint. The default confidence threshold is 0.25 and the default IoU threshold is 0.45.

## API

`GET /health` reports service and checkpoint availability. `POST /v1/detections` accepts multipart fields `file` and `model=yolo26s`, and returns `detections`, `count`, `image_size`, `inference_time_sec`, and runtime settings. Compatibility aliases are available at `GET /api/model` and `POST /api/detect/image`.

```bash
curl -X POST https://litter-detect-inference.onrender.com/v1/detections \
  -F 'file=@shoreline.jpg' \
  -F 'model=yolo26s'
```

## Deployment

The frontend is configured for Vercel through `vercel.json`. The inference API is configured for Render through `render.yaml` and `backend/Dockerfile`. Set the Render CORS origin to the exact frontend URL and keep the checksum value paired with the deployed ONNX artifact. Render’s free service may sleep when idle, so the first request can take longer; request failures are shown as errors rather than being reported as a successful zero-detection result.

## Model and limitations

Only YOLO26s is currently deployed. The n, m, l, and x variants are not offered as UI features because compatible checkpoints are not installed. The original training dataset and complete provenance record were not included with the supplied checkpoint, so this project does not claim a more specific dataset attribution.

This is a single-class detector. It does not identify material type, estimate environmental impact, or replace field inspection. Accuracy depends on lighting, camera angle, distance, occlusion, background, and image quality. It has not been validated for scientific, regulatory, or operational decision-making. A zero-detection result means no prediction crossed the configured threshold; it does not prove that the image contains no litter.

## Tests

```bash
pnpm test -- --run
pnpm run build:frontend
cd backend && pytest -q
```

The backend tests cover image validation, safe API errors, model integrity, preprocessing, postprocessing, and the regression where settings request 960 pixels while the bundled ONNX model declares 320 pixels. Real positive coastal-image fixtures were not present in the supplied repository, so the remaining validation step is to run the service against 3–5 labeled positive images from the project dataset.

## Credits

Built by **Sonal Hegde**. GitHub: [Sonalhegde](https://github.com/Sonalhegde).

With thanks to **Dr. Sachinandan Dutta**, Assistant Professor, for guidance on the project. His areas of interest include fisheries management, ecosystem modelling, and marine ecology. Contact: `s.dutta@squ.edu.om`.

## Further documentation

The application includes an in-page documentation section covering the overview, method, model, API reference, limitations, and credits. More deployment and research notes are retained in [`docs/`](docs/).
