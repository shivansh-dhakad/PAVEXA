/**
 * api.ts — Service layer for the PAVEXA Backend.
 * Connects to FastAPI endpoint running the YOLO26s Dual-Scale Ensemble (1088px + 640px with WBF).
 * Automatically falls back to high-fidelity mock if the local backend server is not running.
 */

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
  isMock?: boolean;
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

// ── Fallback Benchmark Info (exact values from Kaggle notebook run) ───────────
export const BENCHMARK_METRICS: ModelBenchmarkInfo = {
  architecture: "YOLO26s Dual-Scale Ensemble (WBF)",
  main_imgsz: 1088,
  secondary_imgsz: 640,
  ensemble_weights: [1, 1],
  wbf_iou_thr: 0.55,
  nms_iou: 0.45,
  opt_conf_thr: 0.1821,
  val_accuracy_score: 48.54,
  map50: 57.88,
  map50_95: 25.11,
  precision: 63.41,
  recall: 54.02,
  main_wall_ms: 41.4,
  ensemble_ms: 60.3,
  test_images_count: 4200,
  test_detections_count: 87975,
  test_none_count: 206,
};

// ── State ────────────────────────────────────────────────────────────────────
let useLive = true;
let selectedModelMode: ModelInferenceMode = "ensemble";

export const isLiveMode = () => useLive;
export const setLiveMode = (v: boolean) => { useLive = v; };

export const getModelMode = () => selectedModelMode;
export const setModelMode = (m: ModelInferenceMode) => { selectedModelMode = m; };

const PRIMARY_ENDPOINT = "http://localhost:8000";
const PROXY_ENDPOINT = "/api";

// ── Mock data generator ──────────────────────────────────────────────────────
const CODES: DamageCode[] = ["D00", "D10", "D20", "D40"];
function rand(min: number, max: number) { return Math.random() * (max - min) + min; }

function mockDetections(seed: number): Detection[] {
  const rng = (n: number) => Math.abs(Math.sin(seed * 9301 + n * 49297 + 233995)) % 1;
  const count = Math.floor(rng(0) * 8) + 3;
  return Array.from({ length: count }, (_, i) => {
    const x1 = rng(i * 4 + 1) * 0.72;
    const y1 = rng(i * 4 + 2) * 0.72;
    return {
      code: CODES[Math.floor(rng(i * 4 + 3) * 4)] as DamageCode,
      confidence: rng(i * 4 + 4) * 0.88 + 0.08,
      x1,
      y1,
      x2: Math.min(1.0, x1 + rng(i * 4 + 5) * 0.22 + 0.06),
      y2: Math.min(1.0, y1 + rng(i * 4 + 6) * 0.18 + 0.05),
    };
  });
}

// ── Public API ────────────────────────────────────────────────────────────────
export async function runInference(
  file: File | Blob,
  mode: ModelInferenceMode = selectedModelMode,
  conf: number = 0.001
): Promise<InferenceResult> {
  const t0 = performance.now();
  const fileName = file instanceof File ? file.name : "frame.jpg";

  if (useLive) {
    const form = new FormData();
    form.append("file", file, fileName);

    const endpoints = [
      `${PRIMARY_ENDPOINT}/predict?mode=${mode}&conf=${conf}`,
      `${PROXY_ENDPOINT}/predict?mode=${mode}&conf=${conf}`,
    ];

    for (const ep of endpoints) {
      try {
        const res = await fetch(ep, {
          method: "POST",
          body: form,
          signal: AbortSignal.timeout(15000),
        });
        if (res.ok) {
          const data = await res.json();
          return {
            detections: data.detections,
            latencyMs: data.latency_ms ?? (performance.now() - t0),
            imageWidth: data.width ?? 1280,
            imageHeight: data.height ?? 720,
            modelMode: data.model_mode,
            device: data.device,
            modelsUsed: data.models_used,
            isMock: false,
          };
        }
      } catch {
        // try next endpoint or fallback
      }
    }
  }

  // Fallback to high-fidelity mock if backend is not currently running
  const simDelay = mode === "ensemble" ? rand(45, 58) : rand(28, 38);
  await new Promise((r) => setTimeout(r, simDelay));
  const seed = (file instanceof File ? (file.size ^ (file.lastModified & 0xffff)) : (file.size ^ Math.floor(Math.random() * 10000))) || Math.floor(Math.random() * 10000);
  const latencyMs = performance.now() - t0;

  return {
    detections: mockDetections(seed),
    latencyMs,
    imageWidth: 1280,
    imageHeight: 720,
    modelMode: mode === "ensemble" ? "ensemble_wbf (simulated)" : `${mode} (simulated)`,
    device: "cpu",
    modelsUsed: mode === "ensemble" ? ["yolo26s(1024@1088px)", "yolo26s(640)"] : [mode],
    isMock: true,
  };
}

export async function checkApiHealth(): Promise<"live" | "mock"> {
  if (!useLive) return "mock";
  try {
    const res = await fetch(`${PRIMARY_ENDPOINT}/health`, { signal: AbortSignal.timeout(1500) });
    if (res.ok) return "live";
  } catch {
    try {
      const resProxy = await fetch(`${PROXY_ENDPOINT}/health`, { signal: AbortSignal.timeout(1500) });
      if (resProxy.ok) return "live";
    } catch {
      return "mock";
    }
  }
  return "mock";
}

export async function fetchModelInfo(): Promise<ModelBenchmarkInfo> {
  try {
    const res = await fetch(`${PRIMARY_ENDPOINT}/model-info`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) return await res.json();
  } catch {
    // fallback to static benchmark constants
  }
  return BENCHMARK_METRICS;
}
