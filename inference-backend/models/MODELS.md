# Model assets

The supplied checkpoint is retained at `best.pt`. Passive inspection of its checkpoint metadata identifies the architecture as **YOLO26s** and the model class as `litter`. The API therefore exposes this artifact as `yolo26s` without renaming or re-exporting it.

The supplied archive did **not** include a separate YOLO26n checkpoint. The service retains a dedicated `yolo26n` model slot, mapped by default to `yolo26n.pt`, but reports it as unavailable until a compatible checkpoint is placed at that path or `YOLO26N_MODEL_PATH` is configured. This avoids silently running the YOLO26s model when a user selects YOLO26n.

Tracked checkpoints use Git LFS, while generated exports and arbitrary runtime weights are ignored. Keep the actual source weights private and ensure that any deployment provider performs a Git LFS checkout before building the service.
