# Render deployment and smoke-test status

## Superseded production observation

The previous Render deployment on commit `70b0146` exposed the five-model registry and reported the supplied YOLO26s checkpoint as available. However, an earlier multipart inference request produced HTTP `502` during model execution. That result applied to the pre-hardening deployment and must not be used to characterize the current commit.

## Current local release evidence

Earlier live Render checks confirmed the restructured health/model registry and CORS policy but did not complete live model execution: a 640-pixel request timed out and a later 320-pixel CPU-only-PyTorch attempt returned HTTP `502`, while health remained responsive. The new local mitigation preserves the supplied `yolo26s.pt` and uses a SHA-256-pinned, fixed-320 ONNX artifact (37,993,343 bytes; `969bbf4733dd1486478e55cbb511569dc0bb7a75cf889597274b02b336b3ceb2`) with direct ONNX Runtime, NumPy NMS, and headless OpenCV preprocessing. A clean runtime-only environment completed the full backend suite (22 passed), four synthetic control requests (all zero boxes), and one ephemeral NOAA-gallery image request (3 returned boxes, maximum confidence 0.7355, 0.017 seconds measured backend inference time). The live Render service then completed one public request with 3 boxes, maximum confidence 0.7355, and 0.52 seconds measured backend inference time, reporting `engine: onnxruntime`, `device: cpu`, and `input_size: 320`. These are integration observations, not model-quality or benchmark claims. The current BlueSentinel Vercel origin still fails CORS preflight because the manually configured Render allowlist contains only the older Vercel origin.

## Required production follow-up

The direct ONNX runtime is now live and has passed one public integration request. The remaining production follow-up is to update Render’s manually configured `CORS_ALLOWED_ORIGINS` to include `https://bluesentinel-ai.vercel.app` (while retaining the older origin if desired), then repeat the preflight from that origin. The GitHub Actions health probe may reduce inactivity but cannot guarantee availability or resolve an out-of-memory/runtime failure on Render Free.
