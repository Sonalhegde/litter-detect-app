# Deployment

The frontend is a Vite build deployed to Vercel with `pnpm run build:frontend` and `dist/public` as its output directory. The footer displays the first seven characters of Vercel’s `VERCEL_GIT_COMMIT_SHA` at build time (or `local` outside Vercel), providing a visible release marker without exposing secrets. Set `VITE_INFERENCE_API_URL` to the Render backend origin. The backend is a Docker web service deployed from `backend/Dockerfile` through `render.yaml`; set `CORS_ALLOWED_ORIGINS` to the exact Vercel origin.

The Render image installs the small direct runtime set: ONNX Runtime, NumPy, headless OpenCV, FastAPI, Pillow, and multipart parsing. The required derived YOLO26s artifact must be available at `/app/models/yolo26s.onnx` or the path configured in `YOLO26S_MODEL_PATH`, with its matching SHA-256 in `YOLO26S_MODEL_SHA256`. The supplied `yolo26s.pt` remains preserved in the image as the controlled source checkpoint. The remaining family options intentionally remain unavailable until their own checkpoints are installed.

Use the health endpoint for service monitoring. For Free Render, see `docs/keep-alive.md`; an external 10-minute health check reduces ordinary idle spin-down risk but cannot guarantee continuous availability. A paid always-on service is the stronger production option.
