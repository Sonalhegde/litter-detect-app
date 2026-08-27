# Model evaluation and result interpretation

## Scope of the current checkpoint

The supplied checkpoint is preserved as `backend/models/yolo26s.pt` and identified as **YOLO26s** by the project. Its reported class map contains one detectable class: `litter`. The application therefore uses the label **marine debris** as an interface phrase only when explaining the intended scenario; the actual returned class is the trained `litter` label. It does not infer debris material, hazard level, source, category hierarchy, scene type, or absence of all objects.

## Reported validation figures

The following values came with the project requirements and are displayed as **validation figures**, not as an independent re-evaluation performed in this revision.

| Split | Precision | Recall | mAP@50 | mAP@50–95 | Status |
| --- | ---: | ---: | ---: | ---: | --- |
| Supplied validation record | 61.89% | 53.61% | 55.44% | 27.16% | Reported, not independently reproduced |
| Locked 852-image test set | PENDING TEST-SET EVALUATION | PENDING TEST-SET EVALUATION | PENDING TEST-SET EVALUATION | PENDING TEST-SET EVALUATION | Labels were not supplied |

The project also reports 2,765 training images and 864 validation images. These counts, training details, and metrics remain conditional on the source experiment record until the original data, split manifest, labels, and evaluation command are made available.

## Operational interpretation

> A detection confidence is a model output used for thresholding, not a calibrated probability that an environmental conclusion is true.

The live service reports the configured confidence threshold, IoU threshold, input size, runtime device, and processing duration with each response. This is included to make each UI observation traceable to the deployed inference configuration. A result of **“No marine debris detected”** means no predicted `litter` box crossed the configured threshold. It does not prove that the image has no debris, no objects, or no environmental concern.

The project must not claim FPS, continuous video performance, false-positive rate, false-negative rate, material-level accuracy, or test-set metrics until a controlled measurement protocol and locked labels are supplied.

## Required next evaluation

Run the checksum-pinned checkpoint over the held-out labeled test split without changing confidence, IoU, input size, preprocessing, or class mapping from the evaluated deployment. Save the full predictions, calculate precision, recall, F1, mAP@50, mAP@50–95, and threshold curves; inspect false positives and false negatives by scene condition; then publish the exact commands, package versions, model fingerprint, and split hash. This is the minimum evidence required to turn the current validation record into a reproducible test report.
