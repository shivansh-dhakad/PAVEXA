/**
 * src/lib/database.ts
 * Inspection record service — backed by Supabase, no localStorage.
 */
import { supabase, type DbInspectionRecord } from "./supabase";
import { CLASS_COLORS, type DamageCode } from "./damage";

// ── Re-export types ───────────────────────────────────────────────────────────
export type { DbInspectionRecord as InspectionRecord };

export interface DamageHotspot {
  id: number;
  location_name: string;
  corridor: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  severity_tier: "Critical" | "High" | "Moderate" | "Watch";
  primary_damage: DamageCode;
  incident_count: number;
  avg_rhi: number;
  status: string;
  last_inspected: string;
}

export interface DamageClassDistribution {
  code: DamageCode;
  label: string;
  count: number;
  percentage: number;
  color: string;
  severity: string;
}

export interface DashboardStats {
  images_inspected: number;
  damages_detected: number;
  potholes: number;
  cracks: number;
  avg_inference_time_ms: number;
  damage_distribution: Record<DamageCode, DamageClassDistribution>;
  recent_inspections: DbInspectionRecord[];
  damage_hotspots: DamageHotspot[];
  /** Always false — no demo data in Supabase mode. */
  is_demo_mode: boolean;
  demo_records_count: number;
  live_records_count: number;
}

// ── Empty / zero state used while loading ────────────────────────────────────
export const EMPTY_STATS: DashboardStats = {
  images_inspected: 0,
  damages_detected: 0,
  potholes: 0,
  cracks: 0,
  avg_inference_time_ms: 0,
  damage_distribution: {
    D00: { code: "D00", label: "Longitudinal Crack", count: 0, percentage: 0, color: CLASS_COLORS.D00, severity: "Moderate" },
    D10: { code: "D10", label: "Transverse Crack",   count: 0, percentage: 0, color: CLASS_COLORS.D10, severity: "Moderate" },
    D20: { code: "D20", label: "Alligator Crack",    count: 0, percentage: 0, color: CLASS_COLORS.D20, severity: "Severe" },
    D40: { code: "D40", label: "Pothole",            count: 0, percentage: 0, color: CLASS_COLORS.D40, severity: "Critical" },
  },
  recent_inspections: [],
  damage_hotspots: [],
  is_demo_mode: false,
  demo_records_count: 0,
  live_records_count: 0,
};

/** Alias kept for backward compatibility with Dashboard.tsx imports. */
export const DEMO_BASELINE_STATS = EMPTY_STATS;

/** No-op kept for backward compatibility — no database to reset. */
export async function resetDatabase(): Promise<void> {
  // With Supabase, delete via the dashboard or add an admin API call here.
  console.warn("[PAVEXA] resetDatabase: delete records directly in Supabase if needed.");
}

// ── Fetch aggregated stats from inspection_records ───────────────────────────
export async function fetchDatabaseStats(_includeDemo: boolean = true): Promise<DashboardStats> {
  const { data, error } = await supabase
    .from("inspection_records")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error || !data || data.length === 0) return EMPTY_STATS;

  const records = data as DbInspectionRecord[];
  const total = records.length;
  const d00 = records.reduce((a, r) => a + r.d00_count, 0);
  const d10 = records.reduce((a, r) => a + r.d10_count, 0);
  const d20 = records.reduce((a, r) => a + r.d20_count, 0);
  const d40 = records.reduce((a, r) => a + r.d40_count, 0);
  const totalDamages = d00 + d10 + d20 + d40;
  const denom = Math.max(1, totalDamages);
  const avgLat = Math.round((records.reduce((a, r) => a + r.latency_ms, 0) / total) * 10) / 10;

  return {
    images_inspected: total,
    damages_detected: totalDamages,
    potholes: d40,
    cracks: d00 + d10 + d20,
    avg_inference_time_ms: avgLat,
    damage_distribution: {
      D00: { code: "D00", label: "Longitudinal Crack", count: d00, percentage: Math.round((d00 / denom) * 1000) / 10, color: CLASS_COLORS.D00, severity: "Moderate" },
      D10: { code: "D10", label: "Transverse Crack",   count: d10, percentage: Math.round((d10 / denom) * 1000) / 10, color: CLASS_COLORS.D10, severity: "Moderate" },
      D20: { code: "D20", label: "Alligator Crack",    count: d20, percentage: Math.round((d20 / denom) * 1000) / 10, color: CLASS_COLORS.D20, severity: "Severe" },
      D40: { code: "D40", label: "Pothole",            count: d40, percentage: Math.round((d40 / denom) * 1000) / 10, color: CLASS_COLORS.D40, severity: "Critical" },
    },
    recent_inspections: records.slice(0, 10),
    damage_hotspots: [],           // hotspots are derived from the complaints table now
    is_demo_mode: false,
    demo_records_count: 0,
    live_records_count: total,
  };
}

/** Persist a new inspection record after ML analysis. */
export async function persistInspectionRecord(record: {
  image_id: string;
  latency_ms: number;
  detections: { code: string; confidence: number }[];
  rhi: number;
  thumbnail_url?: string;
  location_name?: string;
  source_mode?: string;
}): Promise<void> {
  const d00 = record.detections.filter((d) => d.code === "D00").length;
  const d10 = record.detections.filter((d) => d.code === "D10").length;
  const d20 = record.detections.filter((d) => d.code === "D20").length;
  const d40 = record.detections.filter((d) => d.code === "D40").length;

  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase.from("inspection_records").insert({
    image_id: record.image_id,
    latency_ms: Math.round(record.latency_ms * 10) / 10,
    total_detections: record.detections.length,
    d00_count: d00,
    d10_count: d10,
    d20_count: d20,
    d40_count: d40,
    rhi: record.rhi,
    thumbnail_url: record.thumbnail_url ?? null,
    location_name: record.location_name ?? "Survey frame",
    source_mode: record.source_mode ?? "single",
    status: "Completed",
    user_id: user?.id ?? null,
  });

  if (error) throw new Error(error.message);
}

/** Fetch all inspection records for the current user. */
export async function fetchDetailedInspectionHistory(): Promise<DbInspectionRecord[]> {
  const { data, error } = await supabase
    .from("inspection_records")
    .select("*")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data as DbInspectionRecord[];
}

/** Delete an inspection record. */
export async function deleteInspectionRecord(id: number): Promise<boolean> {
  const { error } = await supabase.from("inspection_records").delete().eq("id", id);
  return !error;
}
