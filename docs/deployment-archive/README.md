# Deployment archive

These files supported Vercel + Render hosting. The project now runs **locally only**; nothing in the active dev runtime depends on this folder.

To redeploy later, restore paths from git history or copy artifacts back to the repo root (e.g. `render.yaml`, `.github/workflows/render-keepalive.yml`).

| File | Former purpose |
| --- | --- |
| `render.yaml` | Render Blueprint (512 MB / free-tier limits) |
| `render-keepalive.yml` | GitHub Actions ping to avoid Render cold starts |
| `keep-alive.md`, `deployment.md`, `deployment-status.md` | Hosted ops notes |
| `render-smoke-findings.md` | Production smoke-test log |
| `onnxInference.ts` | Retired Node/ONNX inference fallback |

Local defaults live in `backend/app/config.py` and `backend/.env.example`.
