export type ModelId = "yolo26s" | "yolo26n";

export type Detection = {
  id: number;
  className: string;
  confidence: number;
  bbox: { x1: number; y1: number; x2: number; y2: number };
};

export type DetectionResponse = {
  model: ModelId;
  modelLabel: string;
  detections: Detection[];
  count: number;
  inferenceTimeSec: number;
  imageSize: { width: number; height: number };
  summary: Array<{ className: string; count: number }>;
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

// Local preview requests use Vite's same-origin proxy. Production deployments must
// provide VITE_INFERENCE_API_URL with the public Render service URL.
export const API_BASE_URL = (import.meta.env.VITE_INFERENCE_API_URL || "/inference-api").replace(/\/$/, "");

export function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function averageConfidence(detections: Detection[]) {
  if (!detections.length) return 0;
  return detections.reduce((total, detection) => total + detection.confidence, 0) / detections.length;
}

export function formatDuration(seconds: number) {
  return `${seconds.toFixed(seconds < 10 ? 2 : 1)}s`;
}

function toCamelResponse(raw: Record<string, unknown>): DetectionResponse {
  const rawDetections = Array.isArray(raw.detections) ? raw.detections : [];
  const detections = rawDetections.map((item, index) => {
    const detection = item as Record<string, unknown>;
    const rawBox = detection.bbox as Record<string, number>;
    return {
      id: Number(detection.id ?? index + 1),
      className: String(detection.class_name ?? detection.class ?? "litter"),
      confidence: Number(detection.confidence ?? 0),
      bbox: {
        x1: Number(rawBox.x1),
        y1: Number(rawBox.y1),
        x2: Number(rawBox.x2),
        y2: Number(rawBox.y2),
      },
    };
  });
  const image = raw.image_size as Record<string, number> | undefined;
  const rawSummary = Array.isArray(raw.summary) ? raw.summary : [];

  return {
    model: raw.model as ModelId,
    modelLabel: String(raw.model_label ?? raw.model ?? "YOLO"),
    detections,
    count: Number(raw.count ?? detections.length),
    inferenceTimeSec: Number(raw.inference_time_sec ?? 0),
    imageSize: { width: Number(image?.width ?? 1), height: Number(image?.height ?? 1) },
    summary: rawSummary.map((item) => {
      const entry = item as Record<string, unknown>;
      return { className: String(entry.class_name ?? "litter"), count: Number(entry.count ?? 0) };
    }),
  };
}

async function parseError(response: Response) {
  const fallback = `The detection service returned ${response.status}.`;
  try {
    const body = (await response.json()) as { detail?: string | { message?: string; code?: string } };
    if (typeof body.detail === "string") return new DetectionApiError(body.detail, { status: response.status });
    return new DetectionApiError(body.detail?.message || fallback, { code: body.detail?.code, status: response.status });
  } catch {
    return new DetectionApiError(fallback, { status: response.status });
  }
}

export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE_URL}/health`, { signal });
  if (!response.ok) throw await parseError(response);
  return (await response.json()) as HealthResponse;
}

export async function requestDetection(file: File, model: ModelId, signal?: AbortSignal): Promise<DetectionResponse> {
  const body = new FormData();
  body.append("file", file);
  body.append("model", model);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/v1/detections`, { method: "POST", body, signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new DetectionApiError("The detection service could not be reached. Check its URL and service status.");
  }

  if (!response.ok) throw await parseError(response);
  return toCamelResponse((await response.json()) as Record<string, unknown>);
}
