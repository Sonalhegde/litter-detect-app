# Release verification plan

The release checks are intentionally separated into **code-contract tests**, **controlled image tests**, and **deployment checks**. A real detection is not accepted as a performance claim; it only confirms that the deployed API can load the trusted checkpoint and return the documented response shape.

| Category | Cases | Acceptance condition |
| --- | --- | --- |
| API contract | Root, health, models, both detection-route aliases, invalid method, malformed request. | Stable status codes and documented safe response envelopes. |
| Upload validation | Empty file, random bytes, GIF disguised as PNG, JPEG disguised as text, traversal-like/Unicode/long filenames, byte limit, high-pixel compressed PNG. | Rejected or accepted solely by verified content and configured resource limits; no traceback or filesystem path reaches the client. |
| Model controls | All five IDs, malformed model values, missing checkpoints, checksum mismatch. | Only allowlisted IDs work; unavailable or untrusted artifacts return safe `503` errors. |
| Browser integration | Selected file, model availability, busy/timeout errors, returned detection overlay, zero-detection explanation, documentation tabs. | All controls remain usable by keyboard and display safe, specific guidance. |
| Real-image smoke test | At least one legally reusable shoreline/debris image and a supplied user image, where permission permits. | Report raw observed response only; do not convert it into dataset-level performance evidence. |
| Deployment | Render health/models/CORS and Vercel static bundle. | Backend identifies YOLO26s as available, frontend calls the intended live endpoint, and unauthorized CORS origin is rejected. |

The supplied archive contained no locked test set or labels. Consequently, all final performance metrics beyond the reported validation record remain **PENDING TEST-SET EVALUATION**.
