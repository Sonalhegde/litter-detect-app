# BlueSentinel AI — Marine Debris Detection Platform

BlueSentinel AI is a university-level research prototype for detecting the trained `litter` class in coastal and marine images. It combines a React/Vite interface with a FastAPI inference service and preserves the supplied YOLO26s workflow: upload an image, select a model, run inference, inspect confidence and coordinates, and review the result visually.

## Current model status

The supplied `best.pt` checkpoint was preserved byte-for-byte and registered as `inference-backend/models/yolo26s.pt` for the primary YOLO26s workflow. The interface exposes YOLO26n, YOLO26s, YOLO26m, YOLO26l, and YOLO26x, but each option is marked unavailable until its own checkpoint is installed. The application never substitutes a different model or fabricates detections.

| Variant | Intended role | Current project status |
|---|---|---|
| YOLO26n | Lightweight edge baseline | Checkpoint not installed |
| YOLO26s | Speed/accuracy balance | Supplied marine-litter checkpoint |
| YOLO26m | Higher-capacity experiment | Checkpoint not installed |
| YOLO26l | Large high-accuracy experiment | Checkpoint not installed |
| YOLO26x | Maximum-capacity experiment | Checkpoint not installed |

Official COCO benchmark values are not marine-litter results and are documented separately from this project’s validation metrics. See `docs/model-family.md` and `docs/metrics.md`.

## Local development

### Backend

```bash
cd inference-backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API exposes `/`, `/health`, and `POST /v1/detections`. FastAPI’s interactive documentation is available at `/docs`.

### Frontend

```bash
pnpm install
pnpm dev
```

For local preview, the frontend uses the same-origin `/inference-api` proxy. For a separate deployment, set `VITE_INFERENCE_API_URL` to the public backend URL.

## Environment variables

The backend accepts `CORS_ALLOWED_ORIGINS`, `YOLO26S_MODEL_PATH`, `YOLO26N_MODEL_PATH`, `YOLO26M_MODEL_PATH`, `YOLO26L_MODEL_PATH`, `YOLO26X_MODEL_PATH`, `INFERENCE_IMAGE_SIZE`, `INFERENCE_CONFIDENCE_THRESHOLD`, `INFERENCE_IOU_THRESHOLD`, and `MAX_UPLOAD_MB`. The frontend accepts `VITE_INFERENCE_API_URL`.

The default inference threshold is 0.25, the default IoU threshold is 0.45, and the packaged input size is 1280. These values affect inference behavior, not training accuracy. Render runs CPU inference; it is not configured as a GPU service.

## Deployment

The frontend is configured for Vercel through `vercel.json`. The inference service is configured for Render through `render.yaml` and `inference-backend/Dockerfile`. Render’s free service can spin down after inactivity, so `docs/keep-alive.md` documents a low-frequency health-check option and its trade-offs. No in-process timer is used.

The public repository is [Sonalhegde/litter-detect-app](https://github.com/Sonalhegde/litter-detect-app). The visible product name is BlueSentinel AI even though the existing repository slug is retained for deployment continuity.

## Research transparency

The project documents the supplied dataset split and reported validation figures without relabeling them as test results. The locked 852-image test set has not been evaluated in this application and must remain separate. The trained model is single-class: a zero-result means that no object matching the trained `litter` class exceeded the configured threshold; it does not prove that an image contains no objects or no marine debris.

See `docs/overview.md`, `docs/how-it-works.md`, `docs/yolo26.md`, `docs/model-family.md`, `docs/dataset.md`, `docs/data-cleaning.md`, `docs/training.md`, `docs/metrics.md`, `docs/api.md`, `docs/deployment.md`, `docs/limitations.md`, `docs/future-work.md`, and `docs/acknowledgements.md`.

## Tests

```bash
pnpm test
pnpm check
pnpm build
cd inference-backend
PYTHONPATH=. python -m unittest discover -s tests -v
```

## Credits and references

BlueSentinel AI uses Ultralytics, PyTorch, FastAPI, React, Vite, Pillow, and the supplied marine-litter checkpoint. Official YOLO26 terminology is based on [Ultralytics YOLO26 documentation](https://docs.ultralytics.com/models/yolo26), the [YOLO26 training recipe](https://docs.ultralytics.com/guides/yolo26-training-recipe), and [Ultralytics training documentation](https://docs.ultralytics.com/modes/train). Dataset attribution remains to be completed from the original dataset source because the supplied prototype did not include authoritative dataset creator details.

## Known limitations and future work

This is a single-class detector with possible false positives, false negatives, domain shift, small-object difficulty, and CPU latency. It does not include a marine-scene relevance classifier, video tracking, segmentation, or locked-test evaluation. Future work includes dataset auditing, multi-class taxonomy, video and drone input, temporal tracking, segmentation, ONNX/TensorRT export, quantization, and edge-device benchmarking.
