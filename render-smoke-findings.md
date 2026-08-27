# Render deployment and smoke-test status

## Superseded production observation

The previous Render deployment on commit `70b0146` exposed the five-model registry and reported the supplied YOLO26s checkpoint as available. However, an earlier multipart inference request produced HTTP `502` during model execution. That result applied to the pre-hardening deployment and must not be used to characterize the current commit.

## Current release evidence

Commit `fde0f13` is live and confirms the restructured health/model registry and CORS policy. The complete local evidence is recorded in `docs/security/audit-results.md` and `docs/security/external-verification-sources.md`; local checksum-pinned YOLO26s inference completed successfully on controlled and verified public-domain image inputs. A 1.3 MB live inference at the prior 640-pixel profile timed out with no response; Render logs showed a subsequent Uvicorn restart, consistent with the known tight free-instance resource envelope but not exposing a definitive traceback. The follow-up 320-pixel profile, 4 MB upload cap, 6 MP decoded-image cap, single-thread native pools, and official CPU-only PyTorch 2.12.1 / torchvision 0.27.1 wheels were verified in an isolated environment: the supplied checkpoint completed the verified image request in 1.437 seconds. The smaller container now requires deployment.

## Required production follow-up

Render must rebuild from the next commit before the new constrained profile can be described as live. After it finishes, verify `GET /health`, `GET /models`, the explicit CORS allowlist, and a single `POST /v1/detections` request with the verified NOAA image. Record the returned runtime metadata and outcome without presenting it as a performance benchmark.
