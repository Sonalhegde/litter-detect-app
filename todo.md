# Project TODO (local-only)

## Model & accuracy

- [ ] Re-export `yolo26s.onnx` at 1280×1280 input for better small-object recall on large photos.
- [ ] Obtain and install verified ONNX checkpoints for YOLO26n, YOLO26m, YOLO26l, and/or YOLO26x under `backend/models/`.
- [ ] Fine-tune on BePLi v2 and update the checksum pin when a new artifact ships.

## Local development

- [x] Relax Render-era upload, concurrency, and rate-limit defaults for local use.
- [x] Archive hosted-deployment config (`docs/deployment-archive/`).
- [x] Point frontend API client at local backend (`127.0.0.1:8000` / `/inference-api` proxy).
- [ ] Add a small script or Makefile target that starts backend + frontend together on Windows and Unix.

## Quality & security (still applies locally)

- [x] Pillow content verification, dimension/pixel caps, and safe error envelopes.
- [x] SHA-256 model integrity pin before ONNX load.
- [x] Backend regression tests (`pytest -q`).
- [ ] Re-run controlled image smoke tests with user-supplied shoreline photos when available.
