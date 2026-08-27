# How it works

The browser validates the selected image’s MIME type and 10 MB size limit, creates a local preview, and sends a multipart request to the backend. The FastAPI service validates the image bytes, resolves the requested model ID against the registry, loads that checkpoint once, and runs inference using the configured image size, confidence threshold, and IoU threshold.

The response contains structured detections rather than fabricated client-side labels. The frontend overlays the returned boxes on the uploaded image, summarizes the count and mean confidence, shows inference duration, and lists every detection with coordinates. Missing model assets return an explicit unavailable state.
