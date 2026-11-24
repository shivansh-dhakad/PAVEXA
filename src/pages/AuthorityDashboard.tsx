import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, AlertTriangle, CheckCircle2,
  Video, Search, LayoutGrid, Table as TableIcon,
  BarChart2, Eye, Gauge,
  ShieldAlert, MapPinned, ClipboardList, Timer, Wrench
} from "lucide-react";
import PageHeader from "../components/PageHeader";
import { ClassChips, SeverityBadge, StatusPill, fmtDate } from "../components/ComplaintBits";
import {
  CLUSTER_RADIUS_M, HQS, REPEAT_BONUS, STATUS_FLOW, buildHotspots, useComplaints,
  type Complaint, type Hotspot, type Status,
} from "../lib/complaints";
import { DAMAGE_CLASSES } from "../lib/damage";
import { SEVERITY_COLOR, SEVERITY_ORDER, severityRank, type Severity } from "../lib/knowledge";
import { loadLeaflet } from "../lib/leaflet";
import ComplaintInspectionModal from "../components/ComplaintInspectionModal";
import AuthorityAnalytics from "../components/AuthorityAnalytics";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[ch]);

// ── Geographic Damage Concentration Heatmap ───────────────────────────────────
function LocationHeatmap({
  hotspots,
  complaints,
  selectedId,
  onSelect,
  hqId,
}: {
  hotspots: Hotspot[];
  complaints: Complaint[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  hqId: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const layer = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let dead = false;
    loadLeaflet()
      .then((L) => {
        if (dead || !el.current || map.current) return;
        const m = L.map(el.current).setView([12.2958, 76.6394], 12);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '© <a href="https://www.openstreetmap.org">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }).addTo(m);
        layer.current = L.layerGroup().addTo(m);
        map.current = m;
        setReady(true);
      })
      .catch(() => setFailed(true));
    return () => {
      dead = true;
      if (map.current) {
        map.current.remove();
        map.current = null;
        setReady(false);
      }
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const L = window.L;
    layer.current.clearLayers();

    const offices = hqId === "all" ? HQS : HQS.filter((office) => office.id === hqId);
    offices.forEach((office) => {
      L.polygon(office.boundary, { color: "#1b4fd8", weight: 1.5, fillOpacity: 0.035, dashArray: "5 5" }).addTo(layer.current)
        .bindTooltip(`<b>${esc(office.name)}</b><br/>${esc(office.serviceArea)}`);
      L.circleMarker([office.lat, office.lng], { radius: 6, color: "#1b4fd8", fillOpacity: 1 }).addTo(layer.current)
        .bindTooltip(`<b>${esc(office.name)}</b><br/>Administrative office`);
    });
    complaints.forEach((c) => L.circleMarker([c.lat, c.lng], { radius: 4, color: c.status === "Resolved" ? "#16a34a" : "#64748b", weight: 1, fillOpacity: .8 }).addTo(layer.current)
      .bindTooltip(`<b>${esc(c.id)}</b><br/>${esc(c.road)} · ${esc(c.status)}`));

    hotspots.forEach((h) => {
      const n = h.complaints.length;
      const size = 32 + Math.min(n - 1, 4) * 6;
      const color = SEVERITY_COLOR[h.tier];
      const sel = h.id === selectedId;

      const heatRadius = Math.max(80, h.score * 3.5 + n * 25);
      L.circle([h.lat, h.lng], {
        radius: heatRadius,
        color: color,
        weight: sel ? 2.5 : 1.5,
        fillColor: color,
        fillOpacity: sel ? 0.35 : 0.22,
      }).addTo(layer.current);

      const icon = L.divIcon({
        className: "",
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:${
          sel ? 4 : 2.5
        }px solid #fff;box-shadow:0 0 0 ${sel ? 4 : 0}px ${color},0 3px 10px rgba(0,0,0,.4);color:#fff;display:flex;align-items:center;justify-content:center;font:700 12px 'JetBrains Mono',monospace">${n}</div>`,
      });

      L.marker([h.lat, h.lng], { icon })
        .addTo(layer.current)
        .on("click", () => onSelect(sel ? null : h.id))
        .bindTooltip(
          `<b>${esc(h.road)}</b><br/>${n} open complaint${n > 1 ? "s" : ""} · Severity: ${h.tier}<br/>Score: ${h.score}/100`,
          { direction: "top", offset: [0, -size / 2] }
        );
    });
  }, [ready, hotspots, complaints, selectedId, onSelect, hqId]);

  useEffect(() => {
    if (!ready) return;
    const m = map.current;
    const pts = hotspots.map((h) => [h.lat, h.lng]);
    if (pts.length === 0) {
      const hq = HQS.find((h) => h.id === hqId);
      if (hq) m.setView([hq.lat, hq.lng], 11);
    } else if (pts.length === 1) m.setView(pts[0], 15);
    else m.fitBounds(pts, { padding: [40, 40], maxZoom: 15 });
  }, [ready, hqId, hotspots]);

  useEffect(() => {
    if (!ready || !selectedId) return;
    const h = hotspots.find((x) => x.id === selectedId);
    if (h) map.current.flyTo([h.lat, h.lng], Math.max(map.current.getZoom(), 15), { duration: 0.8 });
  }, [selectedId, ready, hotspots]);

  return (
    <div className="isolate overflow-hidden rounded-xl border border-line bg-surface">
      <div ref={el} className="h-[480px] w-full" />
      {failed && (
        <p className="border-t border-line p-3 text-xs text-muted">
          Map needs an internet connection to load OpenStreetMap tiles.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t border-line bg-canvas/40 px-4 py-3 text-xs text-muted">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-ink">Severity:</span>
          {[...SEVERITY_ORDER].reverse().map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: SEVERITY_COLOR[s] }} aria-hidden />
              {s}
            </span>
          ))}
        </div>
        <span>● reports · ◉ offices · dashed boundary</span>
        <span className="font-mono text-xs text-muted">
          Heat radius scaled to distress score (within {CLUSTER_RADIUS_M} m cluster)
        </span>
      </div>
    </div>
  );
}

// ── Dashboard tabs ────────────────────────────────────────────────────────────
type DashboardTab = "overview" | "analytics" | "complaints" | "heatmap";

export default function AuthorityDashboard() {
  const all = useComplaints();

  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");

  const openByHq = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of all) if (c.status !== "Resolved") m[c.hqId] = (m[c.hqId] ?? 0) + 1;
    return m;
  }, [all]);

  const [hqId, setHqId] = useState<string>(() => {
    let best = HQS[0].id;
    for (const h of HQS) if ((openByHq[h.id] ?? 0) > (openByHq[best] ?? 0)) best = h.id;
    return best;
  });

  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | Status>("open");
  const [severityFilter, setSeverityFilter] = useState<"all" | Severity>("all");
  const [sortOrder, setSortOrder] = useState<"severity" | "newest" | "rhi">("severity");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [selHot, setSelHot] = useState<string | null>(null);
  const [inspectionComplaintId, setInspectionComplaintId] = useState<string | null>(null);

  const list = useMemo(() => (hqId === "all" ? all : all.filter((c) => c.hqId === hqId)), [all, hqId]);
  const open = useMemo(() => list.filter((c) => c.status !== "Resolved"), [list]);
  const hotspots = useMemo(() => buildHotspots(open), [open]);
  const selectedHotspot = hotspots.find((h) => h.id === selHot) ?? null;

  const filteredComplaints = useMemo(() => {
    let base = selectedHotspot ? selectedHotspot.complaints : list;
    if (statusFilter === "open") base = base.filter((c) => c.status !== "Resolved");
    else if (statusFilter !== "all") base = base.filter((c) => c.status === statusFilter);
    if (severityFilter !== "all") base = base.filter((c) => c.report.severity === severityFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      base = base.filter(
        (c) =>
          c.road.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q) ||
          c.citizenName.toLowerCase().includes(q) ||
          (c.comment && c.comment.toLowerCase().includes(q))
      );
    }
    return [...base].sort((a, b) => {
      if (sortOrder === "newest") return b.createdAt - a.createdAt;
      if (sortOrder === "rhi") return a.report.rhi - b.report.rhi;
      return severityRank(a.report.severity) - severityRank(b.report.severity) || a.report.rhi - b.report.rhi;
    });
  }, [list, selectedHotspot, statusFilter, severityFilter, searchQuery, sortOrder]);

  const activeComplaint = all.find((c) => c.id === inspectionComplaintId) ?? null;

  const urgentStreetsCount = hotspots.filter((h) => h.tier === "Critical" || h.tier === "High").length;
  const inProgressCount = list.filter((c) => c.status === "In Progress").length;
  const resolvedCount = list.filter((c) => c.status === "Resolved").length;
  const pendingCount = list.filter((c) => c.status === "Submitted").length;
  const awaitingAssignment = list.filter((c) => c.status === "Verified").length;
  const resolutionHours = list.filter((c) => c.status === "Resolved").map((c) => {
    const resolvedAt = [...c.updates].reverse().find((u) => u.status === "Resolved")?.at;
    return resolvedAt ? (resolvedAt - c.createdAt) / 36e5 : 0;
  }).filter(Boolean);
  const averageResolution = resolutionHours.length ? `${Math.round(resolutionHours.reduce((a, b) => a + b, 0) / resolutionHours.length)}h` : "—";

  const hqLabel = HQS.find((h) => h.id === hqId)?.city ?? "All regions";

  const tabCls = (tab: DashboardTab) =>
    `flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-colors ${
      activeTab === tab
        ? "bg-surface text-ink shadow-xs border-l-2 border-primary"
        : "text-muted hover:text-ink"
    }`;

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <PageHeader
        title="Operations command center"
        description="Manage civilian reports, service-area routing, repair work, and area-level road risk."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={hqId}
              onChange={(e) => { setHqId(e.target.value); setSelHot(null); }}
              className="h-9 rounded-lg border border-line bg-surface px-3 text-xs font-medium text-ink outline-none focus:border-primary"
              aria-label="Select Division Headquarters"
            >
              {HQS.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name} ({openByHq[h.id] ?? 0} open)
                </option>
              ))}
              <option value="all">All headquarters</option>
            </select>


          </div>
        }
      />

      {hqId !== "all" && (() => { const office = HQS.find((h) => h.id === hqId); return office ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary-soft/50 px-4 py-3 text-sm">
          <div><span className="font-semibold text-ink">{office.name}</span><span className="text-muted"> · {office.serviceArea}</span></div>
          <span className="text-xs text-muted">Jurisdiction routing active · {office.contact}</span>
        </section>
      ) : null; })()}

      {/* KPI cards */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {[
          {
            label: "Total received",
            value: list.length,
            sub: "All reports in area",
            icon: <ClipboardList size={16} strokeWidth={1.5} className="text-muted" />,
            mono: false,
          },
          {
            label: "Pending",
            value: pendingCount,
            sub: "Newly submitted",
            icon: <Activity size={16} strokeWidth={1.5} className="text-muted" />,
            mono: false,
          },
          {
            label: "Awaiting assignment",
            value: awaitingAssignment,
            sub: "Verified, no crew yet",
            icon: <ShieldAlert size={16} strokeWidth={1.5} className="text-muted" />,
            mono: false,
          },
          {
            label: "Active repairs",
            value: inProgressCount,
            sub: "Crews in the field",
            icon: <Wrench size={16} strokeWidth={1.5} className="text-muted" />,
            mono: false,
          },
          {
            label: "Severe areas",
            value: urgentStreetsCount,
            sub: "Streets with urgent hazards",
            icon: <AlertTriangle size={16} strokeWidth={1.5} className="text-muted" />,
            mono: false,
          },
          {
            label: "Avg. resolution",
            value: averageResolution,
            sub: "Resolved report turnaround",
            icon: <Timer size={16} strokeWidth={1.5} className="text-muted" />,
            mono: false,
          },
          {
            label: "Repairs resolved",
            value: resolvedCount,
            sub: `${inProgressCount} under active repair`,
            icon: <CheckCircle2 size={16} strokeWidth={1.5} className="text-muted" />,
            mono: false,
          },
        ].map(({ label, value, sub, icon }) => (
          <div key={label} className="rounded-xl border border-line bg-surface p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted">{label}</span>
              {icon}
            </div>
            <p className="mt-2 font-mono text-2xl font-bold text-ink tabular-nums">{value}</p>
            <p className="mt-1 text-xs text-muted">{sub}</p>
          </div>
        ))}
      </section>

      {/* Tab switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-line bg-canvas p-1">
          <button onClick={() => setActiveTab("overview")} className={tabCls("overview")}>
            <Gauge size={14} strokeWidth={1.5} /> Overview
          </button>
          <button onClick={() => setActiveTab("analytics")} className={tabCls("analytics")}>
            <BarChart2 size={14} strokeWidth={1.5} /> Analysis
          </button>
          <button onClick={() => setActiveTab("complaints")} className={tabCls("complaints")}>
            <ShieldAlert size={14} strokeWidth={1.5} /> Complaints
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary tabular-nums">
              {open.length}
            </span>
          </button>
          <button onClick={() => setActiveTab("heatmap")} className={tabCls("heatmap")}>
            <MapPinned size={14} strokeWidth={1.5} /> Heatmap
          </button>
        </div>

        <span className="hidden sm:block font-mono text-xs text-muted">
          {hqLabel}
        </span>
      </div>

      {/* ── VIEW: OVERVIEW ──────────────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <div className="space-y-10">
          <section className="space-y-4">
            <AuthorityAnalytics complaints={list} onOpenComplaint={(id) => setInspectionComplaintId(id)} />
          </section>

          <section className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-ink">Geographic concentration</h3>
              <p className="text-xs text-muted mt-0.5">
                Distress clusters across {HQS.find((h) => h.id === hqId)?.name ?? "all divisions"}.
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
              <LocationHeatmap hotspots={hotspots} complaints={list} selectedId={selHot} onSelect={setSelHot} hqId={hqId} />

              <div className="flex max-h-[520px] flex-col rounded-xl border border-line bg-surface">
                <div className="border-b border-line p-4">
                  <h4 className="text-xs font-semibold text-ink">Streets by distress score</h4>
                  <p className="mt-1 text-xs text-muted">
                    Worst report + {REPEAT_BONUS} per repeat within {CLUSTER_RADIUS_M} m.
                  </p>
                </div>
                <ul className="flex-1 divide-y divide-line overflow-y-auto">
                  {hotspots.length === 0 ? (
                    <li className="p-6 text-center text-xs text-muted">No open complaints in this division.</li>
                  ) : (
                    hotspots.map((h, i) => (
                      <li key={h.id}>
                        <button
                          onClick={() => setSelHot(selHot === h.id ? null : h.id)}
                          className={`flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-canvas ${
                            selHot === h.id ? "border-l-2 border-primary bg-canvas" : ""
                          }`}
                        >
                          <span className="font-mono text-xs text-muted tabular-nums">{i + 1}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-semibold text-ink">{h.road}</span>
                            <span className="mt-0.5 block text-xs text-muted">
                              {h.complaints.length} report{h.complaints.length > 1 ? "s" : ""} · {DAMAGE_CLASSES[h.dominant].label}
                            </span>
                          </span>
                          <span className="flex flex-col items-end gap-1">
                            <SeverityBadge severity={h.tier} />
                            <span className="font-mono text-[10px] text-muted tabular-nums">score {h.score}</span>
                          </span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <ComplaintsSectionView
              complaints={filteredComplaints}
              allListCount={list.length}
              selectedHotspot={selectedHotspot}
              onClearHotspot={() => setSelHot(null)}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              severityFilter={severityFilter}
              onSeverityFilterChange={setSeverityFilter}
              sortOrder={sortOrder}
              onSortOrderChange={setSortOrder}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              onInspect={(c) => setInspectionComplaintId(c.id)}
            />
          </section>
        </div>
      )}

      {/* ── VIEW: ANALYSIS ──────────────────────────────────────────────────── */}
      {activeTab === "analytics" && (
        <section className="space-y-6">
          <AuthorityAnalytics complaints={list} onOpenComplaint={(id) => setInspectionComplaintId(id)} />
        </section>
      )}

      {/* ── VIEW: COMPLAINTS ────────────────────────────────────────────────── */}
      {activeTab === "complaints" && (
        <section className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
            <div>
              <h2 className="text-base font-semibold text-ink">Citizen complaints</h2>
              <p className="text-xs text-muted mt-0.5">
                AI bounding-box overlays, zoom/pan controls, class toggles, and status workflow.
              </p>
            </div>
            <span className="font-mono text-xs text-muted tabular-nums">
              {filteredComplaints.length} matching
            </span>
          </div>

          <ComplaintsSectionView
            complaints={filteredComplaints}
            allListCount={list.length}
            selectedHotspot={selectedHotspot}
            onClearHotspot={() => setSelHot(null)}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            severityFilter={severityFilter}
            onSeverityFilterChange={setSeverityFilter}
            sortOrder={sortOrder}
            onSortOrderChange={setSortOrder}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onInspect={(c) => setInspectionComplaintId(c.id)}
          />
        </section>
      )}

      {/* ── VIEW: HEATMAP ───────────────────────────────────────────────────── */}
      {activeTab === "heatmap" && (
        <section className="space-y-6">
          <div>
            <h2 className="text-base font-semibold text-ink">Geographic concentration</h2>
            <p className="text-xs text-muted mt-0.5">
              Heat radius mapped from GPS records and repeat complaint densities.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.8fr_1fr]">
            <LocationHeatmap hotspots={hotspots} complaints={list} selectedId={selHot} onSelect={setSelHot} hqId={hqId} />

            <div className="flex max-h-[540px] flex-col rounded-xl border border-line bg-surface">
              <div className="border-b border-line p-4">
                <h3 className="text-xs font-semibold text-ink">Recorded hotspots</h3>
                <p className="mt-1 text-xs text-muted">
                  Click any corridor to centre the map and filter complaints.
                </p>
              </div>
              <ul className="flex-1 divide-y divide-line overflow-y-auto">
                {hotspots.map((h, i) => (
                  <li key={h.id}>
                    <button
                      onClick={() => setSelHot(selHot === h.id ? null : h.id)}
                      className={`flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-canvas ${
                        selHot === h.id ? "border-l-2 border-primary bg-canvas" : ""
                      }`}
                    >
                      <span className="font-mono text-xs text-muted tabular-nums">{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-ink">{h.road}</span>
                        <span className="mt-0.5 block font-mono text-[11px] text-muted tabular-nums">
                          {h.lat.toFixed(4)}, {h.lng.toFixed(4)}
                        </span>
                        <span className="block text-xs text-muted mt-0.5">
                          {h.complaints.length} open report{h.complaints.length > 1 ? "s" : ""} · {DAMAGE_CLASSES[h.dominant].label}
                        </span>
                      </span>
                      <div className="flex flex-col items-end gap-1">
                        <SeverityBadge severity={h.tier} />
                        <span className="font-mono text-[10px] text-muted tabular-nums">Score {h.score}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* Inspection modal */}
      {activeComplaint && (
        <ComplaintInspectionModal
          complaint={activeComplaint}
          onClose={() => setInspectionComplaintId(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPLAINTS SECTION SUB-COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
interface ComplaintsSectionViewProps {
  complaints: Complaint[];
  allListCount: number;
  selectedHotspot: Hotspot | null;
  onClearHotspot: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  statusFilter: "all" | "open" | Status;
  onStatusFilterChange: (s: "all" | "open" | Status) => void;
  severityFilter: "all" | Severity;
  onSeverityFilterChange: (s: "all" | Severity) => void;
  sortOrder: "severity" | "newest" | "rhi";
  onSortOrderChange: (s: "severity" | "newest" | "rhi") => void;
  viewMode: "grid" | "table";
  onViewModeChange: (m: "grid" | "table") => void;
  onInspect: (c: Complaint) => void;
}

function ComplaintsSectionView({
  complaints,
  allListCount,
  selectedHotspot,
  onClearHotspot,
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  severityFilter,
  onSeverityFilterChange,
  sortOrder,
  onSortOrderChange,
  viewMode,
  onViewModeChange,
  onInspect,
}: ComplaintsSectionViewProps) {
  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search size={14} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder={`Search ${allListCount} complaints by street, citizen, or ID…`}
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full rounded-md border border-line bg-canvas pl-9 pr-3 py-1.5 text-xs text-ink outline-none focus:border-primary placeholder:text-muted"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Status pills */}
            <div className="flex items-center rounded-md border border-line bg-canvas p-0.5 text-xs">
              <button
                onClick={() => onStatusFilterChange("open")}
                className={`rounded px-2.5 py-1 font-medium transition-colors ${
                  statusFilter === "open" ? "bg-surface text-ink shadow-xs" : "text-muted hover:text-ink"
                }`}
              >
                Open
              </button>
              <button
                onClick={() => onStatusFilterChange("all")}
                className={`rounded px-2.5 py-1 font-medium transition-colors ${
                  statusFilter === "all" ? "bg-surface text-ink shadow-xs" : "text-muted hover:text-ink"
                }`}
              >
                All
              </button>
              {STATUS_FLOW.map((st) => (
                <button
                  key={st}
                  onClick={() => onStatusFilterChange(st)}
                  className={`hidden sm:inline-block rounded px-2 py-1 font-medium transition-colors ${
                    statusFilter === st ? "bg-surface text-ink shadow-xs" : "text-muted hover:text-ink"
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            {/* Severity */}
            <select
              value={severityFilter}
              onChange={(e) => onSeverityFilterChange(e.target.value as any)}
              className="rounded-md border border-line bg-canvas px-2.5 py-1.5 text-xs font-medium text-ink outline-none focus:border-primary"
            >
              <option value="all">All severities</option>
              {SEVERITY_ORDER.map((sev) => (
                <option key={sev} value={sev}>{sev}</option>
              ))}
            </select>

            {/* Sort */}
            <select
              value={sortOrder}
              onChange={(e) => onSortOrderChange(e.target.value as any)}
              className="rounded-md border border-line bg-canvas px-2.5 py-1.5 text-xs font-medium text-ink outline-none focus:border-primary"
            >
              <option value="severity">Most severe first</option>
              <option value="newest">Newest first</option>
              <option value="rhi">Lowest RHI first</option>
            </select>

            {/* View toggle */}
            <div className="flex items-center rounded-md border border-line bg-canvas p-0.5">
              <button
                onClick={() => onViewModeChange("grid")}
                className={`p-1.5 rounded transition-colors ${
                  viewMode === "grid" ? "bg-surface text-ink shadow-xs" : "text-muted hover:text-ink"
                }`}
                title="Grid view"
              >
                <LayoutGrid size={14} strokeWidth={1.5} />
              </button>
              <button
                onClick={() => onViewModeChange("table")}
                className={`p-1.5 rounded transition-colors ${
                  viewMode === "table" ? "bg-surface text-ink shadow-xs" : "text-muted hover:text-ink"
                }`}
                title="Table view"
              >
                <TableIcon size={14} strokeWidth={1.5} />
              </button>
            </div>
          </div>
        </div>

        {selectedHotspot && (
          <div className="flex items-center justify-between rounded-lg border border-line bg-canvas px-3 py-1.5 text-xs">
            <span className="text-muted">
              Filtered to cluster: <b className="text-ink">{selectedHotspot.road}</b>
            </span>
            <button onClick={onClearHotspot} className="font-medium text-primary hover:underline">
              Show all
            </button>
          </div>
        )}
      </div>

      {/* Complaints list */}
      {complaints.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface p-12 text-center text-xs text-muted">
          No complaints match the selected filters.
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {complaints.map((c) => (
            <div
              key={c.id}
              onClick={() => onInspect(c)}
              className="group overflow-hidden rounded-xl border border-line bg-surface cursor-pointer flex flex-col justify-between transition-colors hover:border-primary/40"
            >
              <div>
                <div className="relative aspect-video w-full overflow-hidden bg-slate-950">
                  <img
                    src={c.thumb}
                    alt={c.road}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <span className="absolute left-2.5 top-2.5">
                    <SeverityBadge severity={c.report.severity} />
                  </span>
                  {c.mediaKind === "video" && (
                    <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[10px] text-white">
                      <Video size={10} /> clip
                    </span>
                  )}
                  <span className="absolute bottom-2.5 right-2.5 rounded bg-black/75 px-2 py-0.5 font-mono text-xs font-bold text-white tabular-nums">
                    RHI {c.report.rhi}
                  </span>
                </div>

                <div className="space-y-2.5 p-4">
                  <div>
                    <p className="font-mono text-[10px] font-semibold text-primary">{c.id}</p>
                    <h4 className="text-sm font-semibold text-ink truncate">{c.road}</h4>
                    <p className="text-xs text-muted">
                      {fmtDate(c.createdAt)} · <span className="text-ink">{c.citizenName}</span>
                    </p>
                  </div>
                  <ClassChips counts={c.report.counts} />
                  {c.comment && (
                    <p className="line-clamp-2 text-xs text-muted italic">"{c.comment}"</p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-line bg-canvas/40 px-4 py-2.5 text-xs">
                <StatusPill status={c.status} />
                <span className="flex items-center gap-1 font-medium text-primary transition-transform group-hover:translate-x-0.5">
                  <Eye size={13} strokeWidth={1.5} /> Inspect
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-line bg-canvas/60 font-mono text-muted">
              <tr>
                <th className="py-3 px-4">ID</th>
                <th className="py-3 px-4">Street</th>
                <th className="py-3 px-4">RHI</th>
                <th className="py-3 px-4">Severity</th>
                <th className="py-3 px-4">Classes</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Reported</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {complaints.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => onInspect(c)}
                  className="hover:bg-canvas/50 cursor-pointer transition-colors"
                >
                  <td className="py-3 px-4 font-mono font-semibold text-primary">{c.id}</td>
                  <td className="py-3 px-4">
                    <span className="font-semibold text-ink block">{c.road}</span>
                    <span className="text-muted">By {c.citizenName}</span>
                  </td>
                  <td className="py-3 px-4 font-mono font-semibold text-ink tabular-nums">{c.report.rhi}/100</td>
                  <td className="py-3 px-4"><SeverityBadge severity={c.report.severity} /></td>
                  <td className="py-3 px-4"><ClassChips counts={c.report.counts} /></td>
                  <td className="py-3 px-4"><StatusPill status={c.status} /></td>
                  <td className="py-3 px-4 font-mono text-muted tabular-nums">{fmtDate(c.createdAt)}</td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={(e) => { e.stopPropagation(); onInspect(c); }}
                      className="btn btn-ghost p-1 text-muted hover:text-primary"
                      title="Inspect detections"
                    >
                      <Eye size={14} strokeWidth={1.5} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
