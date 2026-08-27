# Model assets

The supplied `best.pt` checkpoint is retained byte-for-byte as `yolo26s.pt` (SHA-256 `d52d0d489e8e46bc55b8a46091c5dfc689bc1d21979b1450433af9cfe26036e5`). Passive inspection of its checkpoint metadata identifies the architecture as **YOLO26s** and the model class as `litter`.

For the constrained Render CPU deployment, `yolo26s.onnx` is a separately checksum-pinned, fixed-320-pixel ONNX artifact derived in a controlled local export from that supplied checkpoint. Its SHA-256 is `969bbf4733dd1486478e55cbb511569dc0bb7a75cf889597274b02b336b3ceb2` and its size is 37,993,343 bytes. The deployment uses ONNX Runtime directly, while `yolo26s.pt` remains intact as the supplied source checkpoint. The derived artifact is not presented as a new model, retraining result, or replacement for the supplied file.

The service exposes five explicit model slots:

| ID | Deployment artifact | Availability |
|---|---|---|
| `yolo26n` | `yolo26n.pt` | Not installed in the supplied archive |
| `yolo26s` | `yolo26s.onnx` | Derived from the supplied, preserved YOLO26s checkpoint |
| `yolo26m` | `yolo26m.pt` | Not installed in the supplied archive |
| `yolo26l` | `yolo26l.pt` | Not installed in the supplied archive |
| `yolo26x` | `yolo26x.pt` | Not installed in the supplied archive |

Missing variants are reported as unavailable until a compatible checkpoint is placed at its path or the corresponding `YOLO26*_MODEL_PATH` variable is configured. The service never silently runs YOLO26s when another model is selected.

The required `yolo26s.pt` and `yolo26s.onnx` binaries are deliberately ordinary Git objects so Render receives them without depending on a Git LFS checkout. Future large `yolo26n/m/l/x` source checkpoints retain the project’s LFS policy when and if they are supplied. Arbitrary generated exports and runtime weights remain ignored.
