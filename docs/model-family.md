# YOLO26 model family

YOLO is a one-stage object-detection family: an image passes through a learned network and the model predicts object locations and class confidence in a single inference pipeline. A bounding box is represented by four coordinates, while confidence expresses how strongly the model supports the predicted class and location.

Ultralytics describes YOLO26 as a unified real-time family with native end-to-end inference, a lighter detection head, DFL-free box regression, Progressive Loss, Small-Target-Aware Label Assignment (STAL), and MuSGD in the official training recipe.[1] The official model family supports the five detection scales below.[1]

| Model | Official fused parameters | Official fused FLOPs | Relative role | Shoreline Litter Detector status |
|---|---:|---:|---|---|
| YOLO26n | 2.4M | 5.4B | Lightweight edge baseline | Not installed |
| YOLO26s | 9.5M | 20.7B | Speed/accuracy balance | Supplied custom checkpoint |
| YOLO26m | 20.4M | 68.2B | Higher-capacity experiment | Not installed |
| YOLO26l | 24.8M | 86.4B | Large/high-accuracy experiment | Not installed |
| YOLO26x | 55.7M | 193.9B | Maximum-capacity experiment | Not installed |

The official values in this table are COCO reference-model information, not marine-litter performance. The supplied YOLO26s checkpoint was custom-fine-tuned for this project and must be evaluated on the project’s own validation and locked test data before accuracy comparisons are made.

## Architecture concepts

The backbone extracts progressively richer visual features. A neck combines information at multiple scales so small, medium, and large candidate regions can be represented. The detection head converts those features into box and class predictions. IoU measures the overlap between two boxes and is used when interpreting localization quality and overlap filtering.

YOLO26’s default one-to-one head supports end-to-end, NMS-free inference. Ultralytics also documents a one-to-many head for scenarios that require the traditional NMS-based path. The application uses the packaged Ultralytics prediction path and does not claim that every custom training run used the official COCO recipe.

P2 and P6 architecture variants are documented by Ultralytics as YAML architectures rather than supplied scale-specific pretrained weights. This project does not claim to have trained a P2 or P6 marine-litter model.

## References

[1]: https://docs.ultralytics.com/models/yolo26 "Ultralytics YOLO26 documentation"
[2]: https://docs.ultralytics.com/guides/yolo26-training-recipe "Ultralytics YOLO26 training recipe"
