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
  : "https://sentinal-backend-163815383571.us-central1.run.app";
const apiUrl = import.meta.env.VITE_INFERENCE_API_URL || defaultApiUrl;
export const API_BASE_URL = apiUrl.replace(/\/$/, "");

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

// ── Image upload & compression limits (client-side) ───────────────────────────
export const UPLOAD_TARGET_BYTES   = 25 * 1024 * 1024;  // 25 MB max payload ceiling (matches GCP Cloud Run)
export const UPLOAD_HARD_FILE_CAP  = 100 * 1024 * 1024; // 100 MB absolute file limit (reject before browser canvas freeze)
export const MAX_SAFE_DIMENSION    = 2560;              // 2560px max side length (2x YOLO 1280px native input)
export const MAX_SAFE_PIXELS       = 48_000_000;        // 48 Megapixels hard cap (reject decompression bombs)
export const COMPRESS_QUALITY      = 0.85;              // High-fidelity WebP/JPEG quality

export type CompressResult =
  | { file: File; resized: false }
  | {
      file: File;
      resized: true;
      originalSize: number;
      originalDim: { width: number; height: number };
      newDim: { width: number; height: number };
    };

/**
 * Validates and prepares images before transmission to prevent backend crashes:
 * 1. Hard-rejects corrupt/excessive files (>100 MB or >48 MP) to prevent browser/server OOM.
 * 2. If both file size <= 25 MB and dimensions <= 2560px, passes through as-is.
 * 3. If dimensions exceed 2560px or size > 25 MB, scales proportionally to <= 2560px
 *    (preserving aspect ratio) and re-encodes via canvas to WebP/JPEG <= 25 MB.
 */
export async function prepareImageForUpload(raw: File): Promise<CompressResult> {
  if (raw.size > UPLOAD_HARD_FILE_CAP) {
    const mb = (raw.size / 1024 / 1024).toFixed(0);
    throw new Error(
      `File size exceeds 100 MB (${mb} MB). Please select an image under 25 MB.`
    );
  }

  // Inspect image dimensions defensively
  const originalSize = raw.size;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(raw);
  } catch {
    throw new Error("Unable to decode this image. Please upload a standard JPEG, PNG, or WebP photo.");
  }

  const origWidth = bitmap.width;
  const origHeight = bitmap.height;

  if (origWidth * origHeight > MAX_SAFE_PIXELS) {
    bitmap.close();
    const mp = ((origWidth * origHeight) / 1e6).toFixed(1);
    throw new Error(
      `Image resolution is too high (${origWidth} × ${origHeight} = ${mp} MP). Maximum allowed is 48 MP.`
    );
  }

  // If already within 25 MB and within 2560px bounds, send without modifications
  const maxDim = Math.max(origWidth, origHeight);
  if (raw.size <= UPLOAD_TARGET_BYTES && maxDim <= MAX_SAFE_DIMENSION) {
    bitmap.close();
    return { file: raw, resized: false };
  }

  // Proportionally downscale to fit within MAX_SAFE_DIMENSION
  let targetWidth = origWidth;
  let targetHeight = origHeight;
  if (maxDim > MAX_SAFE_DIMENSION) {
    const ratio = MAX_SAFE_DIMENSION / maxDim;
    targetWidth = Math.round(origWidth * ratio);
    targetHeight = Math.round(origHeight * ratio);
  }

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

  let curW = targetWidth;
  let curH = targetHeight;

  for (let attempt = 0; attempt < 5; attempt++) {
    const canvas = document.createElement("canvas");
    canvas.width = curW;
    canvas.height = curH;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0, curW, curH);
    blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, mimeType, COMPRESS_QUALITY)
    );
    if (blob && blob.size <= UPLOAD_TARGET_BYTES) break;

    // Scale down dimensions proportionally if still oversized, keeping min dimension >= 640px
    const scale = 0.75;
    if (Math.min(curW, curH) * scale < 640) break;
    curW = Math.round(curW * scale);
    curH = Math.round(curH * scale);
    blob = null;
  }

  bitmap.close();

  if (!blob || blob.size > UPLOAD_TARGET_BYTES) {
    throw new Error(
      "Could not compress this image to under 25 MB. Try a smaller or less complex image."
    );
  }

  const baseName = raw.name.replace(/\.[^.]+$/, "") || "image";
  const ext = mimeType === "image/webp" ? "webp" : "jpg";
  const compressed = new File([blob], `${baseName}.${ext}`, { type: mimeType });
  return {
    file: compressed,
    resized: true,
    originalSize,
    originalDim: { width: origWidth, height: origHeight },
    newDim: { width: curW, height: curH },
  };
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
  else if (status === 413) defaultMsg = "The image file is too large for the backend upload limit. Please choose a smaller file.";
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

// ── Anti-Analyzer / input relevance gate (spec §7) ────────────────────────────
export type RelevanceStatus = "relevant" | "uncertain" | "unrelated" | "unavailable";

export type RelevanceCheck = {
  inputValid: boolean;
  status: RelevanceStatus;
  score: number | null;
  checkerAvailable: boolean;
};

const RELEVANCE_STATUSES: readonly RelevanceStatus[] = ["relevant", "uncertain", "unrelated", "unavailable"];

function toRelevanceCheck(raw: Record<string, unknown>): RelevanceCheck {
  const input = (raw.input ?? {}) as Record<string, unknown>;
  const relevance = (raw.relevance ?? {}) as Record<string, unknown>;
  const status = String(relevance.status ?? "unavailable");
  const rawScore = relevance.score;
  return {
    inputValid: Boolean(input.valid ?? false),
    status: (RELEVANCE_STATUSES as readonly string[]).includes(status)
      ? (status as RelevanceStatus)
      : "unavailable",
    score: typeof rawScore === "number" ? rawScore : null,
    checkerAvailable: Boolean(relevance.checker_available ?? false),
  };
}

/**
 * Ask the Anti-Analyzer whether the image is in the marine/coastal domain,
 * BEFORE running the debris detector. Returns `null` when the deployed
 * backend predates this endpoint (HTTP 404/405) so the caller can fall back
 * to the legacy single-call flow. A network/server failure throws — service
 * failure must never be interpreted as an unrelated image.
 */
export async function requestRelevance(
  file: File,
  signal?: AbortSignal
): Promise<RelevanceCheck | null> {
  const body = new FormData();
  body.append("file", file);

  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${API_BASE_URL}/v1/relevance`,
      { method: "POST", body },
      signal,
      45_000
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    if (error instanceof DetectionApiError) throw error;
    throw new DetectionApiError(
      "The relevance service could not be reached due to a network or CORS error.",
      { category: "cors_or_network" }
    );
  }

  if (response.status === 404 || response.status === 405) return null;
  if (!response.ok) throw await parseError(response);

  // A pre-relevance backend whose SPA catch-all answers every route with the
  // index page returns HTTP 200 with HTML — treat that as "endpoint missing"
  // and fall back to the legacy single-call flow.
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return null;

  try {
    return toRelevanceCheck((await response.json()) as Record<string, unknown>);
  } catch {
    return null;
  }
}
