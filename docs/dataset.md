# Dataset

The supplied project describes a marine-litter or marine-debris detection dataset with one class: `litter` (class ID 0). The reported split is 2,765 training images, 864 validation images, and 852 test images, for 4,481 images total. The test split is treated as locked and unseen; it must not be modified based on model performance.

YOLO labels use one row per object in the form `class_id x_center y_center width height`, with coordinates normalized to the image width and height. Label filenames must correspond to image filenames. Dataset quality checks should cover corrupted images, duplicate and near-duplicate images, incorrect or missing labels, bad boxes, extremely small boxes, unlabeled litter, class-assignment errors, and train/validation leakage. Difficult examples should be reviewed rather than deleted automatically.

Dataset attribution: source details to be completed from the original dataset source. The supplied prototype did not include authoritative creator or publication information.
