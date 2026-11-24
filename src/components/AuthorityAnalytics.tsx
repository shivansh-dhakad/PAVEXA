import { useMemo, useState } from "react";
import { Eye } from "lucide-react";
import { CLASS_COLORS, DAMAGE_CLASSES, type DamageCode, type Detection } from "../lib/damage";
import { type Complaint } from "../lib/complaints";
import { SeverityBadge, fmtDate } from "./ComplaintBits";

interface AuthorityAnalyticsProps {
  complaints: Complaint[];
  onOpenComplaint: (id: string) => void;
}

type AnalysisSection = "all" | "class" | "confidence" | "frequency" | "comparison" | "density" | "severity";

const SECTION_TABS: { id: AnalysisSection; label: string }[] = [
  { id: "all", label: "All" },
  { id: "class", label: "Class distribution" },
  { id: "confidence", label: "Confidence" },
  { id: "frequency", label: "Trends" },
  { id: "comparison", label: "Compare" },
  { id: "density", label: "Density" },
  { id: "severity", label: "Severity" },
];

export default function AuthorityAnalytics({ complaints, onOpenComplaint }: AuthorityAnalyticsProps) {
  const [activeSection, setActiveSection] = useState<AnalysisSection>("all");
  const [compAId, setCompAId] = useState<string>(() => complaints[0]?.id || "");
  const [compBId, setCompBId] = useState<string>(() => complaints[1]?.id || complaints[0]?.id || "");
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(0.2);

  // All detections across complaints
  const allDetections = useMemo(() => {
    const list: (Detection & { complaintId: string; road: string; createdAt: number })[] = [];
    complaints.forEach((c) => {
      (c.report.detections || []).forEach((d) => {
        list.push({ ...d, complaintId: c.id, road: c.road, createdAt: c.createdAt });
      });
    });
    return list;
  }, [complaints]);

  const classCounts = useMemo(() => {
    const counts: Record<DamageCode, number> = { D00: 0, D10: 0, D20: 0, D40: 0 };
    allDetections.forEach((d) => {
      counts[d.code] = (counts[d.code] ?? 0) + 1;
    });
    return counts;
  }, [allDetections]);

  const totalDetections = allDetections.length;

  // ── 1. CLASS DISTRIBUTION ────────────────────────────────────────────────────
  const donutRadius = 60;
  const circumference = 2 * Math.PI * donutRadius;
  let cumulativePct = 0;

  const donutSegments = (["D00", "D10", "D20", "D40"] as DamageCode[]).map((code) => {
    const count = classCounts[code] || 0;
    const pct = totalDetections > 0 ? count / totalDetections : 0;
    const strokeDasharray = `${pct * circumference} ${circumference}`;
    const strokeDashoffset = -cumulativePct * circumference;
    cumulativePct += pct;
    return {
      code,
      label: DAMAGE_CLASSES[code].label,
      color: CLASS_COLORS[code],
      count,
      pct: Math.round(pct * 100),
      strokeDasharray,
      strokeDashoffset,
    };
  });

  const maxClassCount = Math.max(...Object.values(classCounts), 1);

  // ── 2. CONFIDENCE DISTRIBUTION ───────────────────────────────────────────────
  const confidenceBins = useMemo(() => {
    const bins = [
      { range: "20–35%", label: "Edge", min: 0.2, max: 0.35, count: 0 },
      { range: "35–50%", label: "Moderate", min: 0.35, max: 0.5, count: 0 },
      { range: "50–65%", label: "Confident", min: 0.5, max: 0.65, count: 0 },
      { range: "65–80%", label: "High", min: 0.65, max: 0.8, count: 0 },
      { range: "80–100%", label: "Certain", min: 0.8, max: 1.01, count: 0 },
    ];
    allDetections.forEach((d) => {
      for (const b of bins) {
        if (d.confidence >= b.min && d.confidence < b.max) { b.count++; break; }
      }
    });
    return bins;
  }, [allDetections]);

  const maxBinCount = Math.max(...confidenceBins.map((b) => b.count), 1);

  const avgConfidence = useMemo(() => {
    if (totalDetections === 0) return 0;
    return (allDetections.reduce((acc, d) => acc + d.confidence, 0) / totalDetections) * 100;
  }, [allDetections, totalDetections]);

  const highConfCount = useMemo(
    () => allDetections.filter((d) => d.confidence >= 0.75).length,
    [allDetections]
  );

  // ── 3. DAMAGE FREQUENCY (Trend line) ────────────────────────────────────────
  const trendPoints = useMemo(() => {
    const sorted = [...complaints].sort((a, b) => a.createdAt - b.createdAt);
    return sorted.map((c, i) => ({
      idx: i,
      id: c.id,
      road: c.road,
      date: fmtDate(c.createdAt),
      detections: c.report.detections?.length || 0,
      rhi: c.report.rhi,
    }));
  }, [complaints]);

  const maxTrendDets = Math.max(...trendPoints.map((p) => p.detections), 10);

  const chartW = 600;
  const chartH = 180;
  const padX = 40;
  const padY = 20;
  const innerW = chartW - padX * 2;
  const innerH = chartH - padY * 2;

  const lineCoords = useMemo(() => {
    if (trendPoints.length === 0) return { pathDets: "", pathRhi: "", points: [] };
    const stepX = trendPoints.length > 1 ? innerW / (trendPoints.length - 1) : innerW / 2;
    const points = trendPoints.map((pt, i) => {
      const x = padX + i * stepX;
      const yDets = padY + innerH - (pt.detections / maxTrendDets) * innerH;
      const yRhi = padY + innerH - (pt.rhi / 100) * innerH;
      return { ...pt, x, yDets, yRhi };
    });
    const pathDets = points.reduce((acc, p, i) => `${acc} ${i === 0 ? "M" : "L"} ${p.x} ${p.yDets}`, "");
    const pathRhi = points.reduce((acc, p, i) => `${acc} ${i === 0 ? "M" : "L"} ${p.x} ${p.yRhi}`, "");
    return { pathDets, pathRhi, points };
  }, [trendPoints, innerW, innerH, maxTrendDets]);

  // ── 4. INSPECTION COMPARISON ─────────────────────────────────────────────────
  const inspectionA = useMemo(
    () => complaints.find((c) => c.id === compAId) || complaints[0] || null,
    [complaints, compAId]
  );
  const inspectionB = useMemo(
    () => complaints.find((c) => c.id === compBId) || complaints[1] || complaints[0] || null,
    [complaints, compBId]
  );

  const comparisonDeltas = useMemo(() => {
    if (!inspectionA || !inspectionB) return null;
    const rhiDelta = inspectionB.report.rhi - inspectionA.report.rhi;
    const detDelta = (inspectionB.report.detections?.length || 0) - (inspectionA.report.detections?.length || 0);
    const classDeltas: Record<DamageCode, { a: number; b: number; diff: number }> = {
      D00: { a: inspectionA.report.counts.D00 || 0, b: inspectionB.report.counts.D00 || 0, diff: (inspectionB.report.counts.D00 || 0) - (inspectionA.report.counts.D00 || 0) },
      D10: { a: inspectionA.report.counts.D10 || 0, b: inspectionB.report.counts.D10 || 0, diff: (inspectionB.report.counts.D10 || 0) - (inspectionA.report.counts.D10 || 0) },
      D20: { a: inspectionA.report.counts.D20 || 0, b: inspectionB.report.counts.D20 || 0, diff: (inspectionB.report.counts.D20 || 0) - (inspectionA.report.counts.D20 || 0) },
      D40: { a: inspectionA.report.counts.D40 || 0, b: inspectionB.report.counts.D40 || 0, diff: (inspectionB.report.counts.D40 || 0) - (inspectionA.report.counts.D40 || 0) },
    };
    return { rhiDelta, detDelta, classDeltas };
  }, [inspectionA, inspectionB]);

  // ── 5. DAMAGE DENSITY ────────────────────────────────────────────────────────
  const densityMetrics = useMemo(() => {
    const megapixelsPerFrame = 2.0736;
    const totalFrames = Math.max(1, complaints.length);
    const totalMegapixels = totalFrames * megapixelsPerFrame;
    const detectionsPerMp = totalDetections / totalMegapixels;

    let totalDistressedAreaNorm = 0;
    allDetections.forEach((d) => {
      totalDistressedAreaNorm += (d.x2 - d.x1) * (d.y2 - d.y1);
    });
    const avgDistressedAreaPct = totalFrames > 0 ? (totalDistressedAreaNorm / totalFrames) * 100 : 0;

    const spatialGrid = Array.from({ length: 9 }, (_, idx) => {
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      const colName = col === 0 ? "Left wheelpath" : col === 1 ? "Centre lane" : "Right shoulder";
      const rowName = row === 0 ? "Far field" : row === 1 ? "Mid pavement" : "Near wheelpath";
      return { id: idx, col, row, label: `${colName} · ${rowName}`, count: 0 };
    });

    allDetections.forEach((d) => {
      const cx = (d.x1 + d.x2) / 2;
      const cy = (d.y1 + d.y2) / 2;
      const col = Math.min(2, Math.floor(cx * 3));
      const row = Math.min(2, Math.floor(cy * 3));
      const idx = row * 3 + col;
      if (spatialGrid[idx]) spatialGrid[idx].count++;
    });

    return {
      totalMegapixels,
      detectionsPerMp: detectionsPerMp.toFixed(2),
      avgDistressedAreaPct: avgDistressedAreaPct.toFixed(2),
      spatialGrid,
      densityRating: detectionsPerMp > 4.5 ? "High density" : detectionsPerMp > 2.0 ? "Moderate density" : "Low density",
    };
  }, [complaints, allDetections, totalDetections]);

  // ── 6. SEVERITY DISTRIBUTION ─────────────────────────────────────────────────
  const severityDistribution = useMemo(() => {
    let low = 0, medium = 0, high = 0;
    allDetections.forEach((d) => {
      if (d.code === "D40" || (d.code === "D20" && d.confidence >= 0.6)) high++;
      else if (d.code === "D20" || (d.code === "D10" && d.confidence >= 0.5)) medium++;
      else low++;
    });
    const total = Math.max(1, totalDetections);
    return {
      high: { count: high, pct: Math.round((high / total) * 100) },
      medium: { count: medium, pct: Math.round((medium / total) * 100) },
      low: { count: low, pct: Math.round((low / total) * 100) },
    };
  }, [allDetections, totalDetections]);

  const show = (id: AnalysisSection) => activeSection === "all" || activeSection === id;

  return (
    <div className="space-y-6">
      {/* Sub-nav */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div>
          <h2 className="text-base font-semibold text-ink">Damage analysis</h2>
          <p className="text-xs text-muted mt-0.5">
            Detections, confidence, inspection trends, density, and severity.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-line bg-canvas p-1">
          {SECTION_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activeSection === tab.id
                  ? "bg-surface text-ink shadow-xs border-l-2 border-primary"
                  : "text-muted hover:text-ink"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── SECTION 1: CLASS DISTRIBUTION ───────────────────────────────────── */}
      {show("class") && (
        <section className="rounded-xl border border-line bg-surface p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-line pb-4">
            <div>
              <h3 className="text-sm font-semibold text-ink">Class distribution</h3>
              <p className="text-xs text-muted mt-0.5">
                Detections per damage class (RDD2020 standard).
              </p>
            </div>
            <span className="font-mono text-xs text-muted tabular-nums">
              {totalDetections} total detections
            </span>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Donut chart */}
            <div className="flex flex-col items-center justify-center rounded-lg border border-line bg-canvas/40 p-6">
              <div className="relative flex items-center justify-center">
                <svg className="size-44 -rotate-90" viewBox="0 0 160 160">
                  <circle cx="80" cy="80" r={donutRadius} className="stroke-line fill-none" strokeWidth="20" />
                  {donutSegments.map((seg) => (
                    <circle
                      key={seg.code}
                      cx="80"
                      cy="80"
                      r={donutRadius}
                      fill="none"
                      stroke={seg.color}
                      strokeWidth="20"
                      strokeDasharray={seg.strokeDasharray}
                      strokeDashoffset={seg.strokeDashoffset}
                      className="transition-opacity duration-300 hover:opacity-80"
                    />
                  ))}
                </svg>
                <div className="absolute flex flex-col items-center text-center">
                  <span className="font-mono text-2xl font-bold text-ink tabular-nums">{totalDetections}</span>
                  <span className="text-xs text-muted">detections</span>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2.5 w-full max-w-xs">
                {donutSegments.map((seg) => (
                  <div key={seg.code} className="flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-1.5">
                      <span className="size-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: seg.color }} />
                      <span className="font-semibold text-ink">{seg.code}</span>
                    </div>
                    <span className="tabular-nums text-muted">
                      {seg.count} <span className="text-muted">({seg.pct}%)</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bar chart */}
            <div className="flex flex-col justify-center rounded-lg border border-line bg-canvas/40 p-6 space-y-4">
              {(["D00", "D10", "D20", "D40"] as DamageCode[]).map((code) => {
                const count = classCounts[code] || 0;
                const pct = totalDetections > 0 ? ((count / totalDetections) * 100).toFixed(1) : "0";
                const widthPct = Math.max(3, Math.round((count / maxClassCount) * 100));
                const color = CLASS_COLORS[code];
                const meta = DAMAGE_CLASSES[code];

                return (
                  <div key={code} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="flex items-center gap-2 font-semibold text-ink">
                        <span
                          className="rounded px-1.5 py-0.5 font-bold text-white text-[10px]"
                          style={{ backgroundColor: color }}
                        >
                          {code}
                        </span>
                        {meta.label}
                      </span>
                      <span className="tabular-nums text-muted">{count} ({pct}%)</span>
                    </div>
                    <div className="h-4 w-full overflow-hidden rounded bg-line/60">
                      <div
                        className="h-full rounded transition-[width] duration-500"
                        style={{ width: `${widthPct}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── SECTION 2: CONFIDENCE DISTRIBUTION ──────────────────────────────── */}
      {show("confidence") && (
        <section className="rounded-xl border border-line bg-surface p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-line pb-4">
            <div>
              <h3 className="text-sm font-semibold text-ink">Confidence distribution</h3>
              <p className="text-xs text-muted mt-0.5">
                AI inference confidence scores across all detections.
              </p>
            </div>
            <div className="flex items-center gap-4 font-mono text-xs">
              <div>
                <span className="text-muted block text-[11px]">Average</span>
                <span className="font-semibold text-ink tabular-nums">{avgConfidence.toFixed(1)}%</span>
              </div>
              <div className="border-l border-line pl-4">
                <span className="text-muted block text-[11px]">High conf (≥75%)</span>
                <span className="font-semibold text-ink tabular-nums">{highConfCount}</span>
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Histogram */}
            <div className="lg:col-span-2 rounded-lg border border-line bg-canvas/40 p-5 flex flex-col gap-4">
              <div className="grid grid-cols-5 items-end gap-2 h-44 border-b border-line pb-2">
                {confidenceBins.map((bin, i) => {
                  const heightPct = Math.max(6, Math.round((bin.count / maxBinCount) * 100));
                  // Single-hue ramp from muted to primary
                  const opacity = 0.35 + (i / 4) * 0.65;
                  return (
                    <div key={bin.range} className="flex flex-col items-center h-full justify-end">
                      <span className="font-mono text-xs text-ink mb-1 tabular-nums">{bin.count}</span>
                      <div
                        className="w-full rounded-t transition-[height] duration-300 hover:brightness-90"
                        style={{
                          height: `${heightPct}%`,
                          backgroundColor: `color-mix(in srgb, var(--color-primary) ${Math.round(opacity * 100)}%, transparent)`,
                        }}
                      />
                      <span className="font-mono text-[10px] text-muted mt-1.5 text-center tabular-nums">{bin.range}</span>
                      <span className="text-[10px] text-muted text-center">{bin.label}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between text-xs text-muted">
                <span>Low recall (&lt;35%)</span>
                <span>Balanced (50–65%)</span>
                <span>High precision (&gt;80%)</span>
              </div>
            </div>

            {/* Threshold simulator */}
            <div className="rounded-lg border border-line bg-canvas/30 p-5 flex flex-col gap-4">
              <div>
                <p className="text-xs font-semibold text-ink">Confidence filter</p>
                <p className="text-xs text-muted mt-1 leading-relaxed">
                  Adjust the threshold to filter low-confidence detections.
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between font-mono text-xs">
                  <span className="text-muted">Threshold</span>
                  <b className="text-primary tabular-nums">{(confidenceThreshold * 100).toFixed(0)}%</b>
                </div>
                <input
                  type="range"
                  min="0.10"
                  max="0.90"
                  step="0.05"
                  value={confidenceThreshold}
                  onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
                  className="w-full accent-primary cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-muted font-mono">
                  <span>10%</span>
                  <span>90%</span>
                </div>
              </div>

              <div className="rounded-lg border border-line bg-surface p-3 space-y-2">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-muted">Retained</span>
                  <b className="text-ink tabular-nums">
                    {allDetections.filter((d) => d.confidence >= confidenceThreshold).length} / {totalDetections}
                  </b>
                </div>
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-muted">Filtered out</span>
                  <b className="text-ink tabular-nums">
                    {allDetections.filter((d) => d.confidence < confidenceThreshold).length}
                  </b>
                </div>
              </div>

              <p className="text-[11px] text-muted">
                Optimal F1 at 18–25% threshold (RDD2020).
              </p>
            </div>
          </div>
        </section>
      )}

      {/* ── SECTION 3: DAMAGE FREQUENCY ─────────────────────────────────────── */}
      {show("frequency") && (
        <section className="rounded-xl border border-line bg-surface p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-line pb-4">
            <div>
              <h3 className="text-sm font-semibold text-ink">Inspection trends</h3>
              <p className="text-xs text-muted mt-0.5">
                Detections and road health index across sequential inspections.
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-primary" />
                <span className="text-muted">Detections</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-amber-500" />
                <span className="text-muted">RHI</span>
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-line bg-canvas/40 p-5 overflow-x-auto">
            {trendPoints.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted">No inspection events recorded.</div>
            ) : (
              <div className="min-w-[560px]">
                <svg className="w-full h-48 overflow-visible" viewBox={`0 0 ${chartW} ${chartH}`}>
                  {[0, 25, 50, 75, 100].map((val) => {
                    const y = padY + innerH - (val / 100) * innerH;
                    return (
                      <g key={val}>
                        <line x1={padX} y1={y} x2={chartW - padX} y2={y} stroke="#f1f5f9" strokeDasharray="3,3" />
                        <text x={padX - 6} y={y + 3} textAnchor="end" className="text-[9px] fill-slate-400 font-mono">
                          {val}
                        </text>
                      </g>
                    );
                  })}

                  <path d={lineCoords.pathRhi} fill="none" stroke="#d97706" strokeWidth="2" className="transition-[d]" />
                  <path d={lineCoords.pathDets} fill="none" stroke="var(--color-primary)" strokeWidth="2.5" className="transition-[d]" />

                  {lineCoords.points.map((pt, i) => (
                    <g key={pt.id || i} className="cursor-pointer" onClick={() => onOpenComplaint(pt.id)}>
                      <circle cx={pt.x} cy={pt.yDets} r="4" fill="var(--color-primary)" stroke="#fff" strokeWidth="2" />
                      <circle cx={pt.x} cy={pt.yRhi} r="3.5" fill="#d97706" stroke="#fff" strokeWidth="1.5" />
                      <text x={pt.x} y={chartH - 2} textAnchor="middle" className="text-[9px] fill-slate-400 font-mono">
                        {pt.date.split(" ")[0]} {pt.date.split(" ")[1]}
                      </text>
                      <title>{`${pt.road}\nDetections: ${pt.detections}\nRHI: ${pt.rhi}/100\n${pt.date}`}</title>
                    </g>
                  ))}
                </svg>

                <div className="mt-3 flex items-center justify-between text-xs text-muted border-t border-line pt-3 font-mono">
                  <span>Earliest: <b className="text-ink">{trendPoints[0]?.date}</b></span>
                  <span className="text-muted">{trendPoints.length} frames</span>
                  <span>Latest: <b className="text-ink">{trendPoints[trendPoints.length - 1]?.date}</b></span>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── SECTION 4: INSPECTION COMPARISON ────────────────────────────────── */}
      {show("comparison") && (
        <section className="rounded-xl border border-line bg-surface p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-line pb-4">
            <div>
              <h3 className="text-sm font-semibold text-ink">Inspection comparison</h3>
              <p className="text-xs text-muted mt-0.5">
                Select two inspections to analyse distress shifts and RHI deltas.
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs font-mono">
              <select
                value={compAId}
                onChange={(e) => setCompAId(e.target.value)}
                className="rounded border border-line bg-canvas px-2.5 py-1.5 text-xs font-medium text-ink outline-none focus:border-primary"
              >
                {complaints.map((c) => (
                  <option key={c.id} value={c.id}>A: {c.id} ({c.road.slice(0, 20)}…)</option>
                ))}
              </select>
              <span className="text-muted">vs</span>
              <select
                value={compBId}
                onChange={(e) => setCompBId(e.target.value)}
                className="rounded border border-line bg-canvas px-2.5 py-1.5 text-xs font-medium text-ink outline-none focus:border-primary"
              >
                {complaints.map((c) => (
                  <option key={c.id} value={c.id}>B: {c.id} ({c.road.slice(0, 20)}…)</option>
                ))}
              </select>
            </div>
          </div>

          {inspectionA && inspectionB && comparisonDeltas ? (
            <div className="grid gap-5 lg:grid-cols-2">
              {/* Inspection A */}
              <div className="rounded-lg border border-line bg-canvas/30 p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-line pb-3">
                  <div>
                    <span className="font-mono text-xs font-semibold text-primary">A · {inspectionA.id}</span>
                    <h4 className="text-sm font-semibold text-ink truncate max-w-xs">{inspectionA.road}</h4>
                    <p className="text-xs text-muted">{fmtDate(inspectionA.createdAt)}</p>
                  </div>
                  <button onClick={() => onOpenComplaint(inspectionA.id)} className="btn btn-ghost p-1 text-muted hover:text-primary" title="Inspect">
                    <Eye size={14} />
                  </button>
                </div>
                <div className="relative aspect-video rounded-lg overflow-hidden border border-line bg-black">
                  <img src={inspectionA.thumb} alt="Inspection A" className="h-full w-full object-cover" />
                  <span className="absolute top-2 left-2"><SeverityBadge severity={inspectionA.report.severity} /></span>
                  <span className="absolute bottom-2 right-2 rounded bg-black/80 px-2 py-0.5 font-mono text-xs font-bold text-white">
                    RHI {inspectionA.report.rhi}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2 font-mono text-xs text-center">
                  {(["D00", "D10", "D20", "D40"] as DamageCode[]).map((code) => (
                    <div key={code} className="rounded border border-line bg-surface p-2">
                      <span className="text-[10px] text-muted block">{code}</span>
                      <b className="text-ink tabular-nums">{inspectionA.report.counts[code] || 0}</b>
                    </div>
                  ))}
                </div>
              </div>

              {/* Inspection B */}
              <div className="rounded-lg border border-line bg-canvas/30 p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-line pb-3">
                  <div>
                    <span className="font-mono text-xs font-semibold text-primary">B · {inspectionB.id}</span>
                    <h4 className="text-sm font-semibold text-ink truncate max-w-xs">{inspectionB.road}</h4>
                    <p className="text-xs text-muted">{fmtDate(inspectionB.createdAt)}</p>
                  </div>
                  <button onClick={() => onOpenComplaint(inspectionB.id)} className="btn btn-ghost p-1 text-muted hover:text-primary" title="Inspect">
                    <Eye size={14} />
                  </button>
                </div>
                <div className="relative aspect-video rounded-lg overflow-hidden border border-line bg-black">
                  <img src={inspectionB.thumb} alt="Inspection B" className="h-full w-full object-cover" />
                  <span className="absolute top-2 left-2"><SeverityBadge severity={inspectionB.report.severity} /></span>
                  <span className="absolute bottom-2 right-2 rounded bg-black/80 px-2 py-0.5 font-mono text-xs font-bold text-white">
                    RHI {inspectionB.report.rhi}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2 font-mono text-xs text-center">
                  {(["D00", "D10", "D20", "D40"] as DamageCode[]).map((code) => (
                    <div key={code} className="rounded border border-line bg-surface p-2">
                      <span className="text-[10px] text-muted block">{code}</span>
                      <b className="text-ink tabular-nums">{inspectionB.report.counts[code] || 0}</b>
                    </div>
                  ))}
                </div>
              </div>

              {/* Verdict banner */}
              <div className="lg:col-span-2 rounded-lg border border-line bg-surface p-4 flex flex-wrap items-center justify-between gap-4 font-mono text-xs">
                <div className="flex items-center gap-4">
                  <div>
                    <span className="text-muted block">RHI shift</span>
                    <span className={`font-semibold tabular-nums ${comparisonDeltas.rhiDelta >= 0 ? "text-green-700" : "text-red-700"}`}>
                      {comparisonDeltas.rhiDelta >= 0 ? "+" : ""}{comparisonDeltas.rhiDelta} pts
                    </span>
                  </div>
                  <div className="border-l border-line pl-4">
                    <span className="text-muted block">Detections delta</span>
                    <span className={`font-semibold tabular-nums ${comparisonDeltas.detDelta <= 0 ? "text-green-700" : "text-red-700"}`}>
                      {comparisonDeltas.detDelta >= 0 ? "+" : ""}{comparisonDeltas.detDelta} defects
                    </span>
                  </div>
                </div>
                <p className="text-muted text-xs font-sans max-w-sm">
                  {comparisonDeltas.rhiDelta > 0
                    ? "Inspection B shows reduced distress relative to A."
                    : comparisonDeltas.rhiDelta < 0
                    ? "Degradation detected: B reflects worsening conditions."
                    : "Conditions stable across both inspections."}
                </p>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-muted">
              Select two different complaints to generate a comparative analysis.
            </div>
          )}
        </section>
      )}

      {/* ── SECTION 5: DAMAGE DENSITY ────────────────────────────────────────── */}
      {show("density") && (
        <section className="rounded-xl border border-line bg-surface p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-line pb-4">
            <div>
              <h3 className="text-sm font-semibold text-ink">Damage density</h3>
              <p className="text-xs text-muted mt-0.5">
                Detections relative to survey camera resolution and distressed area.
              </p>
            </div>
            <span className="font-mono text-xs text-muted">{densityMetrics.densityRating}</span>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {/* 3 metric tiles */}
            <div className="space-y-3">
              <div className="rounded-lg border border-line bg-canvas/40 p-4">
                <span className="text-xs text-muted block">Damage density index</span>
                <p className="mt-1 font-mono text-2xl font-bold text-ink tabular-nums">
                  {densityMetrics.detectionsPerMp}
                </p>
                <p className="text-xs text-muted mt-0.5">detections per megapixel</p>
              </div>
              <div className="rounded-lg border border-line bg-canvas/40 p-4">
                <span className="text-xs text-muted block">Distressed surface area</span>
                <p className="mt-1 font-mono text-2xl font-bold text-ink tabular-nums">
                  {densityMetrics.avgDistressedAreaPct}%
                </p>
                <p className="text-xs text-muted mt-0.5">avg per image</p>
              </div>
              <div className="rounded-lg border border-line bg-canvas/40 p-4">
                <span className="text-xs text-muted block">Survey coverage</span>
                <p className="mt-1 font-mono text-2xl font-bold text-ink tabular-nums">
                  {densityMetrics.totalMegapixels.toFixed(1)} MP
                </p>
                <p className="text-xs text-muted mt-0.5">aggregate sensor resolution</p>
              </div>
            </div>

            {/* Spatial 3×3 grid */}
            <div className="lg:col-span-2 rounded-lg border border-line bg-canvas/40 p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-ink">Spatial concentration (3×3 quadrants)</span>
                <span className="font-mono text-xs text-muted">by road sector</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {densityMetrics.spatialGrid.map((q) => {
                  const maxQ = Math.max(...densityMetrics.spatialGrid.map((x) => x.count), 1);
                  const opacity = Math.max(0.1, q.count / maxQ);
                  return (
                    <div
                      key={q.id}
                      className="rounded-lg border border-line bg-surface p-3 flex flex-col justify-between"
                      style={{ backgroundColor: q.count > 0 ? `rgba(8, 145, 178, ${opacity * 0.28})` : undefined }}
                    >
                      <span className="font-mono text-[10px] text-muted truncate">{q.label}</span>
                      <div className="mt-2 flex items-baseline justify-between">
                        <span className="font-mono text-lg font-bold text-ink tabular-nums">{q.count}</span>
                        <span className="font-mono text-[10px] text-muted tabular-nums">
                          {totalDetections > 0 ? Math.round((q.count / totalDetections) * 100) : 0}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-muted border-t border-line pt-2">
                <span>Left wheelpath</span>
                <span>Centre lane</span>
                <span>Right shoulder</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── SECTION 6: SEVERITY DISTRIBUTION ────────────────────────────────── */}
      {show("severity") && (
        <section className="rounded-xl border border-line bg-surface p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-line pb-4">
            <div>
              <h3 className="text-sm font-semibold text-ink">Severity distribution</h3>
              <p className="text-xs text-muted mt-0.5">
                Low, medium, and high distress categories for maintenance triage.
              </p>
            </div>
            <div className="flex items-center gap-4 font-mono text-xs">
              <span className="text-muted">High <b className="text-ink tabular-nums">{severityDistribution.high.count}</b></span>
              <span className="text-muted">Med <b className="text-ink tabular-nums">{severityDistribution.medium.count}</b></span>
              <span className="text-muted">Low <b className="text-ink tabular-nums">{severityDistribution.low.count}</b></span>
            </div>
          </div>

          {/* Stacked bar */}
          <div className="space-y-2">
            <div className="flex h-5 w-full overflow-hidden rounded bg-line/40">
              <div
                style={{ width: `${severityDistribution.high.pct}%`, backgroundColor: "#dc2626" }}
                className="flex items-center justify-center text-[10px] font-mono font-semibold text-white transition-[width] duration-500"
                title={`High: ${severityDistribution.high.count} (${severityDistribution.high.pct}%)`}
              >
                {severityDistribution.high.pct > 8 && `${severityDistribution.high.pct}%`}
              </div>
              <div
                style={{ width: `${severityDistribution.medium.pct}%`, backgroundColor: "#d97706" }}
                className="flex items-center justify-center text-[10px] font-mono font-semibold text-white transition-[width] duration-500"
                title={`Medium: ${severityDistribution.medium.count} (${severityDistribution.medium.pct}%)`}
              >
                {severityDistribution.medium.pct > 8 && `${severityDistribution.medium.pct}%`}
              </div>
              <div
                style={{ width: `${severityDistribution.low.pct}%`, backgroundColor: "#16a34a" }}
                className="flex items-center justify-center text-[10px] font-mono font-semibold text-white transition-[width] duration-500"
                title={`Low: ${severityDistribution.low.count} (${severityDistribution.low.pct}%)`}
              >
                {severityDistribution.low.pct > 8 && `${severityDistribution.low.pct}%`}
              </div>
            </div>
            <div className="flex items-center justify-between text-xs font-mono text-muted">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>

          {/* 3 protocol cards — neutral surfaces, colored left border */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-line bg-surface p-4 space-y-2 border-l-4" style={{ borderLeftColor: "#dc2626" }}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink">High / critical</span>
                <span className="font-mono font-bold text-ink tabular-nums">
                  {severityDistribution.high.pct}%
                </span>
              </div>
              <p className="text-xs text-muted leading-relaxed">
                Potholes (D40) and deep alligator cracks (D20). Immediate 24h patching protocol.
              </p>
            </div>

            <div className="rounded-xl border border-line bg-surface p-4 space-y-2 border-l-4" style={{ borderLeftColor: "#d97706" }}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink">Medium / moderate</span>
                <span className="font-mono font-bold text-ink tabular-nums">
                  {severityDistribution.medium.pct}%
                </span>
              </div>
              <p className="text-xs text-muted leading-relaxed">
                Fatigue cracks and faulted joints. Schedule 14-day asphalt milling and seal.
              </p>
            </div>

            <div className="rounded-xl border border-line bg-surface p-4 space-y-2 border-l-4" style={{ borderLeftColor: "#16a34a" }}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink">Low / minor</span>
                <span className="font-mono font-bold text-ink tabular-nums">
                  {severityDistribution.low.pct}%
                </span>
              </div>
              <p className="text-xs text-muted leading-relaxed">
                Hairline longitudinal fissures. Routine monitoring; preventive polymer injection.
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
