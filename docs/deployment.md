# Deployment

The frontend is a Vite build deployed to Vercel with `pnpm run build:frontend` and `dist/public` as its output directory. Set `VITE_INFERENCE_API_URL` to the Render backend origin. The backend is a Docker web service deployed from `inference-backend/Dockerfile` through `render.yaml`; set `CORS_ALLOWED_ORIGINS` to the exact Vercel origin.

The Render image installs Python dependencies and the OpenCV shared libraries required by the headless inference runtime. The YOLO26s checkpoint must be available at `/app/models/yolo26s.pt` or the path configured in `YOLO26S_MODEL_PATH`. The remaining family options intentionally remain unavailable until their own checkpoints are installed.

Use the health endpoint for service monitoring. For Free Render, see `docs/keep-alive.md`; an external 10-minute health check reduces ordinary idle spin-down risk but cannot guarantee continuous availability. A paid always-on service is the stronger production option.
