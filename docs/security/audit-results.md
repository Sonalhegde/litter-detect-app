# Release audit results

**Scope.** This record covers the reviewed repository state immediately before the ONNX runtime revision is pushed. It distinguishes locally verified controls from checks that require the external Vercel and Render deployments to complete after the push.

| Area | Evidence | Result |
| --- | --- | --- |
| Backend code structure | FastAPI routes, schemas, configuration, logging, image processing, inference, model registry controls, and rate limiting are separated under `backend/app/`. | Pass |
| Model integrity | The supplied `yolo26s.pt` remains byte-preserved at SHA-256 `d52d0d489e8e46bc55b8a46091c5dfc689bc1d21979b1450433af9cfe26036e5`. The fixed-320 derived deployment artifact `yolo26s.onnx` is checksum-pinned to `969bbf4733dd1486478e55cbb511569dc0bb7a75cf889597274b02b336b3ceb2` before lazy load. | Pass |
| Upload controls | Content verification, allowlisted formats, byte/dimension/pixel limits, decompression-bomb handling, non-persistent processing, and safe errors have regression coverage. | Pass |
| Model and API controls | Five static model IDs, unavailable-model `503`, typed responses, request IDs, CORS allowlist, per-instance rate limiting, and serialized inference are covered by tests. | Pass |
| Python tests | A clean production-dependency environment completed `pytest -q` with **22 passed**, including direct ONNX letterbox, NMS, and coordinate-restoration coverage. | Pass |
| Python static analysis | `bandit -q -r backend/app` completed with no findings. | Pass |
| Python dependencies | A clean environment installed the revised production requirements, `pip check` returned no broken requirements, and `pip-audit -r backend/requirements.txt` returned **No known vulnerabilities found**. The deployed request path no longer installs PyTorch, torchvision, or Ultralytics. | Pass |
| Frontend tests and build | Type check passed; Vitest completed with **5 passed**; complete production build completed. | Pass |
| JavaScript production dependencies | `pnpm audit --prod --json` reported zero advisory records and zero vulnerabilities after pruning unreachable Streamdown/Recharts template features and updating direct runtime dependencies. | Pass |
| Local CORS | Allowed Vercel origin preflight returned `200` and `access-control-allow-origin`; untrusted origin returned `400` without that origin header. | Pass |
| Controlled model smoke tests | The clean ONNX Runtime service processed black, white, gradient, and noisy images with zero boxes. An ephemeral NOAA-gallery search asset completed locally at 320-pixel input with 3 returned boxes, maximum reported confidence 0.7355, and 0.017 seconds measured backend inference time. See `external-verification-sources.md` for strict source and interpretation limits. | Pass; not a benchmark |
| User attachments | Supplied images were screenshots, not standalone shoreline bytes; no screenshot was misrepresented as independent scene evidence. | Pass |
| Live Render/Vercel | The verified ONNX revision has not yet been pushed/deployed. Before it can be called live, Render must rebuild it and complete one public image request. The known pre-ONNX Render 640-pixel timeout and 320-pixel HTTP 502 remain historical evidence of free-tier runtime instability, not a successful live result. The Git-linked Vercel BlueSentinel project must also be rechecked after the next push. | Pending |

## Known non-blocking release notes

The frontend build emits a bundle-size advisory because the generated JavaScript bundle exceeds 500 kB after minification. The current build succeeds and the route surface is intentionally small. Further code splitting can be evaluated as a performance enhancement but is not represented as a security fix.

The root package manager emits a migration warning that the legacy `pnpm` configuration field in `package.json` is not read by the installed pnpm version. This does not affect the completed lockfile installation, test, build, or zero-advisory production audit; it should be migrated to a workspace configuration file if the project later relies on those legacy override settings.
