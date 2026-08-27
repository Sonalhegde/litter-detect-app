# Model assets

The supplied `best.pt` checkpoint is retained byte-for-byte as `yolo26s.pt`. Passive inspection of its checkpoint metadata identifies the architecture as **YOLO26s** and the model class as `litter`. The API therefore exposes this artifact as `yolo26s` without re-exporting or altering its contents.

The service exposes five explicit model slots:

| ID | Default checkpoint path | Availability |
|---|---|---|
| `yolo26n` | `yolo26n.pt` | Not installed in the supplied archive |
| `yolo26s` | `yolo26s.pt` | Supplied checkpoint |
| `yolo26m` | `yolo26m.pt` | Not installed in the supplied archive |
| `yolo26l` | `yolo26l.pt` | Not installed in the supplied archive |
| `yolo26x` | `yolo26x.pt` | Not installed in the supplied archive |

Missing variants are reported as unavailable until a compatible checkpoint is placed at its path or the corresponding `YOLO26*_MODEL_PATH` variable is configured. The service never silently runs YOLO26s when another model is selected.

Tracked checkpoints use Git LFS, while generated exports and arbitrary runtime weights are ignored. Keep actual source weights private and ensure that any deployment provider performs a Git LFS checkout before building the service.
