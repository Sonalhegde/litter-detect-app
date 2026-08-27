# Threat model and defensive controls

This is a public research prototype that receives untrusted image uploads and runs a trusted local YOLO checkpoint. The main security objectives are preserving service availability, preventing arbitrary code/model loading, avoiding persistent storage of uploaded images, and preventing internal implementation details from crossing the HTTP boundary.

| Threat | Implemented control | Residual risk / next control |
| --- | --- | --- |
| Filename, extension, or MIME spoofing | Pillow opens and verifies bytes; only decoded JPEG, PNG, and WebP formats are accepted. The server does not use the client filename for storage or paths. | Parser vulnerabilities remain possible; dependencies must remain patched. |
| Oversized or compressed high-pixel input | Byte cap, content-length guard, width/height cap, pixel cap, decompression-bomb warning-as-error, and tests for compressed high-pixel PNGs. | A request without a correct `Content-Length` still reaches bounded application parsing before the byte-read cap. An edge request-size control should be added for high traffic. |
| Public API exhaustion | A per-instance sliding-window limiter and an async semaphore of one model invocation are applied before inference. | Per-instance memory is not shared across scaled instances. Adopt a shared edge rate limiter for production traffic. |
| Arbitrary checkpoint loading | Five static model identifiers are allowlisted; no request can provide a path or URL. Only the configured local YOLO26s checkpoint is checksum-verified before load. | PyTorch-style `.pt` loading remains a trusted-artifact operation. Do not accept user-supplied checkpoints. |
| Internal information leakage | Typed success responses and safe error envelopes are used. Errors exclude tracebacks, local paths, headers, raw image bytes, and model internals. Request IDs support operator correlation. | Hosting-provider logs should be reviewed for retention and access control. |
| Untrusted browser origins | CORS allows the stated Vercel origin and local development origins only, with credentials disabled. | CORS is not authentication. If the service becomes non-public, add application-layer authentication. |
| Cross-site scripting through results | Results are rendered as React text and numeric SVG attributes; no untrusted HTML is injected. | Maintain this constraint if rich reports or user notes are added. |

## Design rationale

OWASP recommends defence in depth for file uploads, emphasizing content validation instead of trust in a client-supplied `Content-Type`, bounded size, filename safety, and cautious storage design. This service has no upload retrieval endpoint and does not persist request images, reducing the exposure created by user-controlled stored content. [1]

Pillow documents `Image.open()` as a lazy operation and recommends treating its decompression-bomb warning as an error when appropriate; the service explicitly validates pixel bounds before allowing model execution. [2]

FastAPI response models validate and filter documented response fields. The API uses explicit Pydantic schemas for model, health, and detection responses to reduce accidental exposure of internal objects. [3]

## Verification boundaries

The test suite exercises malformed bytes, content-type deception, unsupported formats, traversal-like and Unicode filenames, long names, byte and decoded-pixel limits, CORS rejection, request rate limiting, invalid model IDs, unavailable models, method misuse, and safe error envelopes. It is not a substitute for an external penetration test, malware scanning program, formal compliance review, or production DDoS protection.

## References

[1] [OWASP, *File Upload Cheat Sheet*](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)

[2] [Pillow documentation, *Image module: decompression-bomb protection*](https://pillow.readthedocs.io/en/stable/reference/Image.html)

[3] [FastAPI documentation, *Response Model — Return Type*](https://fastapi.tiangolo.com/tutorial/response-model/)
