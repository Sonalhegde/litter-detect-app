# BlueSentinel AI — Marine Debris Detection Platform

BlueSentinel AI is a university-level research prototype for detecting the trained `litter` class in coastal and marine images. It combines a React/Vite interface with a FastAPI inference service and preserves the supplied YOLO26s workflow: upload an image, select a model, run inference, inspect confidence and coordinates, and review the result visually.

## Current model status

The supplied `best.pt` checkpoint is preserved byte-for-byte and registered as `backend/models/yolo26s.pt` for the primary YOLO26s workflow. The interface exposes YOLO26n, YOLO26s, YOLO26m, YOLO26l, and YOLO26x, but each option is marked unavailable until its own checkpoint is installed. The application never substitutes a different model or fabricates detections.

| Variant | Intended role | Current project status |
|---|---|---|
| YOLO26n | Lightweight edge baseline | Checkpoint not installed |
| YOLO26s | Speed/accuracy balance | Supplied, checksum-pinned marine-litter checkpoint |
| YOLO26m | Higher-capacity experiment | Checkpoint not installed |
| YOLO26l | Large high-accuracy experiment | Checkpoint not installed |
| YOLO26x | Maximum-capacity experiment | Checkpoint not installed |

Official COCO benchmark values are not marine-litter results and remain separate from this project's reported validation record.

## Local development

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API exposes `/`, `/health`, `/models`, and `POST /v1/detections`; `/detect` is retained as a compatibility alias. FastAPI's interactive documentation is available at `/docs`.

### Frontend

```bash
pnpm install
pnpm dev
```

For local preview, the frontend uses the same-origin `/inference-api` proxy. For a separate deployment, set `VITE_INFERENCE_API_URL` to the public backend URL.

## Environment variables

The backend accepts `CORS_ALLOWED_ORIGINS`, `YOLO26S_MODEL_PATH`, `YOLO26S_MODEL_SHA256`, `YOLO26N_MODEL_PATH`, `YOLO26M_MODEL_PATH`, `YOLO26L_MODEL_PATH`, `YOLO26X_MODEL_PATH`, `INFERENCE_IMAGE_SIZE`, `INFERENCE_CONFIDENCE_THRESHOLD`, `INFERENCE_IOU_THRESHOLD`, `MAX_UPLOAD_MB`, `MAX_IMAGE_WIDTH`, `MAX_IMAGE_HEIGHT`, `MAX_IMAGE_PIXELS`, `INFERENCE_CONCURRENCY`, `RATE_LIMIT_REQUESTS`, and `RATE_LIMIT_WINDOW_SECONDS`. The frontend accepts `VITE_INFERENCE_API_URL`.

The default confidence threshold is 0.25 and the default IoU threshold is 0.45. Local development defaults to a 960-pixel input size; the Render free-tier blueprint uses 320 pixels with single-thread native pools to keep CPU inference within a conservative resource envelope. These values affect inference behavior, not training accuracy. Render runs CPU inference; it is not configured as a GPU service.

## Deployment

The frontend is configured for Vercel through `vercel.json`. The inference service is configured for Render through `render.yaml` and `backend/Dockerfile`. Render's free service can spin down after inactivity, so `docs/keep-alive.md` documents a low-frequency health-check option and its trade-offs. No in-process timer is used.

## Research transparency

The project documents the supplied dataset split and reported validation figures without relabeling them as test results. The locked 852-image test set has not been evaluated in this application and must remain separate. The trained model is single-class: a zero-result means that no object matching the trained `litter` class exceeded the configured threshold; it does not prove that an image contains no objects or no marine debris.

The product's **Research notes** link opens the same project documentation inside the application, including the architecture diagram, model-family status, security and reliability controls, API contract, validation boundaries, limitations, and future work. The source documentation is retained under `docs/` for technical review.

## Tests

```bash
pnpm test
pnpm check
pnpm build
cd backend
pytest -q
```

## Credits and references

BlueSentinel AI uses Ultralytics, PyTorch, FastAPI, React, Vite, Pillow, and the supplied marine-litter checkpoint. Official YOLO26 terminology is based on [Ultralytics YOLO26 documentation](https://docs.ultralytics.com/models/yolo26), the [YOLO26 training recipe](https://docs.ultralytics.com/guides/yolo26-training-recipe), and [Ultralytics training documentation](https://docs.ultralytics.com/modes/train). Dataset attribution remains to be completed from the original dataset source because the supplied prototype did not include authoritative dataset creator details.

## Known limitations and future work

This is a single-class detector with possible false positives, false negatives, domain shift, small-object difficulty, and CPU latency. It does not include a marine-scene relevance classifier, video tracking, segmentation, or locked-test evaluation. Future work includes dataset auditing, multi-class taxonomy, video and drone input, temporal tracking, segmentation, ONNX/TensorRT export, quantization, and edge-device benchmarking.
