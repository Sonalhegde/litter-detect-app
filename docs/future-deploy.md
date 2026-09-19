# Future deployment guide

The project runs **locally by default**. This document describes how to redeploy to **Vercel (frontend) + Render (Python inference API)** if you need a public demo again.

All original hosting artifacts are preserved under [`docs/deployment-archive/`](deployment-archive/). Nothing in the active local runtime depends on them until you restore and configure them as below.

---

## Archive inventory

| File | Restore to | Purpose |
| --- | --- | --- |
| `vercel.json` | repo root | Vercel build + SPA rewrites |
| `render.yaml` | repo root | Render Blueprint for the FastAPI Docker service |
| `render-keepalive.yml` | `.github/workflows/render-keepalive.yml` | Scheduled `/health` ping (Render Free cold starts) |
| `client.env.production.example` | reference → `client/.env` at build time | `VITE_INFERENCE_API_URL` for production bundle |
| `backend.env.production.example` | Render dashboard / `render.yaml` | Hosted resource limits + CORS |
| `deployment.md` | — (reference) | Original deployment overview |
| `deployment-status.md` | — (reference) | Last known production architecture notes |
| `keep-alive.md` | — (reference) | Keep-alive options and caveats |
| `render-smoke-findings.md` | — (reference) | Production smoke-test log |
| `onnxInference.ts` | — (reference only) | Retired Node ONNX fallback — **do not restore** |

---

## 1. Restore hosting files

From the repo root:

```bash
cp docs/deployment-archive/vercel.json .
cp docs/deployment-archive/render.yaml .
mkdir -p .github/workflows
cp docs/deployment-archive/render-keepalive.yml .github/workflows/render-keepalive.yml
```

Update URLs inside `render-keepalive.yml` and `render.yaml` if your Render service name or Vercel domain changed.

---

## 2. Deploy the backend (Render)

1. Connect the GitHub repo to [Render](https://render.com) and create a **Web Service** from `render.yaml` (Docker, `backend/Dockerfile`).
2. Confirm `backend/models/yolo26s.onnx` is present in the image (Git LFS / binary checkout).
3. Set environment variables — start from [`backend.env.production.example`](deployment-archive/backend.env.production.example):
   - **`CORS_ALLOWED_ORIGINS`** must include your exact Vercel origin (e.g. `https://sentinal-theta.vercel.app`).
   - **`YOLO26S_MODEL_SHA256`** must match the ONNX file on disk.
   - Use **Render-tier limits** (`INFERENCE_IMAGE_SIZE=320`, `MAX_UPLOAD_MB=8`, `INFERENCE_CONCURRENCY=1`, `RATE_LIMIT_ENABLED=true`).
4. Set **`TRUST_PROXY_HEADERS=true`** on Render so client IP resolution works behind their proxy.
5. Verify: `GET https://<your-service>.onrender.com/health` returns `yolo26s` available.

See also [`deployment-archive/deployment.md`](deployment-archive/deployment.md) and [`keep-alive.md`](deployment-archive/keep-alive.md).

---

## 3. Deploy the frontend (Vercel)

1. Import the repo on [Vercel](https://vercel.com). Root `vercel.json` sets:
   - **Build:** `pnpm run build:frontend`
   - **Output:** `dist/public`
2. Before the first production build, set in Vercel **Environment Variables** (or local `client/.env` for a test build):

   ```bash
   VITE_INFERENCE_API_URL=https://<your-service>.onrender.com
   ```

   Use the example in [`client.env.production.example`](deployment-archive/client.env.production.example).

3. Deploy and open the site. The built JS bundle bakes in `VITE_INFERENCE_API_URL` at build time — rebuild after changing it.

4. Optional: re-enable `VERCEL_GIT_COMMIT_SHA` in `vite.config.ts` for footer release markers (removed for local-only builds).

---

## 4. Wire frontend ↔ backend

| Setting | Where | Value |
| --- | --- | --- |
| `VITE_INFERENCE_API_URL` | Vercel env / `client/.env` | `https://<render-service>.onrender.com` |
| `CORS_ALLOWED_ORIGINS` | Render env | Your Vercel URL(s), comma-separated |
| Keep-alive URL | `.github/workflows/render-keepalive.yml` | `https://<render-service>.onrender.com/health` |

**CORS mismatch** is the most common production failure: the browser origin must appear exactly in `CORS_ALLOWED_ORIGINS` (scheme + host, no trailing slash).

For local dev after redeploying, keep using `http://127.0.0.1:8000` or the `/inference-api` proxy — do not point local `.env` at Render unless you intend to test production CORS remotely.

---

## 5. Enable keep-alive (Render Free)

Render Free spins down after ~15 minutes idle. Copy the workflow from the archive and enable GitHub Actions schedules, or use an external HTTPS monitor on `GET /health` every ~10 minutes.

Details: [`deployment-archive/keep-alive.md`](deployment-archive/keep-alive.md).

Paid Render **always-on** is the reliable alternative if cold starts are unacceptable.

---

## 6. Post-deploy verification

- [ ] `curl https://<render>/health` — models list, `yolo26s` available
- [ ] `curl -X OPTIONS https://<render>/health -H "Origin: https://<vercel>" -H "Access-Control-Request-Method: GET"` — `200` with matching `Access-Control-Allow-Origin`
- [ ] Upload a test image from the Vercel UI — detections or safe empty result, no CORS errors
- [ ] Grep production JS bundle: no stale `onrender.com` URL unless that is your current backend
- [ ] `pytest -q` in `backend/` still passes before tagging a release

---

## 7. What not to restore

- **`onnxInference.ts`** — retired; all inference goes through the Python FastAPI service.
- **Local-relaxed limits** in `backend/app/config.py` — override via Render env vars instead of changing code defaults if you want to keep local development generous.

---

## Quick reference: local vs hosted defaults

| Variable | Local default | Render Free typical |
| --- | --- | --- |
| `INFERENCE_IMAGE_SIZE` | 1280 (export target) | 320 |
| `MAX_UPLOAD_MB` | 50 | 8 |
| `MAX_IMAGE_WIDTH/HEIGHT` | 12000 | 3000 |
| `MAX_IMAGE_PIXELS` | 120000000 | 6000000 |
| `INFERENCE_CONCURRENCY` | CPU count | 1 |
| `RATE_LIMIT_ENABLED` | false | true |
| `CORS_ALLOWED_ORIGINS` | localhost:3000/5173 | Vercel production URL |

Local defaults: `backend/app/config.py` and `backend/.env.example`.
