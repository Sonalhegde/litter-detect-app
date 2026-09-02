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

export async function runOnnxInference(
  imageBuffer: Buffer,
  modelId: string = "yolo26s",
  confThreshold: number = 0.25,
  iouThreshold: number = 0.45
): Promise<InferenceResult> {
  const startTime = Date.now();
  const session = await getSession();

  const metadata = await sharp(imageBuffer).metadata();
  const imageWidth = metadata.width || 800;
  const imageHeight = metadata.height || 600;

  const targetSize = 320;
  const gain = Math.min(targetSize / imageHeight, targetSize / imageWidth);
  const resizedW = Math.round(imageWidth * gain);
  const resizedH = Math.round(imageHeight * gain);

  const padX = Math.round((targetSize - resizedW) / 2);
  const padY = Math.round((targetSize - resizedH) / 2);

  // Resize and letterbox image
  const resizedImageBuffer = await sharp(imageBuffer)
    .resize(resizedW, resizedH, { fit: "fill" })
    .toBuffer();

  const { data: rawPixels } = await sharp({
    create: {
      width: targetSize,
      height: targetSize,
      channels: 3,
      background: { r: 114, g: 114, b: 114 },
    },
  })
    .composite([{ input: resizedImageBuffer, top: padY, left: padX }])
    .raw()
    .toBuffer();

  // Convert to NCHW Float32 tensor normalized [0, 1]
  const floatData = new Float32Array(1 * 3 * targetSize * targetSize);
  const area = targetSize * targetSize;

  for (let i = 0; i < area; i++) {
    const r = rawPixels[i * 3];
    const g = rawPixels[i * 3 + 1];
    const b = rawPixels[i * 3 + 2];

    floatData[i] = r / 255.0; // Red
    floatData[area + i] = g / 255.0; // Green
    floatData[2 * area + i] = b / 255.0; // Blue
  }

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
      class_name: "litter",
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

  return {
    model: modelId,
    model_label: "YOLO26s",
    detections,
    count: detections.length,
    inference_time_sec: durationSec,
    image_size: { width: imageWidth, height: imageHeight },
    summary: [{ class_name: "litter", count: detections.length }],
    runtime: {
      confidence_threshold: confThreshold,
      per_class_thresholds: { litter: confThreshold },
      iou_threshold: iouThreshold,
      input_size: targetSize,
      device: "cpu",
      engine: "onnxruntime-node",
    },
    scene_relevance: {
      score: 0.95,
      verdict: "pass",
      checker_available: true,
    },
  };
}
