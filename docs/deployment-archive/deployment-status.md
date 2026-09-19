# Deployment status

The private GitHub repository is available at `https://github.com/Sonalhegde/litter-detect-app`. 

**Single-backend architecture:** All inference now goes through the Python/FastAPI backend (`litter-detect-inference.onrender.com`). The Node/ONNX inference service (`sentinal-yhe0.onrender.com`) has been retired and no longer serves production traffic. The frontend (`client/src/lib/detection.ts`) points directly at the Python service via `VITE_INFERENCE_API_URL`, with a runtime warning if unset in production.

The Render dashboard Blueprint has been updated to reference the single Python service. CORS_ALLOWED_ORIGINS is configured to allow the Vercel production domain. The `/health` endpoint on the Python service reports model registry status including the scene-relevance checker.

The Vercel frontend is deployed and linked to the Git repository. Health checks are configured via `.github/workflows/render-keepalive.yml` to ping `/health` every 10 minutes with random jitter.

Scene-relevance enforcement: The frontend now properly handles `sceneRelevance` verdicts ("pass"/"warn"/"block") from the Python backend. A "block" verdict surfaces a "this doesn't look like a marine/litter photo" message instead of showing fabricated detections. A "warn" verdict shows a visible non-blocking caveat.
