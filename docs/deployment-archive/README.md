# Deployment archive

Preserved artifacts from the **Vercel + Render** hosting setup. The active project runs locally; these files are **not used at runtime** until you follow [`../future-deploy.md`](../future-deploy.md).

## Files in this folder

| File | Purpose |
| --- | --- |
| `vercel.json` | Vercel SPA build and rewrite config |
| `render.yaml` | Render Blueprint (Docker backend, Free-tier env vars) |
| `render-keepalive.yml` | GitHub Actions workflow to ping `/health` |
| `client.env.production.example` | Production `VITE_INFERENCE_API_URL` template |
| `backend.env.production.example` | Render production env template (limits + CORS) |
| `deployment.md` | Original deployment overview |
| `deployment-status.md` | Last known production architecture notes |
| `keep-alive.md` | Cold-start mitigation runbook |
| `render-smoke-findings.md` | Production smoke-test log |
| `onnxInference.ts` | **Retired** Node ONNX fallback — reference only |

## Restore checklist

See **[`docs/future-deploy.md`](../future-deploy.md)** for step-by-step redeploy instructions.
