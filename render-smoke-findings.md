# Render deployment and smoke-test status

## Superseded production observation

The previous Render deployment on commit `70b0146` exposed the five-model registry and reported the supplied YOLO26s checkpoint as available. However, an earlier multipart inference request produced HTTP `502` during model execution. That result applied to the pre-hardening deployment and must not be used to characterize the current commit.

## Current local release evidence

Earlier live Render checks confirmed the restructured health/model registry and CORS policy but did not complete live model execution: a 640-pixel request timed out and a later 320-pixel CPU-only-PyTorch attempt returned HTTP `502`, while health remained responsive. The new local mitigation preserves the supplied `yolo26s.pt` and uses a SHA-256-pinned, fixed-320 ONNX artifact (37,993,343 bytes; `969bbf4733dd1486478e55cbb511569dc0bb7a75cf889597274b02b336b3ceb2`) with direct ONNX Runtime, NumPy NMS, and headless OpenCV preprocessing. A clean runtime-only environment completed the full backend suite (22 passed), four synthetic control requests (all zero boxes), and one ephemeral NOAA-gallery image request (3 returned boxes, maximum confidence 0.7355, 0.017 seconds measured backend inference time). These are local integration observations, not model-quality or live-production claims.

## Required production follow-up

Render must rebuild from the next commit before the direct ONNX runtime can be described as live. After it finishes, verify `GET /health`, `GET /models`, the explicit CORS allowlist, and a single `POST /v1/detections` request with an ephemeral permitted image. Record the returned runtime metadata and outcome without presenting it as a performance benchmark. The GitHub Actions health probe may reduce inactivity but cannot guarantee availability or resolve an out-of-memory/runtime failure on Render Free.
