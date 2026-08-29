# YOLO26

YOLO26 is the model family used by the prototype. Ultralytics describes it as an end-to-end family with native NMS-free inference, a lighter detection head, DFL-free regression, Progressive Loss, STAL, and an updated training recipe.[1]

Shoreline Litter Detector uses only the object-detection task and only the supplied custom YOLO26s marine-litter checkpoint for the currently available workflow. The interface exposes the n/s/m/l/x family choices for future experiments, but a choice is executable only when a compatible checkpoint is present.

## Why YOLO26

The family provides a coherent scale range for comparing deployment trade-offs. Nano favors lighter deployment, small is the supplied baseline, and medium/large/x are capacity options that should be evaluated against the same locked test protocol before any research conclusion is made. This project does not claim that a larger official checkpoint is better for marine litter without evidence.

## References

[1]: https://docs.ultralytics.com/models/yolo26 "Ultralytics YOLO26 documentation"
[2]: https://docs.ultralytics.com/guides/yolo26-training-recipe "Ultralytics YOLO26 training recipe"
