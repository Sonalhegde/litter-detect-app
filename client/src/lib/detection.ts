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
    perClassThresholds?: Record<string, number>;
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
  classes?: string[];
};

export type HealthResponse = {
  status: "healthy" | "degraded" | "starting";
  models: ModelHealth[];
};

export type ErrorCategory =
  | "cors_or_network"
  | "timeout"
  | "rate_limited"
  | "too_large"
  | "server_error"
  | "unknown";

export class DetectionApiError extends Error {
  readonly code?: string;
  readonly status?: number;
  readonly category: ErrorCategory;

  constructor(
    message: string,
    options: { code?: string; status?: number; category?: ErrorCategory } = {}
  ) {
    super(message);
    this.name = "DetectionApiError";
    this.code = options.code;
    this.status = options.status;
    this.category = options.category ?? "unknown";
  }
}

const defaultApiUrl = import.meta.env.DEV
  ? "/inference-api"
  : "https://sentinal-yhe0.onrender.com";
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
const UPLOAD_TARGET_BYTES = 8 * 1024 * 1024;   // 8 MB target
const UPLOAD_HARD_LIMIT   = 35 * 1024 * 1024;  // 35 MB hard ceiling (wrong file)
const COMPRESS_QUALITY    = 0.85;               // first-pass JPEG/WebP quality

export type CompressResult =
  | { file: File; resized: false }
  | { file: File; resized: true; originalSize: number };

/**
 * If the file is already within the upload target, return it unchanged.
 * If it exceeds the hard limit, throw — that's not a normal photo.
 * Otherwise canvas-resize + re-encode to WebP/JPEG at 85% quality,
 * reducing dimensions while maintaining a minimum resolution floor (640px).
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

  let blob: Blob | null = null;
  let mimeType = "image/webp";

  // Check if browser supports canvas.toBlob with image/webp
  const testCanvas = document.createElement("canvas");
  testCanvas.width = 1;
  testCanvas.height = 1;
  const supportsWebP = await new Promise<boolean>((res) =>
    testCanvas.toBlob((b) => res(!!b && b.type === "image/webp"), "image/webp")
  );
  if (!supportsWebP) mimeType = "image/jpeg";

  for (let attempt = 0; attempt < 5; attempt++) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0, width, height);
    blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, mimeType, COMPRESS_QUALITY)
    );
    if (blob && blob.size <= UPLOAD_TARGET_BYTES) break;
    // Reduce by ~30% each pass while keeping a minimum resolution floor of 640px
    width  = Math.max(640, Math.round(width  * 0.7));
    height = Math.max(640, Math.round(height * 0.7));
    blob = null;
  }

  bitmap.close();

  if (!blob || blob.size > UPLOAD_TARGET_BYTES) {
    throw new Error(
      "Could not compress this image to under 8 MB. Try a smaller or less complex image."
    );
  }

  const baseName = raw.name.replace(/\.[^.]+$/, "") || "image";
  const ext = mimeType === "image/webp" ? "webp" : "jpg";
  const compressed = new File([blob], `${baseName}.${ext}`, { type: mimeType });
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

  const rawPerClass = (rawRuntime.per_class_thresholds || {}) as Record<string, number>;

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
      perClassThresholds: rawPerClass,
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
  const status = response.status;
  let category: ErrorCategory = "unknown";
  if (status === 429) category = "rate_limited";
  else if (status === 413) category = "too_large";
  else if (status >= 500) category = "server_error";

  let defaultMsg = `The detection service returned HTTP ${status}.`;
  if (status === 429) defaultMsg = "Too many requests. Please wait a minute before trying again.";
  else if (status === 413) defaultMsg = "The image file is too large for the backend limit (8 MB). Please choose a smaller file.";
  else if (status >= 500) defaultMsg = `The detection service returned server error (${status}). The service may be restarting or out of memory.`;

  try {
    const body = (await response.json()) as {
      detail?: string | { message?: string; code?: string };
      error?: { message?: string; code?: string };
    };
    const msg = typeof body.detail === "string" ? body.detail : (body.error?.message || (body.detail as { message?: string })?.message || defaultMsg);
    const code = body.error?.code || (typeof body.detail === "object" ? body.detail?.code : undefined);
    return new DetectionApiError(msg, { code, status, category });
  } catch {
    return new DetectionApiError(defaultMsg, { status, category });
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
        "The detection service took too long to respond (cold start or model load timeout). Please try again.",
        { category: "timeout" }
      );
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
    externalSignal?.removeEventListener("abort", abortFromCaller);
  }
}

export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${API_BASE_URL}/health`,
      {},
      signal,
      20_000
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    if (error instanceof DetectionApiError) throw error;
    throw new DetectionApiError(
      "Inference health check failed due to a network or CORS restriction.",
      { category: "cors_or_network" }
    );
  }
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
      "The detection service could not be reached due to a network or CORS error. Check that the service is running and origin allowlist permits this domain.",
      { category: "cors_or_network" }
    );
  }

  if (!response.ok) throw await parseError(response);
  return toCamelResponse((await response.json()) as Record<string, unknown>);
}
