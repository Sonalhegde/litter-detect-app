# Threat model and defensive controls

> **Scope note:** Sentinal runs as a **local-only** application (browser + FastAPI on localhost). Threats that assume anonymous internet-wide abuse are marked **hosted N/A**; upload and resource-exhaustion controls remain fully in force.

This tool receives untrusted image uploads and runs a trusted local YOLO checkpoint. Security objectives: prevent arbitrary code/model loading, avoid persistent storage of uploads, and prevent internal implementation details from crossing the HTTP boundary.

| Threat | Implemented control | Residual risk / notes |
| --- | --- | --- |
| Filename, extension, or MIME spoofing | Pillow opens and verifies bytes; only decoded JPEG, PNG, and WebP are accepted. Filenames are not used for storage paths. | Parser vulnerabilities remain possible; keep dependencies patched. |
| Oversized or compressed high-pixel input | Byte cap, content-length guard, width/height cap, pixel cap, decompression-bomb warning-as-error, regression tests. | Still applies locally — a huge file can exhaust RAM on your machine. |
| API exhaustion from unknown IPs **(hosted N/A)** | Optional sliding-window rate limit (`RATE_LIMIT_ENABLED`, default off) and asyncio semaphore for concurrent inference. | On localhost, abuse from arbitrary internet clients is **N/A**. Local concurrency limits still prevent accidental parallel overload. |
| Arbitrary checkpoint loading | Five static model IDs; no request path/URL for weights. YOLO26s ONNX is checksum-verified before load. | Do not accept user-supplied checkpoints. |
| Internal information leakage | Typed success responses and safe error envelopes; no tracebacks, paths, or raw bytes in HTTP responses. Request IDs for correlation. | Local server logs may still contain paths — review log retention on shared machines. |
| Untrusted browser origins **(partially N/A)** | CORS allowlist defaults to `localhost` / `127.0.0.1` on ports 3000 and 5173. | Remote-origin drive-by abuse is **N/A** when not exposed to the internet. CORS still matters if you bind to `0.0.0.0` on a shared network. |
| Cross-site scripting through results | Results rendered as React text and numeric SVG attributes; no untrusted HTML injection. | Maintain this constraint if rich reports are added. |

## Design rationale

OWASP file-upload guidance emphasizes content validation over trusting client `Content-Type`, bounded size, filename safety, and cautious storage. This service has no upload retrieval endpoint and does not persist request images. [1]

Pillow recommends treating decompression-bomb warnings as errors; the service validates pixel bounds before model execution. [2]

FastAPI/Pydantic response models filter documented fields to reduce accidental exposure. [3]

## Verification boundaries

The test suite exercises malformed bytes, content-type deception, unsupported formats, traversal-like filenames, byte and pixel limits, CORS rejection, optional rate limiting, invalid model IDs, unavailable models, and safe error envelopes. It is not a substitute for external penetration testing or formal compliance review.

## References

[1] [OWASP, *File Upload Cheat Sheet*](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)

[2] [Pillow documentation, *Image module: decompression-bomb protection*](https://pillow.readthedocs.io/en/stable/reference/Image.html)

[3] [FastAPI documentation, *Response Model — Return Type*](https://fastapi.tiangolo.com/tutorial/response-model/)
