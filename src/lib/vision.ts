import { CLASS_COLORS, DAMAGE_CLASSES, computeRHI, type DamageCode, type Detection } from "./damage";
import { runInference } from "./api";

/** Calibrated confidence threshold from the validation run. */
export const TAU = 0.1821;
export const MAX_VIDEO_SECONDS = 60;
export const CODES: DamageCode[] = ["D00", "D10", "D20", "D40"];

export const emptyCounts = (): Record<DamageCode, number> => ({ D00: 0, D10: 0, D20: 0, D40: 0 });

export function countByClass(dets: Detection[]) {
  const c = emptyCounts();
  for (const d of dets) c[d.code]++;
  return c;
}

export const boxArea = (d: Detection) => Math.max(0, (d.x2 - d.x1) * (d.y2 - d.y1));

/** Points this box subtracts from the Road Health Index. */
export const penaltyOf = (d: Detection) => DAMAGE_CLASSES[d.code].severity * boxArea(d) * d.confidence * 100;

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("This image could not be read."));
    img.src = src;
  });
}

export function drawBoxes(ctx: CanvasRenderingContext2D, W: number, H: number, dets: Detection[], selected = -1) {
  const k = Math.max(1, W / 900);
  dets.forEach((d, i) => {
    const color = CLASS_COLORS[d.code];
    const x = d.x1 * W, y = d.y1 * H, w = (d.x2 - d.x1) * W, h = (d.y2 - d.y1) * H;
    ctx.lineWidth = (i === selected ? 4.5 : 2.5) * k;
    ctx.strokeStyle = color;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = color + (i === selected ? "44" : "18");
    ctx.fillRect(x, y, w, h);

    const text = `${d.code} ${(d.confidence * 100).toFixed(0)}%`;
    ctx.font = `bold ${Math.round(11 * k)}px 'JetBrains Mono', monospace`;
    const tw = ctx.measureText(text).width;
    const ph = 19 * k;
    const ly = y - ph > 0 ? y - ph : y;
    ctx.fillStyle = color;
    ctx.fillRect(x, ly, tw + 10 * k, ph);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, x + 5 * k, ly + ph - 6 * k);
  });
}

/** Clean JPEG of the original road without any bounding boxes. */
export function rawThumb(img: HTMLImageElement, maxW = 900): string {
  const s = Math.min(1, maxW / img.naturalWidth);
  const W = Math.round(img.naturalWidth * s);
  const H = Math.round(img.naturalHeight * s);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0, W, H);
  return c.toDataURL("image/jpeg", 0.85);
}

/** Small JPEG with the detection boxes burned in, cheap enough to keep in localStorage. */
export function annotatedThumb(img: HTMLImageElement, dets: Detection[], maxW = 640): string {
  const s = Math.min(1, maxW / img.naturalWidth);
  const W = Math.round(img.naturalWidth * s);
  const H = Math.round(img.naturalHeight * s);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0, W, H);
  drawBoxes(ctx, W, H, dets);
  return c.toDataURL("image/jpeg", 0.7);
}

/** Pulls evenly spaced frames out of a short clip. */
export async function grabVideoFrames(file: File, count = 4): Promise<Blob[]> {
  const url = URL.createObjectURL(file);
  try {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.src = url;
    await new Promise<void>((res, rej) => {
      v.onloadedmetadata = () => res();
      v.onerror = () => rej(new Error("This video could not be read."));
    });
    if (!isFinite(v.duration) || v.duration > MAX_VIDEO_SECONDS) {
      throw new Error(`Please upload a clip of ${MAX_VIDEO_SECONDS} seconds or less.`);
    }
    const scale = Math.min(1, 1280 / (v.videoWidth || 1280));
    const c = document.createElement("canvas");
    c.width = Math.round((v.videoWidth || 1280) * scale);
    c.height = Math.round((v.videoHeight || 720) * scale);
    const ctx = c.getContext("2d")!;
    const out: Blob[] = [];
    for (let i = 0; i < count; i++) {
      const t = Math.min(Math.max(0.05, v.duration - 0.05), (v.duration * (i + 0.5)) / count);
      await new Promise<void>((res) => {
        v.onseeked = () => res();
        v.currentTime = t;
      });
      ctx.drawImage(v, 0, 0, c.width, c.height);
      const b = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.9));
      if (b) out.push(b);
    }
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface Analysis {
  /** Detections at or above the calibrated threshold. */
  detections: Detection[];
  rhi: number;
  counts: Record<DamageCode, number>;
  latencyMs: number;
  simulated: boolean;
  thumb: string;
  originalThumb?: string;
  frames: number;
}

/** Runs the model on a photo, or on sampled frames of a clip (the worst frame is kept). */
export async function analyzeMedia(file: File, kind: "image" | "video"): Promise<Analysis> {
  const blobs: Blob[] = kind === "video" ? await grabVideoFrames(file) : [file];
  if (blobs.length === 0) throw new Error("No frames could be read from this file.");

  let best: { blob: Blob; dets: Detection[]; rhi: number } | null = null;
  let latency = 0;
  let simulated = false;

  for (const blob of blobs) {
    const res = await runInference(blob, "ensemble", 0.001);
    latency += res.latencyMs;
    simulated = simulated || !!res.isMock;
    const rhi = computeRHI(res.detections, TAU);
    if (!best || rhi < best.rhi) best = { blob, dets: res.detections, rhi };
  }
  if (!best) throw new Error("Model returned no result.");

  const visible = best.dets.filter((d) => d.confidence >= TAU);
  const url = URL.createObjectURL(best.blob);
  try {
    const img = await loadImage(url);
    const cleanThumb = rawThumb(img);
    return {
      detections: visible,
      rhi: best.rhi,
      counts: countByClass(visible),
      latencyMs: latency / blobs.length,
      simulated,
      thumb: annotatedThumb(img, visible),
      originalThumb: cleanThumb,
      frames: blobs.length,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
