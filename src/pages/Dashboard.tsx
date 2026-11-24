import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Camera, MapPinned,
  Clock, RefreshCw, Database, Activity,
  Eye, RotateCcw, ShieldCheck
} from "lucide-react";
import {
  fetchDatabaseStats,
  resetDatabase,
  type DashboardStats,
  type InspectionRecord,
  DEMO_BASELINE_STATS,
} from "../lib/database";
import { CLASS_COLORS, rhiLabel, type DamageCode } from "../lib/damage";

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>(DEMO_BASELINE_STATS);
  const [includeDemo, setIncludeDemo] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedInspection, setSelectedInspection] = useState<InspectionRecord | null>(null);

  const loadData = async (demo: boolean) => {
    setLoading(true);
    try {
      const data = await fetchDatabaseStats(demo);
      setStats(data);
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(includeDemo);
  }, [includeDemo]);

  const handleReset = async () => {
    if (confirm("Reset the database to demonstration sample records?")) {
      await resetDatabase();
      loadData(includeDemo);
    }
  };

  const dist = stats.damage_distribution;

  return (
    <div className="space-y-8 pb-16">

      {/* ── Top Header & Mode Banner ────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-ink">Operational Dashboard</h1>
            {stats.is_demo_mode ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-50 px-2.5 py-0.5 font-mono text-[11px] font-bold text-amber-700">
                <Database size={11} /> DEMONSTRATION MODE
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/30 bg-green-50 px-2.5 py-0.5 font-mono text-[11px] font-bold text-green-700">
                <ShieldCheck size={11} /> LIVE DATABASE
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted max-w-xl leading-relaxed">
            Pavement health analytics, aggregate distress object metrics, class distributions, and incident hotspots calculated directly from persistent database records.
          </p>
        </div>

        {/* Database Controls & Quick Access */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Demo toggle */}
          <button
            onClick={() => setIncludeDemo(!includeDemo)}
            className={`btn text-xs font-mono ${
              includeDemo ? "btn-ghost border-amber-300 text-amber-800 bg-amber-50/50" : "btn-ghost"
            }`}
            title="Toggle inclusion of demonstration baseline records"
          >
            <Database size={13} className="text-primary" />
            {includeDemo ? "Showing Demo Seed" : "Live Records Only"}
          </button>

          {/* Refresh */}
          <button
            onClick={() => loadData(includeDemo)}
            disabled={loading}
            className="btn btn-ghost text-xs font-mono"
            title="Refresh database records"
          >
            <RefreshCw size={13} className={loading ? "animate-spin text-primary" : ""} />
            Refresh
          </button>

          {/* Reset */}
          <button
            onClick={handleReset}
            className="btn btn-ghost text-xs text-muted font-mono hover:text-red-600"
            title="Reset database to demonstration baseline"
          >
            <RotateCcw size={13} />
          </button>

          {/* Predict CTA */}
          <Link to="/predictions" className="btn btn-primary text-xs">
            <Camera size={13} /> New Inspection
          </Link>
        </div>
      </div>

      {/* ── Mode Explanatory Notice (Explicit requirement) ───────────────────── */}
      {stats.is_demo_mode && (
        <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-2.5 text-xs text-amber-900 shadow-xs">
          <div className="flex items-center gap-2 font-mono">
            <span className="size-2 rounded-full bg-amber-500 animate-pulse" />
            <span>
              <b>Demonstration Mode Active:</b> Displaying RDD2020 benchmark database baseline ({stats.demo_records_count.toLocaleString()} pre-seeded survey frames).
            </span>
          </div>
          <span className="font-mono text-[11px] text-amber-800">
            Live client uploads: <b>{stats.live_records_count}</b>
          </span>
        </div>
      )}

      {/* ── 5 Core KPI Metric Cards (Explicit user requirements) ─────────────── */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {/* 1. Images Inspected */}
        <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between text-muted">
            <span className="text-xs font-semibold uppercase tracking-wider">Images Inspected</span>
            <div className="flex size-7 items-center justify-center rounded-md bg-blue-50 text-blue-600">
              <Camera size={14} />
            </div>
          </div>
          <p className="mt-3 font-mono text-3xl font-extrabold text-ink">
            {stats.images_inspected.toLocaleString()}
          </p>
          <p className="mt-1 text-[11px] text-muted">Total analyzed survey frames</p>
        </div>

        {/* 2. Damages Detected */}
        <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between text-muted">
            <span className="text-xs font-semibold uppercase tracking-wider">Damages Detected</span>
            <div className="flex size-7 items-center justify-center rounded-md bg-purple-50 text-purple-600">
              <Activity size={14} />
            </div>
          </div>
          <p className="mt-3 font-mono text-3xl font-extrabold text-ink">
            {stats.damages_detected.toLocaleString()}
          </p>
          <p className="mt-1 text-[11px] text-muted">Total detected distress objects</p>
        </div>

        {/* 3. Potholes (D40) */}
        <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between text-muted">
            <span className="text-xs font-semibold uppercase tracking-wider">Potholes</span>
            <span className="rounded px-1.5 py-0.5 font-mono text-[10px] font-bold text-red-700 bg-red-100">
              D40
            </span>
          </div>
          <p className="mt-3 font-mono text-3xl font-extrabold text-red-600">
            {stats.potholes.toLocaleString()}
          </p>
          <p className="mt-1 text-[11px] text-muted">Critical cavity depressions</p>
        </div>

        {/* 4. Cracks (D00 + D10 + D20) */}
        <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between text-muted">
            <span className="text-xs font-semibold uppercase tracking-wider">Cracks</span>
            <span className="rounded px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-700 bg-amber-100">
              D00·D10·D20
            </span>
          </div>
          <p className="mt-3 font-mono text-3xl font-extrabold text-amber-600">
            {stats.cracks.toLocaleString()}
          </p>
          <p className="mt-1 text-[11px] text-muted">Fissures & alligator networks</p>
        </div>

        {/* 5. Average Inference Time */}
        <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between text-muted">
            <span className="text-xs font-semibold uppercase tracking-wider">Avg Inference Time</span>
            <div className="flex size-7 items-center justify-center rounded-md bg-green-50 text-green-600">
              <Clock size={14} />
            </div>
          </div>
          <p className="mt-3 font-mono text-3xl font-extrabold text-ink">
            {stats.avg_inference_time_ms} <span className="text-base font-normal text-muted">ms</span>
          </p>
          <p className="mt-1 text-[11px] text-muted">Dual-scale WBF latency / frame</p>
        </div>
      </section>

      {/* ── Row 2: Damage Distribution (Left) & Damage Hotspots (Right) ────────── */}
      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">

        {/* 1. Damage Distribution Chart */}
        <div className="flex flex-col rounded-2xl border border-line bg-surface p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-line pb-4">
            <div>
              <h2 className="text-base font-bold text-ink">Damage Distribution</h2>
              <p className="text-xs text-muted">Class-wise breakdown of all recorded pavement distress</p>
            </div>
            <span className="font-mono text-xs font-semibold text-muted">
              {stats.damages_detected.toLocaleString()} objects
            </span>
          </div>

          {/* Segmented Visual Stacked Bar */}
          <div className="mt-6">
            <div className="flex h-4 w-full overflow-hidden rounded-md bg-canvas">
              {(["D00", "D10", "D20", "D40"] as DamageCode[]).map((code) => {
                const item = dist[code];
                const pct = item ? item.percentage : 0;
                return (
                  <div
                    key={code}
                    style={{ width: `${pct}%`, backgroundColor: CLASS_COLORS[code] }}
                    className="h-full transition-all duration-500 first:rounded-l-md last:rounded-r-md"
                    title={`${code}: ${pct}%`}
                  />
                );
              })}
            </div>

            {/* Segmented legend underneath */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
              {(["D00", "D10", "D20", "D40"] as DamageCode[]).map((code) => {
                const item = dist[code];
                return (
                  <div key={code} className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-sm" style={{ backgroundColor: CLASS_COLORS[code] }} />
                    <span className="font-bold text-ink">{code}</span>
                    <span className="text-muted">({item?.percentage ?? 0}%)</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Detailed Class Metric Rows */}
          <div className="mt-6 space-y-3 flex-1">
            {(["D00", "D10", "D20", "D40"] as DamageCode[]).map((code) => {
              const item = dist[code];
              if (!item) return null;
              const color = CLASS_COLORS[code];
              return (
                <div key={code} className="rounded-xl border border-line bg-canvas/50 p-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="size-3 rounded-sm shrink-0" style={{ backgroundColor: color }} />
                      <div>
                        <span className="font-mono text-xs font-bold text-ink">{item.code}</span>
                        <span className="ml-2 font-sans text-xs font-medium text-body">{item.label}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold" style={{ backgroundColor: `${color}18`, color }}>
                        {item.severity}
                      </span>
                      <span className="font-mono text-xs font-bold text-ink w-14 text-right">
                        {item.count.toLocaleString()}
                      </span>
                      <span className="font-mono text-xs text-muted w-12 text-right">
                        {item.percentage}%
                      </span>
                    </div>
                  </div>

                  {/* Individual class bar */}
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${item.percentage}%`, backgroundColor: color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 2. Damage Hotspots */}
        <div className="flex flex-col rounded-2xl border border-line bg-surface p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-line pb-4">
            <div>
              <h2 className="text-base font-bold text-ink">Damage Hotspots</h2>
              <p className="text-xs text-muted">Corridors with clustered pavement distress reports</p>
            </div>
            <Link to="/map" className="btn btn-ghost text-xs font-mono p-1.5 text-primary flex items-center gap-1">
              <MapPinned size={14} /> View Map
            </Link>
          </div>

          <div className="mt-4 space-y-3 flex-1 overflow-y-auto max-h-[440px] pr-1">
            {stats.damage_hotspots.map((spot) => {
              const primaryColor = CLASS_COLORS[spot.primary_damage] || "#2457f5";
              const { color: rhiCol } = rhiLabel(spot.avg_rhi);

              return (
                <div
                  key={spot.id}
                  className="rounded-xl border border-line bg-canvas/40 p-3.5 hover:border-primary/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-ink truncate">{spot.location_name}</h4>
                      <p className="text-[11px] text-muted truncate mt-0.5">{spot.corridor}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ${
                        spot.severity_tier === "Critical"
                          ? "bg-red-100 text-red-700"
                          : spot.severity_tier === "High"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {spot.severity_tier}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-between pt-2 border-t border-line/60 font-mono text-xs">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1 text-muted text-[11px]">
                        <span className="size-2 rounded-sm" style={{ backgroundColor: primaryColor }} />
                        Primary: <b className="text-ink">{spot.primary_damage}</b>
                      </span>
                      <span className="text-muted text-[11px]">
                        Incidents: <b className="text-ink">{spot.incident_count}</b>
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted">RHI:</span>
                      <span className="font-bold" style={{ color: rhiCol }}>{spot.avg_rhi}</span>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-muted">
                    <span>{spot.city}, {spot.country}</span>
                    <span className="font-semibold text-ink/70">{spot.status}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </section>

      {/* ── Row 3: Recent Inspections Table (Latest Uploaded Images) ─────────── */}
      <section className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-line pb-4">
          <div>
            <h2 className="text-base font-bold text-ink">Recent Inspections</h2>
            <p className="text-xs text-muted">Latest analyzed pavement frames recorded into database</p>
          </div>
          <span className="font-mono text-xs text-muted">
            Showing latest {stats.recent_inspections.length} frames
          </span>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-canvas font-mono text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Frame</th>
                <th className="px-4 py-3">Image ID / Location</th>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Distress Detections</th>
                <th className="px-4 py-3 text-right">RHI</th>
                <th className="px-4 py-3 text-right">Latency</th>
                <th className="px-4 py-3 text-center">Type</th>
                <th className="px-4 py-3 text-center">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line font-mono text-xs">
              {stats.recent_inspections.map((row) => {
                const { color: rhiColor, label: rhiLbl } = rhiLabel(row.rhi);
                return (
                  <tr key={row.id} className="hover:bg-canvas/50">
                    <td className="px-4 py-2.5">
                      <img
                        src={row.thumbnail_url}
                        alt=""
                        className="size-10 rounded object-cover border border-line"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = "/samples/img_000012.jpg";
                        }}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="font-bold text-ink truncate max-w-[220px]">{row.image_id}</p>
                      <p className="font-sans text-[11px] text-muted truncate max-w-[220px]">{row.location_name}</p>
                    </td>
                    <td className="px-4 py-2.5 text-muted">{row.timestamp}</td>
                    <td className="px-4 py-2.5">
                      {row.total_detections > 0 ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {row.d00_count > 0 && (
                            <span className="rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ backgroundColor: `${CLASS_COLORS.D00}18`, color: CLASS_COLORS.D00 }}>
                              D00:{row.d00_count}
                            </span>
                          )}
                          {row.d10_count > 0 && (
                            <span className="rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ backgroundColor: `${CLASS_COLORS.D10}18`, color: CLASS_COLORS.D10 }}>
                              D10:{row.d10_count}
                            </span>
                          )}
                          {row.d20_count > 0 && (
                            <span className="rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ backgroundColor: `${CLASS_COLORS.D20}18`, color: CLASS_COLORS.D20 }}>
                              D20:{row.d20_count}
                            </span>
                          )}
                          {row.d40_count > 0 && (
                            <span className="rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ backgroundColor: `${CLASS_COLORS.D40}18`, color: CLASS_COLORS.D40 }}>
                              D40:{row.d40_count}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted italic">none (undamaged)</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="font-bold" style={{ color: rhiColor }}>{row.rhi}</span>
                      <span className="text-[10px] text-muted block">{rhiLbl}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-muted">{row.latency_ms.toFixed(1)} ms</td>
                    <td className="px-4 py-2.5 text-center">
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          row.is_demo === 1
                            ? "bg-amber-100 text-amber-800"
                            : "bg-green-100 text-green-800"
                        }`}
                      >
                        {row.is_demo === 1 ? "Sample Seed" : "Live Run"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <button
                        onClick={() => setSelectedInspection(row)}
                        className="btn btn-ghost text-xs p-1 text-primary hover:bg-primary-soft"
                        title="View inspection summary"
                      >
                        <Eye size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Inspection Detail Modal ─────────────────────────────────────────── */}
      {selectedInspection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="relative max-h-[90vh] w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface p-6 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h3 className="font-mono text-sm font-bold text-ink">{selectedInspection.image_id}</h3>
                <p className="text-xs text-muted">{selectedInspection.location_name} · {selectedInspection.timestamp}</p>
              </div>
              <button
                onClick={() => setSelectedInspection(null)}
                className="btn btn-ghost text-xs"
              >
                Close
              </button>
            </div>

            <div className="mt-4 flex-1 overflow-auto rounded-xl border border-line bg-slate-950 flex items-center justify-center p-2">
              <img
                src={selectedInspection.thumbnail_url}
                alt=""
                className="max-h-[340px] w-full object-contain rounded-lg"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/samples/img_000012.jpg";
                }}
              />
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3 font-mono text-xs pt-3 border-t border-line">
              <div className="rounded-lg bg-canvas p-2.5">
                <span className="text-muted block text-[10px]">Road Health:</span>
                <span className="font-bold text-base text-ink">{selectedInspection.rhi} / 100</span>
              </div>
              <div className="rounded-lg bg-canvas p-2.5">
                <span className="text-muted block text-[10px]">Detections:</span>
                <span className="font-bold text-base text-ink">{selectedInspection.total_detections}</span>
              </div>
              <div className="rounded-lg bg-canvas p-2.5">
                <span className="text-muted block text-[10px]">Latency:</span>
                <span className="font-bold text-base text-ink">{selectedInspection.latency_ms} ms</span>
              </div>
            </div>

            <div className="mt-4 flex justify-between items-center pt-2 text-xs">
              <span className="font-mono text-[11px] text-muted">
                Record Type: <b>{selectedInspection.is_demo === 1 ? "Demonstration Seed Record" : "Live User Run"}</b>
              </span>
              <Link
                to={`/predictions?mode=${selectedInspection.source_mode || "single"}`}
                className="btn btn-primary text-xs"
                onClick={() => setSelectedInspection(null)}
              >
                Inspect in Workspace
              </Link>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
