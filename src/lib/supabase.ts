/**
 * src/lib/supabase.ts
 * Single shared Supabase client for the whole app.
 * Values come from VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env
 */
import { createClient } from "@supabase/supabase-js";

const url  = import.meta.env.VITE_SUPABASE_URL  as string;
const key  = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !key) {
  throw new Error(
    "[PAVEXA] Missing Supabase env vars.\n" +
    "Copy .env.example → .env and fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
  );
}

export const supabase = createClient(url, key);

// ── Typed DB row shapes (mirror the SQL schema) ───────────────────────────────

export interface DbComplaint {
  id: string;
  created_at: string;
  citizen_id: string;
  citizen_name: string;
  media_kind: "image" | "video";
  thumb: string;
  comment: string;
  lat: number;
  lng: number;
  road: string;
  hq_id: string;
  distance_km: number;
  status: string;
  rhi: number;
  severity: string;
  d00_count: number;
  d10_count: number;
  d20_count: number;
  d40_count: number;
  latency_ms: number;
  simulated: boolean;
  frames: number;
  // from complaint_full view
  detections?: DbDetection[];
  updates?: DbUpdate[];
}

export interface DbDetection {
  id: number;
  complaint_id: string;
  code: string;
  confidence: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface DbUpdate {
  id: number;
  complaint_id: string;
  status: string;
  note: string;
  created_at: string;
}

export interface DbInspectionRecord {
  id: number;
  inspection_code?: string;
  image_id: string;
  thumbnail_url?: string;
  created_at: string;
  /** Formatted display time, derived from created_at */
  timestamp?: string;
  /** Formatted display date, derived from created_at */
  date_formatted?: string;
  latency_ms: number;
  total_detections: number;
  d00_count: number;
  d10_count: number;
  d20_count: number;
  d40_count: number;
  rhi: number;
  location_name: string;
  latitude?: number;
  longitude?: number;
  source_mode: string;
  status: string;
  /** 0 = real, 1 = demo/seed — not stored in DB, always 0 from Supabase */
  is_demo?: number;
  user_id?: string;
}
