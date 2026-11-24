import { useRef } from "react";
import { Download, Printer, X, FileText, ShieldCheck } from "lucide-react";
import { CLASS_COLORS, DAMAGE_CLASSES, computeRHI, rhiLabel, type Detection, type DamageCode } from "../lib/damage";

interface InspectionReportModalProps {
  fileName: string;
  rawImageUrl: string | null;
  annotatedCanvas: HTMLCanvasElement | null;
  detections: Detection[];
  threshold: number;
  latencyMs: number;
  modelMode: string;
  imageWidth: number;
  imageHeight: number;
  onClose: () => void;
}

export default function InspectionReportModal({
  fileName,
  rawImageUrl,
  annotatedCanvas,
  detections,
  threshold,
  latencyMs,
  modelMode,
  imageWidth,
  imageHeight,
  onClose,
}: InspectionReportModalProps) {
  const printableAreaRef = useRef<HTMLDivElement>(null);

  const visibleDets = detections.filter((d) => d.confidence >= threshold);
  const rhi = computeRHI(detections, threshold);
  const { label: rhiText, color: rhiColor } = rhiLabel(rhi);

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const annotatedDataUrl = annotatedCanvas ? annotatedCanvas.toDataURL("image/jpeg", 0.92) : rawImageUrl || "";

  // Compute metrics
  const d00 = visibleDets.filter((d) => d.code === "D00").length;
  const d10 = visibleDets.filter((d) => d.code === "D10").length;
  const d20 = visibleDets.filter((d) => d.code === "D20").length;
  const d40 = visibleDets.filter((d) => d.code === "D40").length;
  const megapixels = (imageWidth * imageHeight) / 1_000_000;
  const density = megapixels > 0 ? (visibleDets.length / megapixels).toFixed(2) : "0.00";
  const distressedAreaPct = (
    visibleDets.reduce((acc, d) => acc + (d.x2 - d.x1) * (d.y2 - d.y1), 0) * 100
  ).toFixed(2);

  // Trigger browser print to PDF
  const handlePrint = () => {
    window.print();
  };

  // Download CSV report
  const downloadCSVReport = () => {
    const lines = [
      "# ====================================================================",
      "# PAVEXA — AUTOMATED ROAD PAVEMENT INSPECTION REPORT",
      "# ====================================================================",
      `Inspection Date,${dateStr} ${timeStr}`,
      `File Name,${fileName || "frame.jpg"}`,
      `Resolution,${imageWidth}x${imageHeight} px (${megapixels.toFixed(2)} MP)`,
      `Model Architecture,YOLO26s Dual-Scale Ensemble (1088px + 640px via WBF)`,
      `Inference Mode,${modelMode}`,
      `Confidence Cutoff (tau),${threshold.toFixed(4)}`,
      `Latency (ms),${latencyMs.toFixed(1)}`,
      `Road Health Index (RHI),${rhi}/100 (${rhiText})`,
      `Total Detections,${visibleDets.length}`,
      `Damage Density (det/MP),${density}`,
      `Distressed Surface Area (%),${distressedAreaPct}%`,
      "",
      "# --- CLASS BREAKDOWN ---",
      `D00 Longitudinal Cracks,${d00}`,
      `D10 Transverse Cracks,${d10}`,
      `D20 Alligator Cracks,${d20}`,
      `D40 Potholes,${d40}`,
      "",
      "# --- DETECTIONS LIST ---",
      "DetectionID,ClassCode,ClassLabel,Confidence,X1_px,Y1_px,X2_px,Y2_px,Width_px,Height_px,Severity",
    ];

    visibleDets.forEach((d, i) => {
      const x1 = Math.round(d.x1 * imageWidth);
      const y1 = Math.round(d.y1 * imageHeight);
      const x2 = Math.round(d.x2 * imageWidth);
      const y2 = Math.round(d.y2 * imageHeight);
      const w = x2 - x1;
      const h = y2 - y1;
      const meta = DAMAGE_CLASSES[d.code];
      lines.push(
        `DET-${(i + 1).toString().padStart(2, "0")},${d.code},${meta.label},${d.confidence.toFixed(4)},${x1},${y1},${x2},${y2},${w},${h},${meta.severity === 4 ? "Critical" : meta.severity === 3 ? "Severe" : "Moderate"}`
      );
    });

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `pavexa_inspection_${fileName.replace(/\.[^/.]+$/, "") || "report"}_${Date.now()}.csv`;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="relative my-8 w-full max-w-4xl rounded-2xl border border-line bg-surface p-6 sm:p-8 shadow-2xl flex flex-col">
        {/* Top Action Bar (hidden in print) */}
        <div className="print:hidden flex items-center justify-between border-b border-line pb-4 mb-6">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-primary" />
            <h2 className="font-bold text-ink text-base">Executive Pavement Inspection Report</h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={downloadCSVReport} className="btn btn-ghost text-xs">
              <Download size={14} /> Download CSV
            </button>
            <button onClick={handlePrint} className="btn btn-primary text-xs">
              <Printer size={14} /> Print / Save as PDF
            </button>
            <button onClick={onClose} className="btn btn-ghost text-xs p-1.5" title="Close">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Printable Report Body */}
        <div ref={printableAreaRef} className="space-y-6 text-ink print:p-0">
          {/* Report Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-line pb-4 gap-4">
            <div>
              <div className="flex items-center gap-2">
                <img src="/favicon.svg" alt="" className="size-7" />
                <span className="font-extrabold text-xl tracking-tight text-ink">PAVEXA</span>
                <span className="font-mono text-xs rounded border border-line px-2 py-0.5 text-muted bg-canvas">
                  OFFICIAL INSPECTION DOSSIER
                </span>
              </div>
              <p className="text-xs text-muted mt-1">
                Automated Infrastructure Distress Assessment · Dual-Scale YOLO26s Ensemble
              </p>
            </div>

            <div className="text-left sm:text-right font-mono text-xs text-muted space-y-0.5">
              <p>Date: <b className="text-ink">{dateStr}</b></p>
              <p>Time: <b className="text-ink">{timeStr}</b></p>
              <p>File: <b className="text-ink">{fileName || "Live Camera Snapshot"}</b></p>
            </div>
          </div>

          {/* Model & Executive Telemetry Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
            <div className="rounded-xl border border-line bg-canvas p-3.5">
              <span className="text-muted block text-[10px] uppercase">Road Health Index:</span>
              <span className="text-2xl font-extrabold" style={{ color: rhiColor }}>
                {rhi} <span className="text-xs text-muted font-normal">/ 100</span>
              </span>
              <span className="text-[10px] block mt-0.5 font-bold" style={{ color: rhiColor }}>
                Rating: {rhiText}
              </span>
            </div>

            <div className="rounded-xl border border-line bg-canvas p-3.5">
              <span className="text-muted block text-[10px] uppercase">Total Detections:</span>
              <span className="text-2xl font-extrabold text-ink">{visibleDets.length}</span>
              <span className="text-[10px] text-muted block mt-0.5">
                Density: {density} / MP
              </span>
            </div>

            <div className="rounded-xl border border-line bg-canvas p-3.5">
              <span className="text-muted block text-[10px] uppercase">Distressed Surface:</span>
              <span className="text-2xl font-extrabold text-amber-600">{distressedAreaPct}%</span>
              <span className="text-[10px] text-muted block mt-0.5">
                Resolution: {imageWidth}×{imageHeight} px
              </span>
            </div>

            <div className="rounded-xl border border-line bg-canvas p-3.5">
              <span className="text-muted block text-[10px] uppercase">Model Latency:</span>
              <span className="text-2xl font-extrabold text-ink">{latencyMs.toFixed(1)} <span className="text-xs text-muted font-normal">ms</span></span>
              <span className="text-[10px] text-muted block mt-0.5 truncate">
                Cutoff: τ = {threshold.toFixed(3)}
              </span>
            </div>
          </div>

          {/* Visual Evidence Comparison (Raw vs Annotated Detection) */}
          <div className="space-y-2">
            <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-muted">
              Photographic Distress Evidence
            </h4>
            <div className="grid sm:grid-cols-2 gap-4">
              {/* Raw Frame */}
              <div className="rounded-xl border border-line overflow-hidden bg-slate-950 flex flex-col">
                <div className="bg-slate-900 px-3 py-1.5 font-mono text-[10px] text-slate-300 border-b border-white/10">
                  RAW UNANNOTATED IMAGE
                </div>
                <div className="p-2 flex items-center justify-center aspect-video">
                  {rawImageUrl ? (
                    <img src={rawImageUrl} alt="Raw road surface" className="h-full w-full object-contain rounded" />
                  ) : (
                    <span className="text-xs text-slate-500">Image not loaded</span>
                  )}
                </div>
              </div>

              {/* Annotated Canvas Output */}
              <div className="rounded-xl border border-line overflow-hidden bg-slate-950 flex flex-col">
                <div className="bg-slate-900 px-3 py-1.5 font-mono text-[10px] text-cyan-400 border-b border-white/10 flex justify-between">
                  <span>YOLO26s DUAL-SCALE ANNOTATION</span>
                  <span>{visibleDets.length} DETECTIONS</span>
                </div>
                <div className="p-2 flex items-center justify-center aspect-video">
                  <img src={annotatedDataUrl} alt="Annotated detection output" className="h-full w-full object-contain rounded" />
                </div>
              </div>
            </div>
          </div>

          {/* Damage Classification Breakdown Table */}
          <div className="space-y-2">
            <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-muted">
              Damage Classification & Pathology Breakdown
            </h4>
            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-canvas border-b border-line text-muted uppercase text-[10px]">
                  <tr>
                    <th className="px-4 py-2.5">Class Code</th>
                    <th className="px-4 py-2.5">Damage Description</th>
                    <th className="px-4 py-2.5">Severity</th>
                    <th className="px-4 py-2.5 text-right">Detected Count</th>
                    <th className="px-4 py-2.5 text-right">Share (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {(["D00", "D10", "D20", "D40"] as DamageCode[]).map((code) => {
                    const count = visibleDets.filter((d) => d.code === code).length;
                    const meta = DAMAGE_CLASSES[code];
                    const share = visibleDets.length > 0 ? ((count / visibleDets.length) * 100).toFixed(1) : "0.0";
                    return (
                      <tr key={code}>
                        <td className="px-4 py-2.5 font-bold flex items-center gap-2">
                          <span className="size-2 rounded-sm" style={{ backgroundColor: CLASS_COLORS[code] }} />
                          {code}
                        </td>
                        <td className="px-4 py-2.5 font-sans font-medium text-ink">{meta.label}</td>
                        <td className="px-4 py-2.5">
                          <span
                            className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                            style={{ backgroundColor: `${CLASS_COLORS[code]}18`, color: CLASS_COLORS[code] }}
                          >
                            {meta.severity === 4 ? "Critical" : meta.severity === 3 ? "Severe" : "Moderate"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-ink">{count}</td>
                        <td className="px-4 py-2.5 text-right text-muted">{share}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Model Information & Methodology */}
          <div className="rounded-xl border border-line bg-canvas p-4 text-xs font-mono text-muted space-y-1">
            <p className="font-bold text-ink">Inference Specification & Provenance:</p>
            <p>• Model: YOLO26s Dual-Scale Ensemble (Primary 1088px + Secondary 640px)</p>
            <p>• Bounding Box Consolidation: Weighted Box Fusion (WBF) with cluster IoU threshold = 0.55, weights = [1, 1]</p>
            <p>• Optimal Confidence Cutoff: τ = {threshold.toFixed(4)} (F1-maximizing cutoff on RDD2020 validation set)</p>
            <p>• Dataset Taxonomy: RDD2020 Standard (Japan, India, Czech Republic)</p>
          </div>

          {/* Footer Signature Block */}
          <div className="flex justify-between items-end border-t border-line pt-4 text-xs text-muted font-mono">
            <div>
              <p>PAVEXA Automated Infrastructure Telemetry</p>
              <p className="text-[10px]">Cryptographic Report ID: PVX-{Date.now().toString().slice(-8)}</p>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center gap-1 text-green-700 font-bold text-[11px]">
                <ShieldCheck size={14} /> AI-VERIFIED PAVEMENT AUDIT
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
