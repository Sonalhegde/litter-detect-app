# Render deployment and smoke-test status

## Superseded production observation

The previous Render deployment on commit `70b0146` exposed the five-model registry and reported the supplied YOLO26s checkpoint as available. However, an earlier multipart inference request produced HTTP `502` during model execution. That result applied to the pre-hardening deployment and must not be used to characterize the current commit.

## Current release evidence

Commit `587e949` restructures the service under `backend/`, pins the supplied YOLO26s checksum, validates decoded image content and resource limits, serializes inference, supplies safe typed errors, and reduces the Render configured image size to 640 pixels. The complete local evidence is recorded in `docs/security/audit-results.md` and `docs/security/external-verification-sources.md`; local checksum-pinned YOLO26s inference completed successfully on controlled and verified public-domain image inputs.

## Required production follow-up

Render must rebuild from commit `587e949` before the current implementation can be described as live. After it finishes, verify `GET /health`, `GET /models`, the explicit CORS allowlist, and a single `POST /v1/detections` request with the verified NOAA image. Record the returned runtime metadata and outcome without presenting it as a performance benchmark.
