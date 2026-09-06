# Model assets

## Deployment model: `yolo26s.onnx` (7-class, trained checkpoint #2)

`yolo26s.onnx` is a checksum-pinned, fixed-320-pixel ONNX artifact exported from the
second training run's best checkpoint of the YOLO26s litter detector. It is a genuinely
weak baseline and must not be presented as production-quality: at the second run's peak
(epoch 38 of 150), the model reached roughly **mAP50 ≈ 0.163, mAP50-95 ≈ 0.099,
precision ≈ 0.269, recall ≈ 0.230**. Substantial further work is required before these
detections are production-grade; see `TRAINING_LOG.md` for the honest per-class
breakdown and the full training history.

- Classes (index order): `0=plastic, 1=metal, 2=glass, 3=paper_cardboard, 4=fishing_gear, 5=natural_debris, 6=other_litter`
- Input: `[1, 3, 320, 320]` (fixed, square; ONNX metadata `imgsz=[320, 320]`)
- Output: `[1, 11, 2100]` (4 box channels + 7 class channels — compatible with the
  existing `_postprocess_yolo26_output`)
- Class names are embedded in ONNX metadata (`custom_metadata_map["names"]`) and read
  at load time by `_class_names_from_metadata`
- SHA-256: `b72f5cdef5451af4abb2d0051d9c95d0092e8a85f3cdf2fdb3d7644d6a56d6d7`
- Size: 38,039,242 bytes
- Pinned in `app/config.py` (`DEFAULT_TRUSTED_YOLO26S_SHA256`) and `render.yaml`
  (`YOLO26S_MODEL_SHA256`); `ModelRegistry` refuses to load on mismatch.

## Provenance checkpoint: `yolo26s.pt` (kept byte-preserved)

`yolo26s.pt` is the second training run's `best.pt` (epoch 38, early stopping disabled),
kept as the provenance artifact alongside the derived ONNX.

- SHA-256: `a94e1be3900b8fecb3bf20477726ade371212f9982443494f25bd8d5aa50ce77`
- Size: 20,293,189 bytes

That run's `last.pt` (epoch 150) was deliberately **not** included: training degraded
after the epoch-38 peak, so those weights are strictly worse than the shipped ones.
Full run history, dataset composition, and known weaknesses are documented in
`TRAINING_LOG.md`.

## Service model slots

The service exposes five explicit model slots:

| ID | Deployment artifact | Availability |
|---|---|---|
| `yolo26n` | `yolo26n.pt` | Not installed — placeholder for a separate effort |
| `yolo26s` | `yolo26s.onnx` | 7-class trained checkpoint #2 (see above) |
| `yolo26m` | `yolo26m.pt` | Not installed — placeholder for a separate effort |
| `yolo26l` | `yolo26l.pt` | Not installed — placeholder for a separate effort |
| `yolo26x` | `yolo26x.pt` | Not installed — placeholder for a separate effort |

Missing variants are reported as unavailable until a compatible checkpoint is placed at
its path or the corresponding `YOLO26*_MODEL_PATH` variable is configured. The service
never silently runs yolo26s when another model is selected.

## Bandit threshold cold start (operational note)

The per-class adaptive threshold system (`app/services/bandit.py`) previously only saw
the single class `litter`. The class names `metal`, `glass`, `paper_cardboard`,
`fishing_gear`, and `natural_debris` are new to it — their adaptive thresholds stay at
the static 0.25 fallback until real feedback accumulates per class
(`MIN_FEEDBACK_EVENTS = 10`). No previously learned threshold maps cleanly onto the new
taxonomy: old `litter` feedback does not correspond to any single new class.

## Binary handling

The `yolo26s.pt` and `yolo26s.onnx` binaries are deliberately ordinary Git objects so
Render receives them without depending on a Git LFS checkout. Future large
`yolo26n/m/l/x` source checkpoints retain the project's LFS policy when and if they are
supplied. Arbitrary generated exports and runtime weights remain ignored.

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
