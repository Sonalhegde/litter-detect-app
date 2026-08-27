# Data cleaning

Dataset cleaning should be evidence-driven rather than destructive. Review corrupted or unreadable images, duplicates and near-duplicates, missing or mismatched labels, malformed YOLO rows, invalid normalized coordinates, overlapping boxes, tiny objects, unlabeled litter, class errors, and train/validation leakage.

The recommended workflow is to generate a review report, inspect uncertain examples, correct labels with provenance, and retain a before/after record. No automatic deletion or invented correction is included in this application. A full cleaning audit is **pending evaluation**.

# Training

The supplied YOLO26s checkpoint represents the completed training artifact used by the application. The original prototype recorded a 109-epoch run and approximately 4.24 hours of training, with the selected checkpoint near epoch 89. The exact training data source, augmentation log, seed, hardware, and complete command should be recorded from the original experiment artifacts before claiming full reproducibility.

Ultralytics’ official YOLO26 recipe is documented separately and should not be conflated with this custom marine-litter training run.[1]

[1]: https://docs.ultralytics.com/guides/yolo26-training-recipe "Ultralytics YOLO26 training recipe"
