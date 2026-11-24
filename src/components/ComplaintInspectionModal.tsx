import { useEffect, useRef, useState, useMemo } from "react";
import {
  X, ZoomIn, ZoomOut, RotateCcw, Eye, Layers, Sliders, Check,
  MapPin, ExternalLink, Wrench, SplitSquareVertical
} from "lucide-react";
import { CLASS_COLORS, DAMAGE_CLASSES, type DamageCode } from "../lib/damage";
import { CODES } from "../lib/vision";
import {
  type Complaint, type Status, STATUS_FLOW, updateStatus, HQS,
} from "../lib/complaints";
import { SEVERITY_ACTION, SEVERITY_COLOR } from "../lib/knowledge";
import { SeverityBadge, StatusPill, fmtDate, timeAgo } from "./ComplaintBits";

interface ComplaintInspectionModalProps {
  complaint: Complaint;
  onClose: () => void;
  onStatusUpdated?: () => void;
}

export default function ComplaintInspectionModal({
  complaint: c,
  onClose,
  onStatusUpdated,
}: ComplaintInspectionModalProps) {
  const [viewMode, setViewMode] = useState<"annotated" | "original" | "split">("annotated");
  const [activeClasses, setActiveClasses] = useState<Record<DamageCode, boolean>>({
    D00: true, D10: true, D20: true, D40: true,
  });
  const [threshold, setThreshold] = useState<number>(0.2);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [selectedDetIdx, setSelectedDetIdx] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>(c.status);
  const [note, setNote] = useState<string>("");
  const [team, setTeam] = useState<string>("");
  const [expectedDate, setExpectedDate] = useState<string>("");
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const hq = HQS.find((h) => h.id === c.hqId);
  const detections = useMemo(() => c.report.detections ?? [], [c.report.detections]);

  const visibleDetections = useMemo(
    () => detections.filter((d) => activeClasses[d.code] && d.confidence >= threshold),
    [detections, activeClasses, threshold]
  );

  const presentClassCounts = useMemo(() => {
    const counts: Record<DamageCode, number> = { D00: 0, D10: 0, D20: 0, D40: 0 };
    detections.forEach((d) => { counts[d.code] = (counts[d.code] ?? 0) + 1; });
    return counts;
  }, [detections]);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = c.originalThumb || c.thumb;
    img.onload = () => { imgRef.current = img; drawCanvas(); };
  }, [c.thumb, c.originalThumb]);

  useEffect(() => { drawCanvas(); }, [visibleDetections, selectedDetIdx, viewMode]);

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = img.naturalWidth || 1280;
    const H = img.naturalHeight || 720;
    canvas.width = W;
    canvas.height = H;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(img, 0, 0, W, H);

    // If pure original mode is selected: show clean image with zero overlays
    if (viewMode === "original") return;

    // If split mode is selected: left half is original, right half is annotated
    const splitX = W / 2;
    if (viewMode === "split") {
      ctx.save();
      // Clip right half for detections
      ctx.beginPath();
      ctx.rect(splitX, 0, W - splitX, H);
      ctx.clip();
    }

    visibleDetections.forEach((d, idx) => {
      const isSelected = selectedDetIdx === idx;
      const color = CLASS_COLORS[d.code];
      const bx = d.x1 * W;
      const by = d.y1 * H;
      const bw = (d.x2 - d.x1) * W;
      const bh = (d.y2 - d.y1) * H;

      ctx.fillStyle = isSelected ? `${color}40` : `${color}1a`;
      ctx.fillRect(bx, by, bw, bh);

      ctx.strokeStyle = color;
      ctx.lineWidth = isSelected ? 3.5 : 2;
      ctx.strokeRect(bx, by, bw, bh);

      // Corner target marks
      const cs = Math.min(10, Math.min(bw, bh) / 4);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bx, by, cs, cs);
      ctx.strokeRect(bx + bw - cs, by + bh - cs, cs, cs);

      // Label
      const labelText = `${d.code} ${(d.confidence * 100).toFixed(1)}%`;
      ctx.font = "bold 12px 'JetBrains Mono', monospace";
      const textWidth = ctx.measureText(labelText).width;
      const lh = 20;
      const lx = bx;
      const ly = by - lh > 0 ? by - lh : by + 2;
      ctx.fillStyle = color;
      ctx.fillRect(lx, ly, textWidth + 12, lh);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(labelText, lx + 6, ly + 14);
    });

    if (viewMode === "split") {
      ctx.restore();

      // Draw split divider line
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(splitX, 0);
      ctx.lineTo(splitX, H);
      ctx.stroke();

      // Divider pills
      ctx.font = "bold 11px 'JetBrains Mono', monospace";
      ctx.fillStyle = "rgba(0,0,0,0.75)";
      ctx.fillRect(splitX - 75, 12, 70, 22);
      ctx.fillStyle = "#ffffff";
      ctx.fillText("ORIGINAL", splitX - 67, 27);

      ctx.fillStyle = "rgba(0,0,0,0.75)";
      ctx.fillRect(splitX + 5, 12, 75, 22);
      ctx.fillStyle = "#38bdf8";
      ctx.fillText("ANNOTATED", splitX + 11, 27);
    }
  };

  const handleZoomIn = () => setZoom((z) => Math.min(4, +(z + 0.35).toFixed(2)));
  const handleZoomOut = () => setZoom((z) => Math.max(0.5, +(z - 0.35).toFixed(2)));
  const handleResetZoom = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({ x: e.clientX - dragStartRef.current.x, y: e.clientY - dragStartRef.current.y });
  };
  const handleMouseUp = () => setIsDragging(false);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => e.deltaY < 0
      ? Math.min(4, +(z + 0.15).toFixed(2))
      : Math.max(0.5, +(z - 0.15).toFixed(2))
    );
  };

  const toggleClass = (code: DamageCode) =>
    setActiveClasses((prev) => ({ ...prev, [code]: !prev[code] }));

  const toggleAllClasses = (enable: boolean) =>
    setActiveClasses({ D00: enable, D10: enable, D20: enable, D40: enable });

  const handleSaveStatus = () => {
    const operationsNote = [note.trim(), team && `Assigned maintenance team: ${team}.`, expectedDate && `Expected completion: ${expectedDate}.`].filter(Boolean).join(" ");
    updateStatus(c.id, status, operationsNote);
    setNote("");
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
    if (onStatusUpdated) onStatusUpdated();
  };

  const viewBtnCls = (mode: "annotated" | "original" | "split") =>
    `flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
      viewMode === mode ? "bg-surface text-ink shadow-xs" : "text-muted hover:text-ink"
    }`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/75 p-3 sm:p-5 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative my-4 flex h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="rounded border border-line bg-canvas px-2.5 py-1 font-mono text-xs font-semibold text-muted">
              {c.id}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-ink">{c.road}</h2>
                <StatusPill status={c.status} />
              </div>
              <p className="text-xs text-muted">
                Filed {fmtDate(c.createdAt)} ({timeAgo(c.createdAt)}) by <b className="text-ink">{c.citizenName}</b> · {hq?.name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View mode toggle */}
            <div className="flex items-center rounded-lg border border-line bg-canvas p-1">
              <button onClick={() => setViewMode("annotated")} className={viewBtnCls("annotated")} title="AI bounding-box overlays">
                <Layers size={13} strokeWidth={1.5} /> Annotated
              </button>
              <button onClick={() => setViewMode("original")} className={viewBtnCls("original")} title="Raw photographic evidence">
                <Eye size={13} strokeWidth={1.5} /> Original
              </button>
              <button onClick={() => setViewMode("split")} className={viewBtnCls("split")} title="Side-by-side comparison">
                <SplitSquareVertical size={13} strokeWidth={1.5} /> Split
              </button>
            </div>

            <button
              onClick={onClose}
              className="flex size-9 items-center justify-center rounded-lg border border-line bg-surface text-muted transition-colors hover:bg-canvas hover:text-ink"
              aria-label="Close"
            >
              <X size={16} strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
          {/* LEFT: image viewport */}
          <div className="relative flex flex-1 flex-col overflow-hidden bg-slate-950">
            {/* Class toggles + confidence slider */}
            <div className="z-10 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-slate-900/90 px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[11px] text-slate-400 mr-1">Classes:</span>
                {CODES.map((code) => {
                  const active = activeClasses[code];
                  const count = presentClassCounts[code] || 0;
                  const color = CLASS_COLORS[code];
                  return (
                    <button
                      key={code}
                      onClick={() => toggleClass(code)}
                      className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                        active
                          ? "bg-slate-800 text-white border border-white/15"
                          : "bg-slate-900 text-slate-500 border border-white/5 opacity-50 hover:opacity-75"
                      }`}
                      title={`Toggle ${DAMAGE_CLASSES[code].label}`}
                    >
                      <span className="size-2 rounded-full" style={{ backgroundColor: color }} aria-hidden />
                      <span>{code}</span>
                      <span className="font-mono text-[10px] text-slate-400 tabular-nums">({count})</span>
                    </button>
                  );
                })}
                <button
                  onClick={() => toggleAllClasses(Object.values(activeClasses).some((v) => !v))}
                  className="rounded px-2 py-1 text-[10px] font-medium text-slate-400 hover:text-white"
                >
                  {Object.values(activeClasses).every((v) => v) ? "Hide all" : "Show all"}
                </button>
              </div>

              <div className="flex items-center gap-2 font-mono text-xs text-slate-300">
                <Sliders size={13} strokeWidth={1.5} className="text-slate-400" />
                <span className="text-[11px] text-slate-400">Min conf:</span>
                <input
                  type="range"
                  min="0.10"
                  max="0.95"
                  step="0.05"
                  value={threshold}
                  onChange={(e) => setThreshold(parseFloat(e.target.value))}
                  className="h-1.5 w-20 accent-primary cursor-pointer"
                />
                <span className="w-9 font-semibold text-slate-200 tabular-nums">{(threshold * 100).toFixed(0)}%</span>
              </div>
            </div>

            {/* Canvas area */}
            <div
              ref={containerRef}
              className={`relative flex flex-1 items-center justify-center overflow-hidden p-3 select-none ${
                zoom > 1 ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-default"
              }`}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onWheel={handleWheel}
            >
              {viewMode === "split" ? (
                <div
                  className="grid h-full w-full grid-cols-1 gap-3 overflow-hidden md:grid-cols-2"
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transformOrigin: "center center",
                    transition: isDragging ? "none" : "transform 0.15s ease-out",
                  }}
                >
                  <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-slate-900">
                    <span className="absolute left-3 top-3 z-10 rounded bg-black/75 px-2 py-1 font-mono text-[10px] font-semibold text-white">
                      Original
                    </span>
                    <img src={c.thumb} alt="Original" className="max-h-full max-w-full object-contain" />
                  </div>
                  <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-slate-900">
                    <span className="absolute left-3 top-3 z-10 rounded bg-slate-800/90 border border-primary/30 px-2 py-1 font-mono text-[10px] font-semibold text-primary">
                      Annotated ({visibleDetections.length} visible)
                    </span>
                    <canvas ref={canvasRef} className="max-h-full max-w-full object-contain" />
                  </div>
                </div>
              ) : (
                <div
                  className="flex h-full w-full items-center justify-center"
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transformOrigin: "center center",
                    transition: isDragging ? "none" : "transform 0.15s ease-out",
                  }}
                >
                  <canvas ref={canvasRef} className="max-h-full max-w-full rounded-lg object-contain" />
                </div>
              )}

              {/* Zoom controls */}
              <div className="absolute bottom-4 left-4 z-20 flex items-center gap-1 rounded-xl border border-white/10 bg-slate-900/90 p-1.5 backdrop-blur-sm">
                <button
                  onClick={handleZoomIn}
                  className="flex size-8 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white"
                  title="Zoom in"
                >
                  <ZoomIn size={14} strokeWidth={1.5} />
                </button>
                <button
                  onClick={handleZoomOut}
                  className="flex size-8 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white"
                  title="Zoom out"
                >
                  <ZoomOut size={14} strokeWidth={1.5} />
                </button>
                <button
                  onClick={handleResetZoom}
                  className="flex size-8 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white"
                  title="Reset zoom"
                >
                  <RotateCcw size={13} strokeWidth={1.5} />
                </button>
                <div className="border-l border-white/15 pl-2 pr-1 font-mono text-xs font-semibold text-slate-200 tabular-nums">
                  {Math.round(zoom * 100)}%
                </div>
              </div>

              {zoom > 1 && (
                <div className="pointer-events-none absolute bottom-4 right-4 z-20 rounded-lg bg-black/75 px-3 py-1 font-mono text-[11px] text-slate-300">
                  Drag to pan
                </div>
              )}
            </div>

            {/* Bottom status ribbon */}
            <div className="flex flex-wrap items-center justify-between border-t border-white/10 bg-slate-900 px-4 py-2 text-xs text-slate-400">
              <div className="flex items-center gap-4 font-mono text-[11px]">
                <span>Detections: <b className="text-white tabular-nums">{visibleDetections.length}/{detections.length}</b></span>
                <span>RHI: <b className="text-slate-200 tabular-nums">{c.report.rhi}/100</b></span>
                <span>Latency: <b className="tabular-nums">{c.report.latencyMs.toFixed(1)} ms</b></span>
              </div>
              <a
                href={`https://www.openstreetmap.org/?mlat=${c.lat}&mlon=${c.lng}#map=18/${c.lat}/${c.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-mono text-[11px] text-primary hover:underline"
              >
                <MapPin size={11} strokeWidth={1.5} /> {c.lat.toFixed(5)}, {c.lng.toFixed(5)} <ExternalLink size={10} />
              </a>
            </div>
          </div>

          {/* RIGHT: inspector panel */}
          <div className="flex w-full flex-col overflow-y-auto border-t border-line bg-surface lg:w-[400px] lg:border-t-0 lg:border-l">
            <div className="space-y-5 p-5">
              {/* 1. Pavement assessment */}
              <div className="rounded-xl border border-line bg-canvas/40 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted">Pavement assessment</span>
                  <SeverityBadge severity={c.report.severity} />
                </div>
                <div className="mt-3 flex items-baseline gap-3">
                  <span className="font-mono text-4xl font-bold text-ink tabular-nums">{c.report.rhi}</span>
                  <div className="text-xs text-muted">
                    <p className="font-medium text-ink">Road Health Index</p>
                    <p>100 = Pristine · 0 = Base failure</p>
                  </div>
                </div>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{
                      width: `${c.report.rhi}%`,
                      backgroundColor:
                        c.report.rhi >= 80 ? "#16a34a" : c.report.rhi >= 50 ? "#d97706" : "#dc2626",
                    }}
                  />
                </div>
              </div>

              {/* 2. Detection list */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-xs font-semibold text-ink">
                    Detections <span className="font-mono text-muted tabular-nums">({visibleDetections.length})</span>
                  </h3>
                  <span className="text-[11px] text-muted">Click to highlight</span>
                </div>

                <div className="max-h-[220px] space-y-1 overflow-y-auto pr-1">
                  {visibleDetections.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-line p-4 text-center text-xs text-muted">
                      No detections at this threshold.
                    </div>
                  ) : (
                    visibleDetections.map((d, idx) => {
                      const isSel = selectedDetIdx === idx;
                      const color = CLASS_COLORS[d.code];
                      const meta = DAMAGE_CLASSES[d.code];
                      return (
                        <div
                          key={idx}
                          onClick={() => setSelectedDetIdx(isSel ? null : idx)}
                          className={`flex items-center justify-between rounded-lg border p-2.5 text-xs cursor-pointer transition-colors ${
                            isSel
                              ? "border-primary bg-primary/5"
                              : "border-line bg-surface hover:bg-canvas"
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <span
                              className="rounded px-1.5 py-0.5 font-mono text-[10px] font-bold text-white"
                              style={{ backgroundColor: color }}
                            >
                              {d.code}
                            </span>
                            <div>
                              <p className="font-medium text-ink">{meta.label}</p>
                              <p className="font-mono text-[10px] text-muted tabular-nums">
                                ({Math.round(d.x1 * 100)}%, {Math.round(d.y1 * 100)}%)
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="font-mono font-semibold text-ink tabular-nums">
                              {(d.confidence * 100).toFixed(1)}%
                            </span>
                            <span className="block text-[10px] text-muted">confidence</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* 3. Recommended action */}
              <div className="rounded-xl border border-line bg-canvas/30 p-4 space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium text-ink">
                  <Wrench size={13} strokeWidth={1.5} className="text-muted" />
                  <span>Recommended PWD action</span>
                </div>
                <p className="text-xs text-muted leading-relaxed">
                  <b style={{ color: SEVERITY_COLOR[c.report.severity] }}>{c.report.severity} priority:</b>{" "}
                  {SEVERITY_ACTION[c.report.severity]}
                </p>
                {c.comment && (
                  <div className="mt-2 rounded-lg border border-line bg-surface p-2.5 text-xs text-muted">
                    <p className="font-medium text-ink text-[11px] mb-0.5">Citizen remark</p>
                    <p className="italic">"{c.comment}"</p>
                  </div>
                )}
              </div>

              {/* 4. Status workflow */}
              <div className="rounded-xl border border-line bg-surface p-4 space-y-3">
                <h3 className="text-xs font-semibold text-ink">Update status</h3>
                <div className="space-y-2">
                  <label className="block text-xs text-muted">Workflow stage</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as Status)}
                    className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-xs font-medium text-ink outline-none focus:border-primary"
                  >
                    {STATUS_FLOW.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs text-muted">Note for citizen and field crew</label>
                  <textarea
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Inspection remarks or crew assignment…"
                    className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-xs text-ink placeholder:text-muted outline-none focus:border-primary"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-xs text-muted">Maintenance team</label>
                    <select value={team} onChange={(e) => setTeam(e.target.value)} className="w-full rounded-md border border-line bg-canvas px-2 py-2 text-xs text-ink outline-none focus:border-primary">
                      <option value="">Not assigned</option><option>North road crew</option><option>Rapid pothole unit</option><option>Surface repair team</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs text-muted">Expected completion</label>
                    <input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} className="w-full rounded-md border border-line bg-canvas px-2 py-2 text-xs text-ink outline-none focus:border-primary" />
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={handleSaveStatus}
                    disabled={status === c.status && !note.trim()}
                    className="btn btn-primary text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Check size={13} strokeWidth={1.5} /> Save
                  </button>
                  {savedSuccess && (
                    <span className="font-mono text-xs font-semibold text-green-700 animate-in fade-in">
                      Saved
                    </span>
                  )}
                </div>
              </div>

              {/* 5. Activity timeline */}
              <div>
                <h3 className="text-xs font-semibold text-ink mb-2.5">Activity</h3>
                <ol className="space-y-2.5 border-l-2 border-line pl-3 text-xs">
                  {[...c.updates].reverse().map((u, i) => (
                    <li key={i} className="relative">
                      <span className="absolute -left-[19px] top-1 size-2 rounded-full bg-primary" />
                      <p className="font-semibold text-ink">
                        {u.status} · <span className="font-mono font-normal text-muted">{fmtDate(u.at)}</span>
                      </p>
                      {u.note && <p className="text-muted mt-0.5">{u.note}</p>}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
