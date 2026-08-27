# Model evaluation

Precision is `TP / (TP + FP)` and recall is `TP / (TP + FN)`. IoU measures intersection over union between predicted and reference boxes. mAP@50 evaluates detections at an IoU threshold of 0.50, while mAP@50–95 averages stricter IoU thresholds and is therefore a more demanding summary.

The supplied YOLO26s analysis reports these as **validation** results: peak precision 61.89%, peak recall 53.61%, peak mAP@50 55.44%, and peak mAP@50–95 27.16%. The selected checkpoint was approximately epoch 89 from a 109-epoch training run lasting approximately 4.24 hours. These numbers are not locked-test results. Final test metrics are pending evaluation on the untouched 852-image test set.

Deployment metrics such as image decode time, model inference time, total request time, CPU device, and input resolution are measured per request by the service where available. They should not be compared directly with training or validation metrics.
