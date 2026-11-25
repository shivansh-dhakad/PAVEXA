import type { Detection, DamageCode } from "./damage";

export type ModelInferenceMode = "ensemble" | "main_only" | "640_only";

export interface InferenceResult {
  detections: Detection[];
  latencyMs: number;
  imageWidth: number;
  imageHeight: number;
  modelMode?: string;
  device?: string;
  modelsUsed?: string[];
}

export interface ModelBenchmarkInfo {
  architecture: string;
  main_imgsz: number;
  secondary_imgsz: number;
  ensemble_weights: number[];
  wbf_iou_thr: number;
  nms_iou: number;
  opt_conf_thr: number;
  val_accuracy_score: number;
  map50: number;
  map50_95: number;
  precision: number;
  recall: number;
  main_wall_ms: number;
  ensemble_ms: number;
  test_images_count: number;
  test_detections_count: number;
  test_none_count: number;
}

export const BENCHMARK_METRICS: ModelBenchmarkInfo = {
  architecture: "YOLO26s dual-scale ensemble with test-time augmentation and Weighted Box Fusion",
  main_imgsz: 1088,
  secondary_imgsz: 640,
  ensemble_weights: [1, 1],
  wbf_iou_thr: 0.55,
  nms_iou: 0.45,
  opt_conf_thr: 0.1821,
  val_accuracy_score: 49.39,
  map50: 59.1,
  map50_95: 26.08,
  precision: 64.6,
  recall: 53.62,
  main_wall_ms: 41.5,
  ensemble_ms: 60.7,
  test_images_count: 4200,
  test_detections_count: 101761,
  test_none_count: 163,
};

const PRIMARY_ENDPOINT =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ||
  "http://localhost:8000";
const PROXY_ENDPOINT = "/api";
const REQUEST_TIMEOUT_MS = 120_000;

function getErrorMessage(detail: unknown, status: number) {
  if (typeof detail === "string" && detail.trim()) return detail;
  if (detail && typeof detail === "object" && "detail" in detail) {
    const message = (detail as { detail?: unknown }).detail;
    if (typeof message === "string" && message.trim()) return message;
  }
  return `Model API request failed with status ${status}.`;
}

export async function runInference(
  file: File | Blob,
  mode: ModelInferenceMode = "ensemble",
  conf = 0.001,
): Promise<InferenceResult> {
  const fileName = file instanceof File ? file.name : "frame.jpg";
  const endpoints = [
    `${PRIMARY_ENDPOINT}/predict?mode=${mode}&conf=${conf}`,
    `${PROXY_ENDPOINT}/predict?mode=${mode}&conf=${conf}`,
  ];
  let lastNetworkError: unknown;

  for (const endpoint of endpoints) {
    const form = new FormData();
    form.append("file", file, fileName);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.status === 502 || response.status === 504) {
        lastNetworkError = new Error(`Backend proxy returned ${response.status}`);
        continue;
      }
      if (!response.ok) {
        let detail: unknown;
        try {
          detail = await response.json();
        } catch {
          detail = undefined;
        }
        throw new Error(getErrorMessage(detail, response.status));
      }

      const data = await response.json();
      return {
        detections: data.detections,
        latencyMs: data.latency_ms,
        imageWidth: data.width,
        imageHeight: data.height,
        modelMode: data.model_mode,
        device: data.device,
        modelsUsed: data.models_used,
      };
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      lastNetworkError = error;
    }
  }

  const reason = lastNetworkError instanceof Error ? ` ${lastNetworkError.message}` : "";
  throw new Error(`Could not connect to the PAVEXA model API. Start the FastAPI service on port 8000 and try again.${reason}`);
}

export async function checkApiHealth(): Promise<"live" | "offline"> {
  for (const endpoint of [`${PRIMARY_ENDPOINT}/health`, `${PROXY_ENDPOINT}/health`]) {
    try {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(5000) });
      if (response.ok) return "live";
    } catch {
      // Try the Vite proxy after the configured backend URL.
    }
  }
  return "offline";
}

export async function fetchModelInfo(): Promise<ModelBenchmarkInfo> {
  try {
    const response = await fetch(`${PRIMARY_ENDPOINT}/model-info`, {
      signal: AbortSignal.timeout(2000),
    });
    if (response.ok) return await response.json();
  } catch {
    // The local repository metrics remain available when the API is offline.
  }
  return BENCHMARK_METRICS;
}

export type { DamageCode };
