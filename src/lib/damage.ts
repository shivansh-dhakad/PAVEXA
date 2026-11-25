export type DamageCode = "D00" | "D10" | "D20" | "D40";

export const DAMAGE_CLASSES: Record<DamageCode, { label: string; color: string; severity: number }> = {
  D00: { label: "Longitudinal Crack", color: "var(--color-d00)", severity: 2 },
  D10: { label: "Transverse Crack",   color: "var(--color-d10)", severity: 2 },
  D20: { label: "Alligator Crack",    color: "var(--color-d20)", severity: 3 },
  D40: { label: "Pothole",            color: "var(--color-d40)", severity: 4 },
};

export const CLASS_COLORS: Record<DamageCode, string> = {
  D00: "#177e89",
  D10: "#a96718",
  D20: "#596d91",
  D40: "#b24b34",
};

export interface Detection {
  code: DamageCode;
  confidence: number;
  /** normalised 0-1 relative to image dimensions */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface InferenceResult {
  detections: Detection[];
  latencyMs: number;
  imageWidth: number;
  imageHeight: number;
}

/** Road Health Index 0-100 (100 = pristine). */
export function computeRHI(detections: Detection[], threshold: number): number {
  const visible = detections.filter((d) => d.confidence >= threshold);
  if (visible.length === 0) return 100;

  let penaltySum = 0;
  for (const d of visible) {
    const area = (d.x2 - d.x1) * (d.y2 - d.y1); // 0-1
    const sev = DAMAGE_CLASSES[d.code].severity;
    penaltySum += sev * area * d.confidence * 100;
  }
  return Math.max(0, Math.round(100 - penaltySum));
}

export function rhiLabel(rhi: number): { label: string; color: string } {
  if (rhi >= 80) return { label: "Good",     color: "#16a34a" };
  if (rhi >= 60) return { label: "Fair",     color: "#d97706" };
  if (rhi >= 40) return { label: "Poor",     color: "#ea580c" };
  return               { label: "Critical",  color: "#dc2626" };
}
