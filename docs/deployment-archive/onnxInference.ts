import sharp from "sharp";
import path from "path";
import fs from "fs";

export interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface DetectionItem {
  id: number;
  class_name: string;
  confidence: number;
  bbox: BoundingBox;
}

export interface InferenceResult {
  model: string;
  model_label: string;
  detections: DetectionItem[];
  count: number;
  inference_time_sec: number;
  image_size: { width: number; height: number };
  summary: { class_name: string; count: number }[];
  runtime: {
    confidence_threshold: number;
    per_class_thresholds: Record<string, number>;
    iou_threshold: number;
    input_size: number;
    device: string;
    engine: string;
  };
  scene_relevance: {
    score: number;
    verdict: string;
    checker_available: boolean;
  };
}

let ortModule: any = null;
let activeEngineName = "onnxruntime-node";

async function loadOrtModule(): Promise<any> {
  if (ortModule) return ortModule;
  try {
    const mod = await import("onnxruntime-node");
    ortModule = mod.default || mod;
    activeEngineName = "onnxruntime-node";
    return ortModule;
  } catch (e1) {
    console.warn("onnxruntime-node failed to load, falling back to onnxruntime-web WASM:", e1);
    const mod = await import("onnxruntime-web");
    ortModule = mod.default || mod;
    activeEngineName = "onnxruntime-web";
    return ortModule;
  }
}

let sessionPromise: Promise<any> | null = null;

function getModelPath(): string {
  const rootDir = path.resolve(import.meta.dirname, "../..");
  const possiblePaths = [
    path.join(rootDir, "backend", "models", "yolo26s.onnx"),
    path.join(rootDir, "models", "yolo26s.onnx"),
    path.join(process.cwd(), "backend", "models", "yolo26s.onnx"),
    path.join(process.cwd(), "models", "yolo26s.onnx"),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  throw new Error("yolo26s.onnx model file not found in paths: " + possiblePaths.join(", "));
}

async function getSession(): Promise<any> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const ort = await loadOrtModule();
      const modelPath = getModelPath();
      const sessionOptions: any = {
        intraOpNumThreads: 1,
        interOpNumThreads: 1,
        executionMode: "sequential",
      };
      return await ort.InferenceSession.create(modelPath, sessionOptions);
    })();
  }
  return sessionPromise;
}

function xywhToXyxy(box: number[]): [number, number, number, number] {
  const [cx, cy, w, h] = box;
  return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
}

function computeIoU(box1: number[], box2: number[]): number {
  const x1 = Math.max(box1[0], box2[0]);
  const y1 = Math.max(box1[1], box2[1]);
  const x2 = Math.min(box1[2], box2[2]);
  const y2 = Math.min(box1[3], box2[3]);

  const interWidth = Math.max(0, x2 - x1);
  const interHeight = Math.max(0, y2 - y1);
  const interArea = interWidth * interHeight;

  const area1 = Math.max(0, box1[2] - box1[0]) * Math.max(0, box1[3] - box1[1]);
  const area2 = Math.max(0, box2[2] - box2[0]) * Math.max(0, box2[3] - box2[1]);
  const unionArea = area1 + area2 - interArea;

  return unionArea > 0 ? interArea / unionArea : 0;
}

function nms(boxes: number[][], scores: number[], iouThreshold: number): number[] {
  const indices = scores.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
  const selected: number[] = [];

  while (indices.length > 0) {
    const current = indices.shift()!;
    selected.push(current);

    for (let i = indices.length - 1; i >= 0; i--) {
      const idx = indices[i];
      const iou = computeIoU(boxes[current], boxes[idx]);
      if (iou > iouThreshold) {
        indices.splice(i, 1);
      }
    }
  }
  return selected;
}

/**
 * Read the class map from the ONNX model file's embedded metadata
 * (`metadata_props` entry with key "names", written by Ultralytics as a
 * Python dict literal), mirroring the Python backend's
 * `_class_names_from_metadata`. onnxruntime-node does not expose model
 * metadata, so we scan the protobuf bytes: locate key field 1 ("names"),
 * then read value field 2's length-prefixed UTF-8 payload. Falls back to
 * {0: "litter"} only when the metadata is missing or malformed.
 */
function extractNamesJsonFromOnnxBytes(buf: Buffer): string | null {
  const needle = Buffer.concat([Buffer.from([0x0a, 0x05]), Buffer.from("names")]);
  let pos = buf.indexOf(needle);
  while (pos !== -1) {
    let p = pos + needle.length;
    if (buf[p] === 0x12) {
      p += 1;
      let len = 0;
      let shift = 0;
      while (p < buf.length) {
        const b = buf[p];
        p += 1;
        len |= (b & 0x7f) << shift;
        shift += 7;
        if ((b & 0x80) === 0) break;
      }
      if (len > 0 && p + len <= buf.length) {
        const candidate = buf.subarray(p, p + len).toString("utf8");
        if (candidate.includes(":")) return candidate;
      }
    }
    pos = buf.indexOf(needle, pos + 1);
  }
  return null;
}

function parseNamesDict(raw: string): Record<number, string> | null {
  try {
    const json = raw.replace(/'/g, '"').replace(/([{,]\s*)(\d+)\s*:/g, '$1"$2":');
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const out: Record<number, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const id = Number(key);
      if (Number.isInteger(id) && id >= 0 && typeof value === "string") {
        out[id] = value;
      }
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

let classNamesCache: Record<number, string> | null = null;

function resolveClassNames(modelPath: string): Record<number, string> {
  if (classNamesCache) return classNamesCache;
  try {
    const raw = extractNamesJsonFromOnnxBytes(fs.readFileSync(modelPath));
    const parsed = raw ? parseNamesDict(raw) : null;
    if (parsed) {
      classNamesCache = parsed;
      return classNamesCache;
    }
  } catch {
    // fall through to the safe default
  }
  return { 0: "litter" };
}

/**
 * Ultralytics-exact letterbox preprocessing, replicating the Python pipeline
 * (`_prepare_image_tensor` in backend/app/services/inference.py):
 * - decode to RGB, drop alpha (PIL convert("RGB") semantics)
 * - resize with BILINEAR interpolation using cv2's half-pixel-center
 *   convention (`src = (dst + 0.5) * scale - 0.5`) — the model is brittle
 *   enough that sharp's Lanczos default measurably changes detections
 * - pad with RGB(114,114,114) at `round((target - size * gain) / 2 - 0.1)`
 * - emit NCHW float32 in [0, 1]
 */
function resizeBilinearCv2(
  src: Buffer,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
): Buffer {
  const dst = new Uint8ClampedArray(dstW * dstH * 3);
  const scaleX = srcW / dstW;
  const scaleY = srcH / dstH;
  for (let dy = 0; dy < dstH; dy++) {
    const fy = (dy + 0.5) * scaleY - 0.5;
    const y0f = Math.floor(fy);
    const wy = fy - y0f;
    const y0 = Math.max(0, y0f);
    const y1 = Math.min(srcH - 1, y0f + 1);
    for (let dx = 0; dx < dstW; dx++) {
      const fx = (dx + 0.5) * scaleX - 0.5;
      const x0f = Math.floor(fx);
      const wx = fx - x0f;
      const x0 = Math.max(0, x0f);
      const x1 = Math.min(srcW - 1, x0f + 1);
      const i00 = (y0 * srcW + x0) * 3;
      const i01 = (y0 * srcW + x1) * 3;
      const i10 = (y1 * srcW + x0) * 3;
      const i11 = (y1 * srcW + x1) * 3;
      const o = (dy * dstW + dx) * 3;
      for (let c = 0; c < 3; c++) {
        dst[o + c] =
          (1 - wy) * ((1 - wx) * src[i00 + c] + wx * src[i01 + c]) +
          wy * ((1 - wx) * src[i10 + c] + wx * src[i11 + c]);
      }
    }
  }
  return Buffer.from(dst.buffer, dst.byteOffset, dst.byteLength);
}

async function prepareLetterboxTensor(
  imageBuffer: Buffer,
  targetSize: number
): Promise<{ tensor: Float32Array; padX: number; padY: number; gain: number; imageWidth: number; imageHeight: number }> {
  const { data: src, info } = await sharp(imageBuffer)
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 3) {
    throw new Error(`Expected 3-channel RGB decode, got ${info.channels} channels.`);
  }
  const imageWidth = info.width;
  const imageHeight = info.height;

  const gain = Math.min(targetSize / imageHeight, targetSize / imageWidth);
  const resizedW = Math.round(imageWidth * gain);
  const resizedH = Math.round(imageHeight * gain);
  // Ultralytics half-pixel bias: rounds .5 cases down (Python's round(x - 0.1))
  const padX = Math.round((targetSize - imageWidth * gain) / 2 - 0.1);
  const padY = Math.round((targetSize - imageHeight * gain) / 2 - 0.1);

  const resized = resizeBilinearCv2(src, imageWidth, imageHeight, resizedW, resizedH);

  const area = targetSize * targetSize;
  const tensor = new Float32Array(3 * area).fill(114 / 255);
  for (let y = 0; y < resizedH; y++) {
    const srcRow = y * resizedW * 3;
    const dstRow = (y + padY) * targetSize + padX;
    for (let x = 0; x < resizedW; x++) {
      tensor[dstRow + x] = resized[srcRow + x * 3] / 255.0;
      tensor[area + dstRow + x] = resized[srcRow + x * 3 + 1] / 255.0;
      tensor[2 * area + dstRow + x] = resized[srcRow + x * 3 + 2] / 255.0;
    }
  }
  return { tensor, padX, padY, gain, imageWidth, imageHeight };
}

export async function runOnnxInference(
  imageBuffer: Buffer,
  modelId: string = "yolo26s",
  confThreshold: number = 0.25,
  iouThreshold: number = 0.45
): Promise<InferenceResult> {
  const startTime = Date.now();
  const session = await getSession();

  const prepared = await prepareLetterboxTensor(imageBuffer, 320);
  const { tensor: floatData, padX, padY, gain } = prepared;
  const imageWidth = prepared.imageWidth;
  const imageHeight = prepared.imageHeight;
  const targetSize = 320;

  const ort = await loadOrtModule();
  const inputName = session.inputNames[0];
  const inputTensor = new ort.Tensor("float32", floatData, [1, 3, targetSize, targetSize]);

  const outputMap = await session.run({ [inputName]: inputTensor });
  const outputTensor = outputMap[session.outputNames[0]];
  const outputData = outputTensor.data as Float32Array;
  const shape = outputTensor.dims; // [1, 5, 2100] or [1, num_attrs, num_anchors]

  const numAttrs = shape[1];
  const numAnchors = shape[2];

  const candidateBoxes: number[][] = [];
  const candidateScores: number[] = [];
  const candidateClasses: number[] = [];

  for (let i = 0; i < numAnchors; i++) {
    let maxScore = 0;
    let maxClass = 0;

    for (let c = 4; c < numAttrs; c++) {
      const score = outputData[c * numAnchors + i];
      if (score > maxScore) {
        maxScore = score;
        maxClass = c - 4;
      }
    }

    if (maxScore > confThreshold) {
      const cx = outputData[0 * numAnchors + i];
      const cy = outputData[1 * numAnchors + i];
      const w = outputData[2 * numAnchors + i];
      const h = outputData[3 * numAnchors + i];

      candidateBoxes.push(xywhToXyxy([cx, cy, w, h]));
      candidateScores.push(maxScore);
      candidateClasses.push(maxClass);
    }
  }

  const selectedIndices = nms(candidateBoxes, candidateScores, iouThreshold);
  const classNames = resolveClassNames(getModelPath());

  const detections: DetectionItem[] = selectedIndices.map((idx, detId) => {
    const box = candidateBoxes[idx];
    const score = candidateScores[idx];

    // Unscale box back to original image dimensions
    let x1 = (box[0] - padX) / gain;
    let y1 = (box[1] - padY) / gain;
    let x2 = (box[2] - padX) / gain;
    let y2 = (box[3] - padY) / gain;

    x1 = Math.max(0, Math.min(imageWidth, x1));
    y1 = Math.max(0, Math.min(imageHeight, y1));
    x2 = Math.max(0, Math.min(imageWidth, x2));
    y2 = Math.max(0, Math.min(imageHeight, y2));

    return {
      id: detId + 1,
      class_name: classNames[candidateClasses[idx]] ?? "litter",
      confidence: Math.round(score * 1000) / 1000,
      bbox: {
        x1: Math.round(x1 * 10) / 10,
        y1: Math.round(y1 * 10) / 10,
        x2: Math.round(x2 * 10) / 10,
        y2: Math.round(y2 * 10) / 10,
      },
    };
  });

  const durationSec = Math.round((Date.now() - startTime) / 1000 * 1000) / 1000;

  // Per-class counts from the actual detections
  const classCounts = new Map<string, number>();
  for (const det of detections) {
    classCounts.set(det.class_name, (classCounts.get(det.class_name) ?? 0) + 1);
  }

  // No scene-classification model runs in this deployment. Report the checker
  // as unavailable rather than fabricating a relevance verdict from pixel
  // statistics — color heuristics are not a reliable domain check.
  const sceneResult = { score: 1.0, verdict: "pass", checker_available: false };

  return {
    model: modelId,
    model_label: "YOLO26s",
    detections,
    count: detections.length,
    inference_time_sec: durationSec,
    image_size: { width: imageWidth, height: imageHeight },
    summary: Array.from(classCounts.entries()).map(([class_name, count]) => ({ class_name, count })),
    runtime: {
      confidence_threshold: confThreshold,
      per_class_thresholds: Object.fromEntries(
        Object.values(classNames).map((name) => [name, confThreshold])
      ),
      iou_threshold: iouThreshold,
      input_size: targetSize,
      device: "cpu",
      engine: activeEngineName,
    },
    scene_relevance: sceneResult,
  };
}
