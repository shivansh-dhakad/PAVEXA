/**
 * src/lib/complaints.ts
 * Complaint service with persistent local storage cache and live Supabase sync.
 */
import { useEffect, useState } from "react";
import { supabase, type DbComplaint, type DbDetection, type DbUpdate } from "./supabase";
import type { DamageCode, Detection } from "./damage";
import { severityFromRhi, type Severity } from "./knowledge";
import { CODES, countByClass, emptyCounts } from "./vision";

// ── Types ────────────────────────────────────────────────────────────────────
export type Status = "Submitted" | "Verified" | "Assigned" | "In Progress" | "Resolved";
export const STATUS_FLOW: Status[] = ["Submitted", "Verified", "Assigned", "In Progress", "Resolved"];

export interface HQ {
  id: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
  serviceArea: string;
  contact: string;
  /** Jurisdiction polygon as [latitude, longitude] vertices. */
  boundary: [number, number][];
}

/** Static list — HQs for regional routing. */
export const HQS: HQ[] = [
  { id: "mysuru", name: "Mysuru PWD Division", city: "Mysuru", lat: 12.311, lng: 76.654, serviceArea: "Mysuru urban roads & NH-275 bypass", contact: "mysuru-roads@pwd.example", boundary: [[12.22,76.57],[12.22,76.74],[12.39,76.74],[12.39,76.57]] },
  { id: "bengaluru", name: "Bengaluru PWD Circle", city: "Bengaluru", lat: 12.9716, lng: 77.5946, serviceArea: "Bengaluru PWD jurisdiction", contact: "blr-roads@pwd.example", boundary: [[12.75,77.35],[12.75,77.85],[13.25,77.85],[13.25,77.35]] },
  { id: "indore", name: "Indore Municipal Roads Cell", city: "Indore", lat: 22.7196, lng: 75.8577, serviceArea: "Indore municipal road network", contact: "indore-roads@city.example", boundary: [[22.55,75.65],[22.55,76.05],[22.90,76.05],[22.90,75.65]] },
  { id: "delhi", name: "Delhi PWD Headquarters", city: "Delhi", lat: 28.6139, lng: 77.209, serviceArea: "Delhi PWD-maintained corridors", contact: "delhi-roads@pwd.example", boundary: [[28.35,76.85],[28.35,77.45],[28.95,77.45],[28.95,76.85]] },
  { id: "tokyo", name: "Tokyo Metropolitan Road Office", city: "Tokyo", lat: 35.6762, lng: 139.7503, serviceArea: "Tokyo metropolitan arterial network", contact: "tokyo-roads@metro.example", boundary: [[35.45,139.45],[35.45,140.05],[35.95,140.05],[35.95,139.45]] },
  { id: "prague", name: "Prague Road Administration", city: "Prague", lat: 50.0755, lng: 14.4378, serviceArea: "Prague city road administration", contact: "prague-roads@city.example", boundary: [[49.85,14.10],[49.85,14.80],[50.35,14.80],[50.35,14.10]] },
];

export interface Report {
  rhi: number;
  severity: Severity;
  counts: Record<DamageCode, number>;
  detections: Detection[];
  latencyMs: number;
  simulated: boolean;
  frames: number;
}

export interface Update {
  status: Status;
  at: number;
  note: string;
}

export interface Complaint {
  id: string;
  createdAt: number;
  citizenId: string;
  citizenName: string;
  mediaKind: "image" | "video";
  thumb: string;
  originalThumb?: string;
  comment: string;
  lat: number;
  lng: number;
  road: string;
  hqId: string;
  distanceKm: number;
  report: Report;
  status: Status;
  updates: Update[];
}

// ── Local Storage Cache & In-Memory Listeners ─────────────────────────────────
const LOCAL_STORAGE_KEY = "pavexa_complaints_v2";
const complaintListeners = new Set<(list: Complaint[]) => void>();

function notifyComplaintListeners(list: Complaint[]) {
  complaintListeners.forEach((fn) => fn(list));
}

function getStoredComplaints(): Complaint[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Complaint[];
  } catch {
    return [];
  }
}

function saveStoredComplaints(list: Complaint[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.warn("[PAVEXA] Failed to write local complaints cache:", err);
  }
}

// ── Geo math ─────────────────────────────────────────────────────────────────
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function nearestHQ(lat: number, lng: number): { hq: HQ; km: number } {
  let best = HQS[0];
  let d = Infinity;
  for (const h of HQS) {
    const x = distanceKm(lat, lng, h.lat, h.lng);
    if (x < d) { d = x; best = h; }
  }
  return { hq: best, km: d };
}

function pointInBoundary(lat: number, lng: number, boundary: [number, number][]) {
  let inside = false;
  for (let i = 0, j = boundary.length - 1; i < boundary.length; j = i++) {
    const [yi, xi] = boundary[i]; const [yj, xj] = boundary[j];
    if (((yi > lat) !== (yj > lat)) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Route by service-area jurisdiction first. Distance is only a fallback for unassigned territory. */
export function routeByJurisdiction(lat: number, lng: number): { hq: HQ; km: number; matchedBoundary: boolean } {
  const hq = HQS.find((office) => pointInBoundary(lat, lng, office.boundary));
  if (hq) return { hq, km: Math.round(distanceKm(lat, lng, hq.lat, hq.lng) * 10) / 10, matchedBoundary: true };
  const nearest = nearestHQ(lat, lng);
  return { ...nearest, km: Math.round(nearest.km * 10) / 10, matchedBoundary: false };
}

// ── Hotspots ─────────────────────────────────────────────────────────────────
export const CLUSTER_RADIUS_M = 120;
export const REPEAT_BONUS = 12;

export interface Hotspot {
  id: string;
  lat: number;
  lng: number;
  road: string;
  complaints: Complaint[];
  score: number;
  tier: Severity;
  dominant: DamageCode;
}

export function buildHotspots(list: Complaint[]): Hotspot[] {
  const groups: { lat: number; lng: number; items: Complaint[] }[] = [];
  for (const c of [...list].sort((a, b) => a.createdAt - b.createdAt)) {
    const g = groups.find((x) => distanceKm(x.lat, x.lng, c.lat, c.lng) * 1000 <= CLUSTER_RADIUS_M);
    if (g) {
      g.items.push(c);
      g.lat = g.items.reduce((s, i) => s + i.lat, 0) / g.items.length;
      g.lng = g.items.reduce((s, i) => s + i.lng, 0) / g.items.length;
    } else {
      groups.push({ lat: c.lat, lng: c.lng, items: [c] });
    }
  }
  return groups
    .map((g) => {
      const n = g.items.length;
      const worst = Math.max(...g.items.map((c) => 100 - c.report.rhi));
      const score = Math.min(100, Math.round(worst + REPEAT_BONUS * (n - 1)));
      const totals = emptyCounts();
      for (const c of g.items) for (const k of CODES) totals[k] += c.report.counts[k];
      const dominant = CODES.reduce((a, b) => (totals[b] > totals[a] ? b : a), "D00" as DamageCode);
      return {
        id: `h-${g.items[0].id}`,
        lat: g.lat,
        lng: g.lng,
        road: g.items[0].road,
        complaints: g.items,
        score,
        tier: severityFromRhi(100 - score, totals.D40 > 0),
        dominant,
      };
    })
    .sort((a, b) => b.score - a.score);
}

// ── DB row → app type conversion ─────────────────────────────────────────────
function rowToComplaint(row: DbComplaint): Complaint {
  const counts: Record<DamageCode, number> = {
    D00: row.d00_count ?? 0,
    D10: row.d10_count ?? 0,
    D20: row.d20_count ?? 0,
    D40: row.d40_count ?? 0,
  };

  const detections: Detection[] = (row.detections ?? []).map((d: DbDetection) => ({
    code: d.code as DamageCode,
    confidence: d.confidence,
    x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2,
  }));

  const updates: Update[] = (row.updates ?? []).map((u: DbUpdate) => ({
    status: u.status as Status,
    at: new Date(u.created_at).getTime(),
    note: u.note,
  }));

  return {
    id: row.id,
    createdAt: new Date(row.created_at).getTime(),
    citizenId: row.citizen_id,
    citizenName: row.citizen_name,
    mediaKind: row.media_kind,
    thumb: row.thumb,
    originalThumb: (row as any).original_thumb ?? row.thumb,
    comment: row.comment ?? "",
    lat: row.lat,
    lng: row.lng,
    road: row.road,
    hqId: row.hq_id ?? "mysuru",
    distanceKm: row.distance_km ?? 0,
    status: row.status as Status,
    report: {
      rhi: row.rhi,
      severity: row.severity as Severity,
      counts,
      detections,
      latencyMs: row.latency_ms ?? 0,
      simulated: row.simulated ?? false,
      frames: row.frames ?? 1,
    },
    updates: updates.length > 0 ? updates : [{
      status: row.status as Status,
      at: new Date(row.created_at).getTime(),
      note: "Complaint filed.",
    }],
  };
}

// ── Hook: live complaint list (Realtime + Local Cache) ───────────────────────
export function useComplaints(): Complaint[] {
  const [complaints, setComplaints] = useState<Complaint[]>(() => getStoredComplaints());

  useEffect(() => {
    // 1. Initial local state update
    const onChange = (list: Complaint[]) => setComplaints(list);
    complaintListeners.add(onChange);

    // 2. Load from Supabase and merge
    async function loadRemote() {
      try {
        const { data, error } = await supabase
          .from("complaint_full")
          .select("*")
          .order("created_at", { ascending: false });

        if (!error && data && data.length > 0) {
          const remoteList = (data as DbComplaint[]).map(rowToComplaint);
          const localList = getStoredComplaints();
          const remoteIds = new Set(remoteList.map((r) => r.id));
          const merged = [...remoteList, ...localList.filter((l) => !remoteIds.has(l.id))];
          saveStoredComplaints(merged);
          setComplaints(merged);
        }
      } catch (err) {
        console.warn("[PAVEXA] Supabase sync notice:", err);
      }
    }
    loadRemote();

    // 3. Realtime subscription
    let channel: any = null;
    try {
      channel = supabase
        .channel("complaints-realtime")
        .on("postgres_changes", { event: "*", schema: "public", table: "complaints" }, () => loadRemote())
        .on("postgres_changes", { event: "*", schema: "public", table: "complaint_updates" }, () => loadRemote())
        .subscribe();
    } catch {}

    return () => {
      complaintListeners.delete(onChange);
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  return complaints;
}

// ── Mutations ────────────────────────────────────────────────────────────────

/** Add a new complaint (persists to local storage immediately, then syncs to Supabase). */
export async function addComplaint(c: Complaint): Promise<void> {
  // 1. Always save to local cache FIRST so it immediately registers in UI
  const current = getStoredComplaints();
  const updated = [c, ...current.filter((x) => x.id !== c.id)];
  saveStoredComplaints(updated);
  notifyComplaintListeners(updated);

  // 2. Synchronize to Supabase
  try {
    const { error: ce } = await supabase.from("complaints").insert({
      id: c.id,
      created_at: new Date(c.createdAt).toISOString(),
      citizen_id: c.citizenId,
      citizen_name: c.citizenName,
      media_kind: c.mediaKind,
      thumb: c.thumb,
      comment: c.comment,
      lat: c.lat,
      lng: c.lng,
      road: c.road,
      hq_id: c.hqId,
      distance_km: c.distanceKm,
      status: c.status,
      rhi: c.report.rhi,
      severity: c.report.severity,
      d00_count: c.report.counts.D00,
      d10_count: c.report.counts.D10,
      d20_count: c.report.counts.D20,
      d40_count: c.report.counts.D40,
      latency_ms: c.report.latencyMs,
      simulated: c.report.simulated,
      frames: c.report.frames,
    });
    if (ce) console.warn("[PAVEXA] Supabase complaint insert warning:", ce.message);

    // 2b. Insert detections
    if (c.report.detections.length > 0) {
      const rows = c.report.detections.map((d) => ({
        complaint_id: c.id,
        code: d.code,
        confidence: d.confidence,
        x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2,
      }));
      const { error: de } = await supabase.from("detections").insert(rows);
      if (de) console.warn("[PAVEXA] Supabase detections insert warning:", de.message);
    }

    // 2c. Insert initial status update
    if (c.updates.length > 0) {
      const rows = c.updates.map((u) => ({
        complaint_id: c.id,
        status: u.status,
        note: u.note,
        created_at: new Date(u.at).toISOString(),
      }));
      const { error: ue } = await supabase.from("complaint_updates").insert(rows);
      if (ue) console.warn("[PAVEXA] Supabase update insert warning:", ue.message);
    }
  } catch (err) {
    console.warn("[PAVEXA] Remote Supabase write skipped, complaint stored safely locally:", err);
  }
}

/** Update the workflow status of a complaint (called by authority). */
export async function updateStatus(id: string, status: Status, note: string): Promise<void> {
  const defaultNotes: Record<Status, string> = {
    Submitted:    "Complaint received.",
    Verified:     "Site report checked by the division engineer.",
    Assigned:     "Assigned to a repair crew.",
    "In Progress": "Repair work has started.",
    Resolved:     "Repair finished and checked.",
  };

  const finalNote = note.trim() || defaultNotes[status];
  const now = Date.now();

  // 1. Update local cache immediately
  const current = getStoredComplaints();
  const updated = current.map((c) => {
    if (c.id !== id) return c;
    return {
      ...c,
      status,
      updates: [...c.updates, { status, at: now, note: finalNote }],
    };
  });
  saveStoredComplaints(updated);
  notifyComplaintListeners(updated);

  // 2. Sync to Supabase
  try {
    await supabase.from("complaints").update({ status }).eq("id", id);
    await supabase.from("complaint_updates").insert({
      complaint_id: id,
      status,
      note: finalNote,
      created_at: new Date(now).toISOString(),
    });
  } catch (err) {
    console.warn("[PAVEXA] Remote status sync skipped, updated locally:", err);
  }
}

/** Build a new Complaint object from an ML analysis result (not yet saved). */
export function fileComplaint(p: {
  citizenId: string;
  citizenName: string;
  mediaKind: "image" | "video";
  thumb: string;
  originalThumb?: string;
  comment: string;
  lat: number;
  lng: number;
  road: string;
  detections: Detection[];
  rhi: number;
  latencyMs: number;
  simulated: boolean;
  frames: number;
}): Complaint {
  const counts = countByClass(p.detections);
  const near = routeByJurisdiction(p.lat, p.lng);
  const severity = severityFromRhi(p.rhi, counts.D40 > 0);
  const now = Date.now();
  const n = p.detections.length;
  return {
    id: `PVX-${now.toString().slice(-6)}`,
    createdAt: now,
    citizenId: p.citizenId,
    citizenName: p.citizenName,
    mediaKind: p.mediaKind,
    thumb: p.thumb,
    originalThumb: p.originalThumb ?? p.thumb,
    comment: p.comment.trim(),
    lat: p.lat,
    lng: p.lng,
    road: p.road.trim() || `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`,
    hqId: near.hq.id,
    distanceKm: near.km,
    report: {
      rhi: p.rhi,
      severity,
      counts,
      detections: [...p.detections].sort((a, b) => b.confidence - a.confidence).slice(0, 40),
      latencyMs: p.latencyMs,
      simulated: p.simulated,
      frames: p.frames,
    },
    status: "Submitted",
    updates: [{
      status: "Submitted",
      at: now,
      note: `Complaint filed. The model found ${n} damaged ${n === 1 ? "area" : "areas"} and rated it ${severity}.`,
    }],
  };
}
