import { DAMAGE_CLASSES, type DamageCode, type Detection } from "./damage";

export const DAMAGE_CODES: DamageCode[] = ["D00", "D10", "D20", "D40"];

/** Default display confidence threshold (30%). */
export const DEFAULT_THRESHOLD = 0.3;
/** Validation-tuned threshold from the model repository. */
export const VALIDATION_THRESHOLD = 0.1821;

export const areaOf = (d: Detection) => Math.max(0, (d.x2 - d.x1) * (d.y2 - d.y1));

export interface PenaltyRow {
  detection: Detection;
  /** 1-based rank by confidence among visible boxes. */
  rank: number;
  severity: number;
  /** Fraction of the image covered by the box (0–1). */
  area: number;
  /** Points subtracted from the Road Health Index: severity × area × confidence × 100. */
  penalty: number;
}

export interface ClassStats {
  count: number;
  penalty: number;
  area: number;
  avgConfidence: number;
}

export interface RhiBreakdown {
  rows: PenaltyRow[];
  totalPenalty: number;
  totalArea: number;
  rhi: number;
  byClass: Record<DamageCode, ClassStats>;
}

/**
 * Same formula as computeRHI in damage.ts, but keeps every intermediate value
 * so the page can show exactly how the score was reached.
 * `visible` must already be filtered by the display threshold.
 */
export function breakdown(visible: Detection[]): RhiBreakdown {
  const byClass = Object.fromEntries(
    DAMAGE_CODES.map((code) => [code, { count: 0, penalty: 0, area: 0, avgConfidence: 0 }]),
  ) as Record<DamageCode, ClassStats>;

  const rows: PenaltyRow[] = visible.map((detection, index) => {
    const severity = DAMAGE_CLASSES[detection.code].severity;
    const area = areaOf(detection);
    const penalty = severity * area * detection.confidence * 100;
    const stats = byClass[detection.code];
    stats.count += 1;
    stats.penalty += penalty;
    stats.area += area;
    stats.avgConfidence += detection.confidence;
    return { detection, rank: index + 1, severity, area, penalty };
  });

  DAMAGE_CODES.forEach((code) => {
    const stats = byClass[code];
    if (stats.count > 0) stats.avgConfidence /= stats.count;
  });

  const totalPenalty = rows.reduce((sum, row) => sum + row.penalty, 0);
  const totalArea = rows.reduce((sum, row) => sum + row.area, 0);
  return {
    rows,
    totalPenalty,
    totalArea,
    rhi: Math.max(0, Math.round(100 - totalPenalty)),
    byClass,
  };
}

export const RHI_BANDS = [
  { label: "Critical", range: "0–39", from: 0, to: 40, color: "#dc2626" },
  { label: "Poor", range: "40–59", from: 40, to: 60, color: "#ea580c" },
  { label: "Fair", range: "60–79", from: 60, to: 80, color: "#d97706" },
  { label: "Good", range: "80–100", from: 80, to: 100, color: "#16a34a" },
] as const;
