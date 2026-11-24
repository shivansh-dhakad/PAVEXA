import { useEffect, useRef } from "react";
import { X, Target, Wrench } from "lucide-react";
import { CLASS_COLORS, DAMAGE_CLASSES, type DamageCode, type Detection } from "../lib/damage";

export interface DetectionWithId extends Detection {
  id: string;
}

interface DetectionInspectorProps {
  detection: DetectionWithId;
  imageElement: HTMLImageElement | null;
  imageWidth: number;
  imageHeight: number;
  onClose: () => void;
}

const CLASS_REMEDIES: Record<DamageCode, string> = {
  D00: "Clean crack channel with compressed air; apply hot-pour polymer-modified bitumen sealant to arrest moisture infiltration.",
  D10: "Rout crack to 15×15 mm reservoir; inject high-elasticity rubberized joint sealant; install transverse load-transfer dowels if faulted.",
  D20: "Severe base fatigue failure. Perform full-depth reclamation (FDR) or mill 50-80 mm distressed layer followed by high-modulus asphalt overlay.",
  D40: "Critical safety hazard. Immediate infrared heating patch or clean cavity, apply tack coat, and compact hot-mix asphalt in 50 mm lifts.",
};

export default function DetectionInspector({
  detection,
  imageElement,
  imageWidth,
  imageHeight,
  onClose,
}: DetectionInspectorProps) {
  const cropCanvasRef = useRef<HTMLCanvasElement>(null);

  const color = CLASS_COLORS[detection.code];
  const meta = DAMAGE_CLASSES[detection.code];

  // Absolute pixel coordinates
  const px1 = Math.round(detection.x1 * imageWidth);
  const py1 = Math.round(detection.y1 * imageHeight);
  const px2 = Math.round(detection.x2 * imageWidth);
  const py2 = Math.round(detection.y2 * imageHeight);
  const boxW = Math.max(1, px2 - px1);
  const boxH = Math.max(1, py2 - py1);
  const areaPct = (((detection.x2 - detection.x1) * (detection.y2 - detection.y1)) * 100).toFixed(2);

  // Render zoomed crop onto mini canvas
  useEffect(() => {
    if (!imageElement || !cropCanvasRef.current) return;
    const canvas = cropCanvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Add 20% margin around box for context
    const padX = Math.round(boxW * 0.2);
    const padY = Math.round(boxH * 0.2);
    const srcX = Math.max(0, px1 - padX);
    const srcY = Math.max(0, py1 - padY);
    const srcW = Math.min(imageWidth - srcX, boxW + padX * 2);
    const srcH = Math.min(imageHeight - srcY, boxH + padY * 2);

    canvas.width = 400;
    canvas.height = 260;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw zoomed road section
    ctx.drawImage(imageElement, srcX, srcY, srcW, srcH, 0, 0, canvas.width, canvas.height);

    // Draw localized bounding box on crop
    const scaleX = canvas.width / srcW;
    const scaleY = canvas.height / srcH;
    const localBoxX = (px1 - srcX) * scaleX;
    const localBoxY = (py1 - srcY) * scaleY;
    const localBoxW = boxW * scaleX;
    const localBoxH = boxH * scaleY;

    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(localBoxX, localBoxY, localBoxW, localBoxH);
    ctx.fillStyle = `${color}25`;
    ctx.fillRect(localBoxX, localBoxY, localBoxW, localBoxH);

    // Target crosshair
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(localBoxX, localBoxY, localBoxW, localBoxH);
    ctx.setLineDash([]);
  }, [detection, imageElement, imageWidth, imageHeight, boxW, boxH, px1, px2, py1, py2, color]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface p-6 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div className="flex items-center gap-3">
            <span
              className="rounded-md px-2.5 py-1 font-mono text-xs font-bold text-white shadow-xs"
              style={{ backgroundColor: color }}
            >
              {detection.code}
            </span>
            <div>
              <h3 className="font-mono text-sm font-bold text-ink">{detection.id} · {meta.label}</h3>
              <p className="font-mono text-[11px] text-muted">
                Confidence: <b className="text-primary">{(detection.confidence * 100).toFixed(2)}%</b> · Severity: {meta.severity === 4 ? "Critical" : meta.severity === 3 ? "Severe" : "Moderate"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn btn-ghost text-xs p-1.5 hover:bg-canvas rounded-lg"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Annotated Region Zoom Preview */}
        <div className="mt-4 overflow-hidden rounded-xl border border-line bg-slate-950 flex flex-col">
          <div className="flex items-center justify-between border-b border-white/10 bg-slate-900/90 px-3 py-2 font-mono text-[11px] text-slate-300">
            <span className="flex items-center gap-1.5">
              <Target size={13} className="text-cyan-400" />
              ANNOTATED REGION PREVIEW (ZOOMED CROP)
            </span>
            <span className="text-[10px] text-slate-400">
              {boxW} × {boxH} px ({areaPct}% of frame)
            </span>
          </div>
          <div className="relative flex items-center justify-center p-2 bg-slate-950/90">
            <canvas ref={cropCanvasRef} className="max-h-[220px] w-full rounded object-contain" />
          </div>
        </div>

        {/* Coordinates Breakdown Grid */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs">
          <div className="rounded-lg border border-line bg-canvas p-2.5">
            <span className="text-[10px] text-muted block">X1 / Y1 (Min):</span>
            <span className="font-bold text-ink">{px1}, {py1} px</span>
            <span className="text-[9px] text-muted block mt-0.5">Norm: {detection.x1.toFixed(3)}, {detection.y1.toFixed(3)}</span>
          </div>

          <div className="rounded-lg border border-line bg-canvas p-2.5">
            <span className="text-[10px] text-muted block">X2 / Y2 (Max):</span>
            <span className="font-bold text-ink">{px2}, {py2} px</span>
            <span className="text-[9px] text-muted block mt-0.5">Norm: {detection.x2.toFixed(3)}, {detection.y2.toFixed(3)}</span>
          </div>

          <div className="rounded-lg border border-line bg-canvas p-2.5">
            <span className="text-[10px] text-muted block">Dimensions:</span>
            <span className="font-bold text-ink">{boxW} × {boxH} px</span>
            <span className="text-[9px] text-muted block mt-0.5">Ratio: {(boxW / boxH).toFixed(2)}</span>
          </div>

          <div className="rounded-lg border border-line bg-canvas p-2.5">
            <span className="text-[10px] text-muted block">Surface Area:</span>
            <span className="font-bold text-ink">{areaPct}%</span>
            <span className="text-[9px] text-muted block mt-0.5">{(boxW * boxH).toLocaleString()} px²</span>
          </div>
        </div>

        {/* Engineering Remedy Action */}
        <div className="mt-4 rounded-xl border border-line bg-canvas/60 p-3.5 space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-bold text-ink">
            <Wrench size={13} className="text-primary" />
            <span>Recommended Engineering Remedy</span>
          </div>
          <p className="font-sans text-xs text-muted leading-relaxed">
            {CLASS_REMEDIES[detection.code]}
          </p>
        </div>

        {/* Modal Footer */}
        <div className="mt-4 flex items-center justify-between border-t border-line pt-3 font-mono text-xs">
          <span className="text-muted">Detection ID: <b>{detection.id}</b></span>
          <button onClick={onClose} className="btn btn-primary text-xs">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
