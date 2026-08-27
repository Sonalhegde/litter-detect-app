# Why YOLO26

YOLO26 is a sensible family for this prototype because it offers a consistent set of detection scales and a modern end-to-end inference design. The selection interface separates model capacity from model availability: only YOLO26s is currently backed by the supplied custom marine-litter checkpoint.

The correct research question is not whether the largest scale is automatically best. Each scale must be evaluated on the same locked test set and reported with precision, recall, mAP, latency, memory, image size, confidence threshold, and hardware. Until that experiment is completed, n/m/l/x remain documented options rather than claimed improvements.

Official family terminology is available in [Ultralytics YOLO26 documentation](https://docs.ultralytics.com/models/yolo26). The supplied custom checkpoint remains the source of truth for this project’s marine-litter behavior.
