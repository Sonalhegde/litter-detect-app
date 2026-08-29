# Shoreline Litter Detector overview

Shoreline Litter Detector demonstrates a browser-to-backend computer-vision workflow for marine and coastal imagery. The system accepts a JPEG, PNG, or WebP image, sends it to a FastAPI inference service, runs the selected YOLO26 checkpoint, and returns structured detections with class labels, confidence scores, coordinates, image dimensions, and elapsed inference time.

The deployed research scope is intentionally narrow. The supplied model is a single-class detector for `litter` and is not a general object detector or a marine-scene relevance classifier. If no detection exceeds the configured threshold, the correct interpretation is **No marine debris detected by this trained litter-class model above the configured threshold**. That result does not prove an image contains no objects or no debris.

## Research status

| Area | Status |
|---|---|
| Supplied YOLO26s checkpoint packaging | Completed |
| Browser upload and result visualization | Completed |
| FastAPI inference service and CPU deployment | Completed |
| YOLO26s validation analysis | Reported validation results only |
| Locked 852-image test evaluation | Pending evaluation |
| YOLO26n/m/l/x marine-litter comparison | Pending checkpoint and evaluation |
| Dataset cleaning audit | Proposed; not performed blindly |

The interface and documentation intentionally distinguish training, validation, test, and deployment/inference measurements. No test-set result is claimed until the locked test set is evaluated independently.
