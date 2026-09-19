# Release verification plan (local-only)

> **Scope note:** This project runs entirely on localhost. Checks marked **hosted N/A** applied to the former Vercel/Render deployment and are retained here for historical context only.

The release checks are separated into **code-contract tests**, **controlled image tests**, and **local integration checks**. A real detection confirms the API can load the trusted checkpoint and return the documented response shape — not benchmark performance.

| Category | Cases | Acceptance condition |
| --- | --- | --- |
| API contract | Root, health, models, both detection-route aliases, invalid method, malformed request. | Stable status codes and documented safe response envelopes. |
| Upload validation | Empty file, random bytes, GIF disguised as PNG, JPEG disguised as text, traversal-like/Unicode/long filenames, byte limit, high-pixel compressed PNG. | Rejected or accepted solely by verified content and configured resource limits; no traceback or filesystem path reaches the client. |
| Model controls | All five IDs, malformed model values, missing checkpoints, checksum mismatch. | Only allowlisted IDs work; unavailable or untrusted artifacts return safe `503` errors. |
| Browser integration | Selected file, model availability, busy/timeout errors, returned detection overlay, zero-detection explanation, documentation tabs. | All controls remain usable by keyboard and display safe, specific guidance. |
| Real-image smoke test | At least one legally reusable shoreline/debris image and a supplied user image, where permission permits. | Report raw observed response only; do not convert it into dataset-level performance evidence. |
| Local integration | `uvicorn` on `:8000`, frontend dev server on `:3000`, `/inference-api` proxy, CORS preflight from allowed local origins. | Backend reports YOLO26s available; frontend reaches `127.0.0.1:8000` with no remote fallback URL. |
| Hosted deployment **(N/A)** | Former Render health/models/CORS and Vercel static bundle checks. | **Out of scope** — see `docs/deployment-archive/` if redeploying. |

The supplied archive contained no locked test set or labels. Consequently, all final performance metrics beyond reported smoke tests remain **PENDING TEST-SET EVALUATION**.
