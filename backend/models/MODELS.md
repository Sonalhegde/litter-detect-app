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


## Scene-relevance checker artifacts (Anti-Analyzer)

The input relevance gate uses CLIP ViT-B/32 (OpenAI `openai/clip-vit-base-patch32`
weights) exported to ONNX by the `Xenova/clip-vit-base-patch32` conversion. Only the
int8-quantized vision tower ships:

| File | Purpose | SHA-256 (pinned in `app/config.py`) |
|---|---|---|
| `clip_vision_quantized.onnx` | Vision tower; pixel values → 512-dim image embedding (89,117,001 bytes) | `583fd1110a514667812fee7d684952aaf82a99b959760c8d7dca7e0ab9839299` |
| `scene_text_embeddings.npz` | Pre-encoded embeddings for the fixed 11-prompt set (4 coastal positives, 7 negatives), computed once from the same model's text tower | `a770421670028ce9d29ac3ba09b9376e18ed7144e59d6636c1ddfe416827a615` |

The text tower is not needed at runtime because the prompt set is fixed. Both files are
ordinary Git objects and are copied by the Docker image's `COPY models ./models` step.
`app/services/scene_check.py` verifies both SHA-256 pins and the prompt-set consistency
at load time; any mismatch disables the checker (pass-through, `checker_available=false`)
rather than producing a fabricated verdict.