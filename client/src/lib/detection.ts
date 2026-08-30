export type ModelId = "yolo26n" | "yolo26s" | "yolo26m" | "yolo26l" | "yolo26x";

export type Detection = {
  id: number;
  className: string;
  confidence: number;
  bbox: { x1: number; y1: number; x2: number; y2: number };
};

export type SceneRelevance = {
  score: number;
  verdict: "pass" | "warn" | "block";
  checkerAvailable: boolean;
};

export type DetectionResponse = {
  model: ModelId;
  modelLabel: string;
  detections: Detection[];
  count: number;
  inferenceTimeSec: number;
  imageSize: { width: number; height: number };
  summary: Array<{ className: string; count: number }>;
  runtime: {
    confidenceThreshold: number;
    iouThreshold: number;
    inputSize: number;
    device: "cpu" | "cuda" | "mps" | "unknown";
  };
  sceneRelevance: SceneRelevance;
};

export type ModelHealth = {
  id: ModelId;
  label: string;
  available: boolean;
  detail?: string;
};

export type HealthResponse = {
  status: "healthy" | "degraded" | "starting";
  models: ModelHealth[];
};

export class DetectionApiError extends Error {
  readonly code?: string;
  readonly status?: number;

  constructor(message: string, options: { code?: string; status?: number } = {}) {
    super(message);
    this.name = "DetectionApiError";
    this.code = options.code;
    this.status = options.status;
  }
}

const defaultApiUrl = import.meta.env.DEV
  ? "/inference-api"
  : "https://litter-detect-inference.onrender.com";
export const API_BASE_URL = (
  import.meta.env.VITE_INFERENCE_API_URL || defaultApiUrl
).replace(/\/$/, "");

export function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function averageConfidence(detections: Detection[]) {
  if (!detections.length) return 0;
  return (
    detections.reduce((t, d) => t + d.confidence, 0) / detections.length
  );
}

export function maxConfidence(detections: Detection[]) {
  return detections.reduce((m, d) => Math.max(m, d.confidence), 0);
}

export function formatDuration(seconds: number) {
  return `${seconds.toFixed(seconds < 10 ? 2 : 1)}s`;
}

// ── Image compression (client-side) ───────────────────────────────────────────
const UPLOAD_TARGET_BYTES = 4 * 1024 * 1024;   // 4 MB target
const UPLOAD_HARD_LIMIT   = 35 * 1024 * 1024;  // 35 MB hard ceiling (wrong file)
const COMPRESS_QUALITY    = 0.85;               // first-pass JPEG/WebP quality

export type CompressResult =
  | { file: File; resized: false }
  | { file: File; resized: true; originalSize: number };

/**
 * If the file is already within the upload target, return it unchanged.
 * If it exceeds the hard limit, throw — that's not a normal photo.
 * Otherwise canvas-resize + re-encode to JPEG at 85% quality, halving
 * dimensions iteratively until it fits.
 */
export async function prepareImageForUpload(raw: File): Promise<CompressResult> {
  if (raw.size <= UPLOAD_TARGET_BYTES) return { file: raw, resized: false };
  if (raw.size > UPLOAD_HARD_LIMIT) {
    throw new Error(
      "This file is too large to be a normal photo (over 35 MB). Choose a different image."
    );
  }

  const originalSize = raw.size;
  const bitmap = await createImageBitmap(raw);
  let { width, height } = bitmap;

  // Iteratively halve dimensions until encoded size is under the target.
  // In practice one pass is almost always enough for phone photos.
  let blob: Blob | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0, width, height);
    blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, "image/jpeg", COMPRESS_QUALITY)
    );
    if (blob && blob.size <= UPLOAD_TARGET_BYTES) break;
    // Reduce by ~30% each pass to avoid excessive iteration
    width  = Math.max(320, Math.round(width  * 0.7));
    height = Math.max(320, Math.round(height * 0.7));
    blob = null;
  }

  bitmap.close();

  if (!blob || blob.size > UPLOAD_TARGET_BYTES) {
    throw new Error(
      "Could not compress this image to under 4 MB. Try a smaller or less complex image."
    );
  }

  const baseName = raw.name.replace(/\.[^.]+$/, "") || "image";
  const compressed = new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
  return { file: compressed, resized: true, originalSize };
}

// ── Response normalisation ─────────────────────────────────────────────────────
function toCamelResponse(raw: Record<string, unknown>): DetectionResponse {
  const rawDetections = Array.isArray(raw.detections) ? raw.detections : [];
  const detections = rawDetections.map((item, index) => {
    const d = item as Record<string, unknown>;
    const box = (d.bbox || {}) as Record<string, number>;
    return {
      id: Number(d.id ?? index + 1),
      className: String(d.class_name ?? d.class ?? "litter"),
      confidence: Number(d.confidence ?? 0),
      bbox: { x1: Number(box.x1), y1: Number(box.y1), x2: Number(box.x2), y2: Number(box.y2) },
    };
  });

  const image = raw.image_size as Record<string, number> | undefined;
  const rawRuntime = (raw.runtime || {}) as Record<string, unknown>;
  const device = String(rawRuntime.device);

  const rawScene = (raw.scene_relevance || {}) as Record<string, unknown>;
  const rawVerdict = String(rawScene.verdict ?? "pass");

  return {
    model: raw.model as ModelId,
    modelLabel: String(raw.model_label ?? raw.model ?? "YOLO"),
    detections,
    count: Number(raw.count ?? detections.length),
    inferenceTimeSec: Number(raw.inference_time_sec ?? 0),
    imageSize: {
      width: Number(image?.width ?? 1),
      height: Number(image?.height ?? 1),
    },
    summary: Array.isArray(raw.summary)
      ? (raw.summary as Record<string, unknown>[]).map((s) => ({
          className: String(s.class_name ?? "litter"),
          count: Number(s.count ?? 0),
        }))
      : [],
    runtime: {
      confidenceThreshold: Number(rawRuntime.confidence_threshold ?? 0.25),
      iouThreshold: Number(rawRuntime.iou_threshold ?? 0.45),
      inputSize: Number(rawRuntime.input_size ?? 0),
      device: (["cpu", "cuda", "mps", "unknown"] as const).includes(
        device as "cpu"
      )
        ? (device as "cpu" | "cuda" | "mps" | "unknown")
        : "unknown",
    },
    sceneRelevance: {
      score: Number(rawScene.score ?? 1),
      verdict: (["pass", "warn", "block"] as const).includes(rawVerdict as "pass")
        ? (rawVerdict as "pass" | "warn" | "block")
        : "pass",
      checkerAvailable: Boolean(rawScene.checker_available ?? false),
    },
  };
}

async function parseError(response: Response): Promise<DetectionApiError> {
  const fallback = `The detection service returned ${response.status}.`;
  try {
    const body = (await response.json()) as {
      detail?: string | { message?: string; code?: string };
      error?: { message?: string; code?: string };
    };
    if (typeof body.detail === "string")
      return new DetectionApiError(body.detail, { status: response.status });
    return new DetectionApiError(
      body.error?.message || (body.detail as { message?: string })?.message || fallback,
      {
        code: body.error?.code || (body.detail as { code?: string })?.code,
        status: response.status,
      }
    );
  } catch {
    return new DetectionApiError(fallback, { status: response.status });
  }
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  externalSignal: AbortSignal | undefined,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  externalSignal?.addEventListener("abort", abortFromCaller, { once: true });
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted && !externalSignal?.aborted) {
      throw new DetectionApiError(
        "The detection service took too long to respond. Please try again."
      );
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
    externalSignal?.removeEventListener("abort", abortFromCaller);
  }
}

export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/health`,
    {},
    signal,
    20_000
  );
  if (!response.ok) throw await parseError(response);
  return (await response.json()) as HealthResponse;
}

export async function requestDetection(
  file: File,
  model: ModelId,
  signal?: AbortSignal,
  force = false
): Promise<DetectionResponse> {
  const body = new FormData();
  body.append("file", file);
  body.append("model", model);
  if (force) body.append("force", "true");

  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${API_BASE_URL}/v1/detections`,
      { method: "POST", body },
      signal,
      150_000
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    if (error instanceof DetectionApiError) throw error;
    throw new DetectionApiError(
      "The detection service could not be reached. Check its URL and service status."
    );
  }

  if (!response.ok) throw await parseError(response);
  return toCamelResponse((await response.json()) as Record<string, unknown>);
}
