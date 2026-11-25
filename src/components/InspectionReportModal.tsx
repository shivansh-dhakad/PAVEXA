import { Download, Printer, X } from "lucide-react";
import {
  CLASS_COLORS,
  DAMAGE_CLASSES,
  computeRHI,
  rhiLabel,
  type DamageCode,
  type Detection,
} from "../lib/damage";

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

const CODES: DamageCode[] = ["D00", "D10", "D20", "D40"];

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
  const visible = detections.filter((detection) => detection.confidence >= threshold);
  const rhi = computeRHI(detections, threshold);
  const rhiStatus = rhiLabel(rhi);
  const boxAreaPercent = visible
    .reduce((sum, detection) => sum + (detection.x2 - detection.x1) * (detection.y2 - detection.y1), 0) * 100;
  const annotatedUrl = annotatedCanvas?.toDataURL("image/jpeg", 0.92) ?? rawImageUrl ?? "";

  const downloadCsv = () => {
    const rows = [
      ["image_id", "class_code", "class_label", "confidence", "x1_px", "y1_px", "x2_px", "y2_px", "width_px", "height_px", "severity_weight"],
      ...visible.map((detection) => {
        const x1 = Math.round(detection.x1 * imageWidth);
        const y1 = Math.round(detection.y1 * imageHeight);
        const x2 = Math.round(detection.x2 * imageWidth);
        const y2 = Math.round(detection.y2 * imageHeight);
        return [
          fileName,
          detection.code,
          DAMAGE_CLASSES[detection.code].label,
          detection.confidence.toFixed(6),
          String(x1),
          String(y1),
          String(x2),
          String(y2),
          String(x2 - x1),
          String(y2 - y1),
          String(DAMAGE_CLASSES[detection.code].severity),
        ];
      }),
    ];
    const content = rows.map((row) => row.map((field) => `"${field.replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `pavexa-model-test-${fileName.replace(/\.[^/.]+$/, "") || "image"}.csv`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="model-report fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 sm:p-6" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="model-test-report-title"
        className="model-report-dialog my-4 max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-2xl sm:p-7"
      >
        <div className="print:hidden mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
          <div>
            <h2 id="model-test-report-title" className="text-xl text-ink">Model test report</h2>
            <p className="mt-1 text-xs text-muted">Prediction evidence and per-box measurements</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={downloadCsv} className="btn btn-ghost h-9 px-3 text-xs">
              <Download size={14} aria-hidden /> Export detections
            </button>
            <button type="button" onClick={() => window.print()} className="btn btn-primary h-9 px-3 text-xs">
              <Printer size={14} aria-hidden /> Print / Save PDF
            </button>
            <button type="button" onClick={onClose} className="btn btn-ghost h-9 w-9 px-0" aria-label="Close report">
              <X size={16} aria-hidden />
            </button>
          </div>
        </div>

        <div className="space-y-6 text-ink">
          <div className="flex flex-wrap justify-between gap-4 border-b border-line pb-4">
            <div>
              <p className="font-medium">PAVEXA · Road damage model testing</p>
              <p className="mt-1 text-xs text-muted">{fileName}</p>
            </div>
            <div className="text-xs text-muted">
              <p>{new Date().toLocaleString()}</p>
              <p className="mt-1">{imageWidth} × {imageHeight} px · {modelMode}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metric label="Visible boxes" value={String(visible.length)} />
            <Metric label="Road Health Index" value={`${rhi}/100`} detail={rhiStatus.label} />
            <Metric label="Inference time" value={`${latencyMs.toFixed(1)} ms`} />
            <Metric label="Summed box area" value={`${boxAreaPercent.toFixed(2)}%`} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <ImageCard title="Original image" src={rawImageUrl ?? ""} alt="Original road image" />
            <ImageCard title="Analysis overlay" src={annotatedUrl} alt="Road image with model detections" />
          </div>

          <div>
            <h3 className="mb-3 text-sm font-medium">Class breakdown</h3>
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead className="bg-canvas text-muted">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">Class</th>
                    <th className="px-3 py-2.5 font-medium">Damage type</th>
                    <th className="px-3 py-2.5 text-right font-medium">Count</th>
                    <th className="px-3 py-2.5 text-right font-medium">Share</th>
                    <th className="px-3 py-2.5 text-right font-medium">Severity weight</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {CODES.map((code) => {
                    const count = visible.filter((detection) => detection.code === code).length;
                    const share = visible.length ? (count / visible.length) * 100 : 0;
                    return (
                      <tr key={code}>
                        <td className="px-3 py-2.5 font-mono" style={{ color: CLASS_COLORS[code] }}>{code}</td>
                        <td className="px-3 py-2.5">{DAMAGE_CLASSES[code].label}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">{count}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">{share.toFixed(1)}%</td>
                        <td className="px-3 py-2.5 text-right font-mono">× {DAMAGE_CLASSES[code].severity}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-medium">Detection list</h3>
              <p className="text-xs text-muted">Boxes below the display threshold are hidden</p>
            </div>
            <div className="max-h-64 overflow-auto rounded-lg border border-line">
              <table className="w-full min-w-[680px] text-left text-xs">
                <thead className="sticky top-0 bg-canvas text-muted">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">#</th>
                    <th className="px-3 py-2.5 font-medium">Class</th>
                    <th className="px-3 py-2.5 text-right font-medium">Confidence</th>
                    <th className="px-3 py-2.5 text-right font-medium">X1, Y1</th>
                    <th className="px-3 py-2.5 text-right font-medium">X2, Y2</th>
                    <th className="px-3 py-2.5 text-right font-medium">Size</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {visible.map((detection, index) => {
                    const x1 = Math.round(detection.x1 * imageWidth);
                    const y1 = Math.round(detection.y1 * imageHeight);
                    const x2 = Math.round(detection.x2 * imageWidth);
                    const y2 = Math.round(detection.y2 * imageHeight);
                    return (
                      <tr key={`${detection.code}-${index}`}>
                        <td className="px-3 py-2.5 font-mono text-muted">{index + 1}</td>
                        <td className="px-3 py-2.5 font-mono" style={{ color: CLASS_COLORS[detection.code] }}>{detection.code}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">{(detection.confidence * 100).toFixed(2)}%</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">{x1}, {y1}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">{x2}, {y2}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">{x2 - x1} × {y2 - y1}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <p className="border-t border-line pt-4 text-xs leading-5 text-muted">
            The Road Health Index is a project-defined heuristic based on visible boxes, class
            severity, area and confidence. It is not a model output, calibrated pavement condition
            measurement, or an engineering inspection. Per-image accuracy requires ground-truth labels.
          </p>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-line bg-canvas p-3">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-2 font-mono text-lg tabular-nums text-ink">{value}</p>
      {detail && <p className="mt-1 text-[11px] text-muted">{detail}</p>}
    </div>
  );
}

function ImageCard({ title, src, alt }: { title: string; src: string; alt: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <p className="border-b border-line bg-canvas px-3 py-2 text-xs font-medium">{title}</p>
      <div className="flex min-h-40 items-center justify-center bg-[#1d2223] p-2">
        {src ? <img src={src} alt={alt} className="max-h-72 max-w-full object-contain" /> : <p className="text-xs text-white/60">Image unavailable</p>}
      </div>
    </div>
  );
}
