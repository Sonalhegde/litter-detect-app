# Tideline Intelligence — Litter Detection

Tideline Intelligence is a deployment-oriented web application for reviewing coastal and shoreline images with purpose-trained YOLO litter detectors. It preserves the supplied prototype’s essential path: a browser uploads one image, the service runs model inference at `1280` pixels with a `0.25` confidence threshold and `0.45` IoU threshold, and the client displays each returned bounding box, label, confidence, coordinate, and aggregate summary.

The frontend is a Vite/React single-page application configured for Vercel. The independent FastAPI service is configured for Render and keeps selected YOLO models resident after the first request. This separation prevents browser clients from handling model weights and gives each service a clear deployment boundary.

## Model integrity

| Model selector | Expected asset | Status in supplied archive | API behavior |
|---|---|---:|---|
| `YOLO26s` | `inference-backend/models/best.pt` | Present; SHA-256 `d52d0d489e8e46bc55b8a46091c5dfc689bc1d21979b1450433af9cfe26036e5` | Available when its checkpoint loads. |
| `YOLO26n` | `inference-backend/models/yolo26n.pt` | Not present | Visible in the selector; produces a clear setup error until a genuine Nano checkpoint is supplied. |

The supplied `best.pt` checkpoint is preserved byte-for-byte and is mapped to `YOLO26s` because its embedded metadata identifies `yolo26s`. The application does not relabel this model, fall back to it for Nano requests, or manufacture an additional checkpoint. See [`inference-backend/models/MODELS.md`](inference-backend/models/MODELS.md) for the asset policy.

## Repository layout

| Path | Role |
|---|---|
| `client/` | Polished React upload, model-selector, processing-state, box-overlay, and detection-ledger interface. |
| `inference-backend/` | Isolated FastAPI inference service, dual-model registry, input validation, narrow CORS policy, tests, and Dockerfile. |
| `render.yaml` | Render Blueprint for the inference service. |
| `vercel.json` | Vercel Vite build/output configuration and SPA rewrite. |
| `.gitattributes` | Git LFS mapping for intentionally versioned source model checkpoints. |

## Local development

Use separate terminals for the frontend and inference service. Copy each component’s `.env.example` to `.env` and adjust the values for your local environment. Do not commit a real `.env` file.

```bash
# Terminal 1 — inference API
cd inference-backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2 — frontend
pnpm install
pnpm dev
```

Set `VITE_INFERENCE_API_URL=http://127.0.0.1:8000` for the local frontend, and include the frontend origin in `CORS_ALLOWED_ORIGINS`. Confirm availability at `GET /health`; submit an image to `POST /v1/detections` with multipart fields `file` and `model`.

## Vercel frontend deployment

Vercel deploys the Vite frontend from the repository root using `pnpm run build:frontend`, with `dist/public` as the output folder. The committed `vercel.json` also includes the SPA rewrite required for deep-linking in a Vite single-page application. In Vercel’s project settings, create the following environment variable for **Production** and **Preview**:

| Variable | Value |
|---|---|
| `VITE_INFERENCE_API_URL` | The HTTPS URL of the deployed Render inference service, for example `https://litter-detect-inference.onrender.com`. |

Because Vite only exposes environment variables prefixed with `VITE` to browser bundles, this public API URL is intentionally not a secret.[1]

## Render inference deployment

Create a new Render Blueprint from this GitHub repository or create a Docker Web Service with `inference-backend/Dockerfile` as Dockerfile path and `inference-backend` as the Docker build context. The committed `render.yaml` defines the same configuration and uses `/health` for service checks. Render supports Docker-based services from a repository Dockerfile and supports `dockerfilePath` and `dockerContext` for monorepos.[2] [3]

Before the first production deploy, set `CORS_ALLOWED_ORIGINS` in Render to the exact Vercel origin, such as `https://your-project.vercel.app`. Use a comma-separated list only when intentionally supporting multiple browser origins. After you create the Vercel project, add its final production URL to Render and redeploy the inference service.

| Render variable | Required value |
|---|---|
| `CORS_ALLOWED_ORIGINS` | Exact Vercel production origin, with no wildcard. |
| `YOLO26S_MODEL_PATH` | `/app/models/best.pt` unless storing the verified checkpoint elsewhere. |
| `YOLO26N_MODEL_PATH` | `/app/models/yolo26n.pt` after a genuine Nano checkpoint is provided. |
| `INFERENCE_IMAGE_SIZE` | `1280`, retained from the supplied prototype. |
| `INFERENCE_CONFIDENCE_THRESHOLD` | `0.25`, retained from the supplied prototype. |
| `INFERENCE_IOU_THRESHOLD` | `0.45`, retained from the supplied prototype. |
| `MAX_UPLOAD_MB` | `10`; the frontend and API enforce the same limit. |

The model registry loads weights only when that model is first selected, rather than on every request. This keeps the original reuse-oriented inference workflow while allowing the health endpoint to accurately distinguish unavailable model assets.

## Git LFS and model assets

The intended source checkpoints are marked for Git LFS in `.gitattributes`; other model exports and generated artifacts remain ignored. Install Git LFS before first commit and use `git lfs install`. GitHub blocks regular Git pushes for files larger than 100 MiB, while Git LFS is designed to store large binary objects separately from normal repository history.[4] [5]

If deployment from Git requires LFS checkout support, enable it in the provider’s project settings or use an approved model artifact delivery method. Vercel exposes a Git LFS setting on connected projects.[6] Never put secrets, API keys, virtual environments, prediction outputs, or generated model exports into Git.

## Verification

```bash
# Frontend helpers and UI-adjacent formatting tests
pnpm test

# TypeScript integrity and Vite production build
pnpm check
pnpm run build:frontend

# Python configuration tests
cd inference-backend
PYTHONPATH=. python3 -m unittest discover -s tests -v
```

## References

[1]: https://vercel.com/docs/frameworks/frontend/vite "Vite on Vercel"
[2]: https://render.com/docs/docker "Docker on Render"
[3]: https://render.com/docs/blueprint-spec "Render Blueprint YAML Reference"
[4]: https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github "About large files on GitHub"
[5]: https://docs.github.com/repositories/working-with-files/managing-large-files/about-git-large-file-storage "About Git Large File Storage"
[6]: https://vercel.com/docs/project-configuration/git-settings "Vercel Git settings"
