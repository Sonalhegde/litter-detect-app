# Release audit results

**Scope.** This record covers the reviewed repository state immediately before the current GitHub push. It distinguishes locally verified controls from checks that require the external Vercel and Render deployments to complete after the push.

| Area | Evidence | Result |
| --- | --- | --- |
| Backend code structure | FastAPI routes, schemas, configuration, logging, image processing, inference, model registry controls, and rate limiting are separated under `backend/app/`. | Pass |
| Model integrity | The supplied YOLO26s file remains checksum-pinned to `d52d0d489e8e46bc55b8a46091c5dfc689bc1d21979b1450433af9cfe26036e5` before lazy load. | Pass |
| Upload controls | Content verification, allowlisted formats, byte/dimension/pixel limits, decompression-bomb handling, non-persistent processing, and safe errors have regression coverage. | Pass |
| Model and API controls | Five static model IDs, unavailable-model `503`, typed responses, request IDs, CORS allowlist, per-instance rate limiting, and serialized inference are covered by tests. | Pass |
| Python tests | `pytest -q` completed with **19 passed**. One upstream FastAPI/Starlette deprecation warning was reported by the test client; it did not affect API results. | Pass with upstream warning |
| Python static analysis | `bandit -q -r app -f txt` completed with no findings after narrowing optional device metadata handling. | Pass |
| Python dependencies | `pip-audit -r backend/requirements.txt` returned **No known vulnerabilities found** after updating FastAPI, Pillow, and python-multipart pins. | Pass |
| Frontend tests and build | Type check passed; Vitest completed with **5 passed**; complete production build completed. | Pass |
| JavaScript production dependencies | `pnpm audit --prod --json` reported zero advisory records and zero vulnerabilities after pruning unreachable Streamdown/Recharts template features and updating direct runtime dependencies. | Pass |
| Local CORS | Allowed Vercel origin preflight returned `200` and `access-control-allow-origin`; untrusted origin returned `400` without that origin header. | Pass |
| Controlled model smoke tests | Checksum-pinned YOLO26s loaded locally on CPU. Black, white, gradient, and noisy images completed with zero boxes. A specifically NOAA-credited public-domain marine-debris image completed with 8 returned boxes; a USGS desert image completed with zero returned boxes. See `external-verification-sources.md` for strict interpretation limits. | Pass; not a benchmark |
| User attachments | Supplied images were screenshots, not standalone shoreline bytes; no screenshot was misrepresented as independent scene evidence. | Pass |
| Live Render/Vercel | Render deployed commit `fde0f13`; `/health`, `/models`, and CORS boundary were reconfirmed. A 1.3 MB live image request at the prior 640-pixel profile timed out before a response, while health remained available. The smaller 320-pixel profile and single-thread native pools were locally verified and require redeploy. The legacy Vercel site remains an older standalone deployment; a new Vercel Git-project request returned an integration-side 404 after creation and needs connection in Vercel settings. | Pending |

## Known non-blocking release notes

The frontend build emits a bundle-size advisory because the generated JavaScript bundle exceeds 500 kB after minification. The current build succeeds and the route surface is intentionally small. Further code splitting can be evaluated as a performance enhancement but is not represented as a security fix.

The root package manager emits a migration warning that the legacy `pnpm` configuration field in `package.json` is not read by the installed pnpm version. This does not affect the completed lockfile installation, test, build, or zero-advisory production audit; it should be migrated to a workspace configuration file if the project later relies on those legacy override settings.
