import { useCallback, useEffect, useRef, useState } from "react";
import {
  Upload, Sliders, Info, RefreshCw,
  CheckCircle2, Loader2, AlertTriangle, Layers, Eye, FlipHorizontal2,
  Cpu, Sparkles, Maximize2, Minimize2, BookOpen
} from "lucide-react";
import { DAMAGE_CLASSES, CLASS_COLORS, computeRHI, rhiLabel, type Detection, type DamageCode } from "../lib/damage";
import { runInference, type InferenceResult, type ModelInferenceMode } from "../lib/api";
import { SAMPLE_PHOTOS } from "../lib/samples";
import PageHeader from "../components/PageHeader";

type Phase = "idle" | "loading" | "done" | "error";

const STEPS = [
  "Preprocessing frame (dual-scale 1088px / 640px)...",
  "Running YOLO26s forward pass...",
  "Applying Weighted Box Fusion (WBF iou_thr=0.55)...",
  "Calculating Road Health Index & telemetry...",
];

const DAMAGE_SVGS: Record<DamageCode, { svg: string; summary: string }> = {
  D00: { svg: "/logitudinal.svg", summary: "Parallel cracks along traffic travel lane" },
  D10: { svg: "/transverse.svg", summary: "Perpendicular cracks across roadway width" },
  D20: { svg: "/alligator-crack.svg", summary: "Interconnected fatigue network (reptilian pattern)" },
  D40: { svg: "/pothole.svg", summary: "Depression & displacement cavity in asphalt layer" },
};

// ── Stress filters ────────────────────────────────────────────────────────────
type Filter = "none" | "dark" | "blur" | "rain";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "none", label: "Original" },
  { id: "dark", label: "Low-Light (Night)" },
  { id: "blur", label: "Motion Blur (Highway)" },
  { id: "rain", label: "Rain Glare (Monsoon)" },
];

function applyFilter(ctx: CanvasRenderingContext2D, w: number, h: number, filter: Filter) {
  if (filter === "dark") {
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, w, h);
  } else if (filter === "blur") {
    const data = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = 0.2;
      ctx.drawImage(ctx.canvas, i * 3, 0);
    }
    ctx.globalAlpha = 1;
    ctx.putImageData(data, 0, 0);
    ctx.filter = "blur(2px)";
    ctx.drawImage(ctx.canvas, 2, 1);
    ctx.filter = "none";
  } else if (filter === "rain") {
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 24; i++) {
      const y = Math.random() * h;
      const len = Math.random() * 180 + 50;
      const grd = ctx.createLinearGradient(0, y, len, y + 4);
      grd.addColorStop(0, "rgba(255,255,255,0)");
      grd.addColorStop(0.5, "rgba(255,255,255,0.40)");
      grd.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grd;
      ctx.fillRect(0, y, len, 2);
    }
    ctx.globalAlpha = 1;
  }
}

// ── Canvas renderer ───────────────────────────────────────────────────────────
function drawCanvas(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  detections: Detection[],
  threshold: number,
  filter: Filter
) {
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(image, 0, 0, W, H);

  if (filter !== "none") applyFilter(ctx, W, H, filter);

  const visible = detections.filter((d) => d.confidence >= threshold);
  for (const d of visible) {
    const color = CLASS_COLORS[d.code];
    const bx = d.x1 * W, by = d.y1 * H;
    const bw = (d.x2 - d.x1) * W, bh = (d.y2 - d.y1) * H;

    // Bounding box stroke
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(bx, by, bw, bh);

    // Subtle background tint for damaged area
    ctx.fillStyle = `${color}18`;
    ctx.fillRect(bx, by, bw, bh);

    // Label pill
    const text = `${d.code} ${(d.confidence * 100).toFixed(1)}%`;
    ctx.font = "bold 11px 'JetBrains Mono', monospace";
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = color;
    const px = 6;
    const ly = by - 20;
    ctx.fillRect(bx - 1, ly > 0 ? ly : by + 2, tw + px * 2, 19);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, bx + px - 1, ly > 0 ? ly + 14 : by + 16);
  }
}

// ── Dropzone ──────────────────────────────────────────────────────────────────
function Dropzone({ onFile }: { onFile: (f: File) => void }) {
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const validate = (file: File): string | null => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
      return `Unsupported MIME type: ${file.type}. Accepted: JPG, PNG, WEBP.`;
    if (file.size > 15 * 1024 * 1024)
      return `File too large (${(file.size / 1e6).toFixed(1)} MB). Maximum: 15 MB.`;
    return null;
  };

  const handle = (file: File) => {
    const err = validate(file);
    if (err) { alert(err); return; }
    onFile(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) handle(f);
  };

  async function loadSample(url: string) {
    const res = await fetch(url);
    const blob = await res.blob();
    handle(new File([blob], "sample.jpg", { type: blob.type || "image/jpeg" }));
  }

  return (
    <div className="flex flex-col gap-6">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed px-8 py-16 text-center transition-colors ${
          drag ? "border-primary bg-primary-soft" : "border-line bg-surface hover:border-primary/40 hover:bg-canvas"
        }`}
      >
        <div className="flex size-14 items-center justify-center rounded-xl border border-line bg-canvas">
          <Upload size={24} strokeWidth={1.5} className="text-muted" aria-hidden />
        </div>
        <div>
          <p className="text-sm font-semibold text-ink">Drop a road frame here, or click to browse</p>
          <p className="mt-1 font-mono text-xs text-muted">JPG · PNG · WEBP — max 15 MB</p>
        </div>
        <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.webp" className="sr-only"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handle(f); }} />
      </div>

      {/* Sample photos */}
      <div>
        <p className="mb-3 text-xs font-semibold text-muted uppercase tracking-wider">Quick-select sample road presets</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SAMPLE_PHOTOS.map((s) => (
            <button
              key={s.id}
              onClick={() => loadSample(s.url)}
              className="group relative overflow-hidden rounded-lg border border-line bg-canvas transition-colors hover:border-primary text-left"
            >
              <img src={s.thumb} alt={s.label} className="aspect-video w-full object-cover" />
              <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 to-transparent p-2.5">
                <span className="text-[11px] font-semibold text-white leading-tight">{s.label}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────
function LoadingState({ step }: { step: number }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-line bg-canvas">
        <div className="absolute inset-x-0 top-0 h-0.5 animate-scanline bg-primary/70" />
        <div className="flex h-full items-center justify-center">
          <Loader2 size={32} className="animate-spin text-primary" aria-hidden />
        </div>
      </div>
      <div className="space-y-2.5">
        {STEPS.map((s, i) => (
          <div key={s} className={`flex items-center gap-3 text-sm transition-opacity ${i > step ? "opacity-30" : ""}`}>
            {i < step ? (
              <CheckCircle2 size={16} strokeWidth={1.5} className="text-green-600 shrink-0" aria-hidden />
            ) : i === step ? (
              <Loader2 size={16} strokeWidth={1.5} className="animate-spin text-primary shrink-0" aria-hidden />
            ) : (
              <span className="size-4 shrink-0 rounded-full border border-line" aria-hidden />
            )}
            <span className={i === step ? "font-medium text-ink font-mono text-xs" : "text-muted font-mono text-xs"}>{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Inspect() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<InferenceResult | null>(null);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);
  const [threshold, setThreshold] = useState(0.182);
  const [filter, setFilter] = useState<Filter>("none");
  const [stressOpen, setStressOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [modelMode, setModelMode] = useState<ModelInferenceMode>("ensemble");
  const [fitMode, setFitMode] = useState<"contain" | "actual">("contain");
  const [guideOpen, setGuideOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Redraw canvas on deps change
  useEffect(() => {
    if (!result || !imageEl || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = imageEl.naturalWidth || 1280;
    canvas.height = imageEl.naturalHeight || 720;
    drawCanvas(canvas, imageEl, result.detections, threshold, filter);
  }, [result, imageEl, threshold, filter]);

  const handleFile = useCallback(async (file: File, mode: ModelInferenceMode = modelMode) => {
    setPhase("loading");
    setStep(0);
    setResult(null);
    setImageEl(null);
    setCurrentFile(file);

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });

    setStep(1);
    try {
      const r = await runInference(file, mode, 0.001);
      setStep(2);
      await new Promise((res) => setTimeout(res, 80));
      setStep(3);
      await new Promise((res) => setTimeout(res, 80));
      setResult(r);
      setImageEl(img);
      setPhase("done");
    } catch (err) {
      setErrorMsg((err as Error).message || "Inference failed.");
      setPhase("error");
    }
  }, [modelMode]);

  const reRunMode = (newMode: ModelInferenceMode) => {
    setModelMode(newMode);
    if (currentFile) {
      handleFile(currentFile, newMode);
    }
  };

  const reset = () => {
    setPhase("idle");
    setResult(null);
    setImageEl(null);
    setCurrentFile(null);
    setFilter("none");
  };

  const visible = result ? result.detections.filter((d) => d.confidence >= threshold) : [];
  const rhi = result ? computeRHI(result.detections, threshold) : 100;
  const { label: rhiLbl, color: rhiColor } = rhiLabel(rhi);

  const breakdown = (["D00", "D10", "D20", "D40"] as const).map((code) => ({
    code,
    count: visible.filter((d) => d.code === code).length,
  }));

  return (
    <>
      <PageHeader
        title="Single Inspection Workspace"
        description="Dual-scale YOLO26s (1088px + 640px) with WBF fusion. Classifies longitudinal cracks, transverse cracks, alligator cracking, and potholes."
        actions={
          phase === "done" && (
            <button onClick={reset} className="btn btn-ghost">
              <RefreshCw size={15} strokeWidth={1.5} aria-hidden />
              Inspect New Frame
            </button>
          )
        }
      />

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
        {/* ── Left Column: Canvas & Controls ───────────────────────── */}
        <div className="flex flex-col gap-6">

          {phase === "idle" && <Dropzone onFile={(f) => handleFile(f, modelMode)} />}
          {phase === "loading" && <LoadingState step={step} />}
          {phase === "error" && (
            <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-line bg-surface p-12 text-center">
              <AlertTriangle size={32} strokeWidth={1.5} className="text-red-500" aria-hidden />
              <div>
                <p className="font-semibold text-ink">Inference Error</p>
                <p className="mt-1 max-w-xs text-sm text-muted">{errorMsg}</p>
              </div>
              <button onClick={reset} className="btn btn-ghost">Try another frame</button>
            </div>
          )}

          {phase === "done" && (
            <>
              {/* Inspection Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-2.5 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Model mode selector */}
                  <div className="flex items-center gap-1 border-r border-line pr-3">
                    <span className="font-mono text-xs font-semibold text-muted mr-1">Model:</span>
                    {(
                      [
                        { id: "ensemble", label: "Ensemble (1088 + 640)" },
                        { id: "main_only", label: "Main (1088px)" },
                        { id: "640_only",  label: "640px" },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        onClick={() => reRunMode(m.id)}
                        className={`rounded-sm px-2.5 py-1 font-mono text-xs font-medium transition-colors ${
                          modelMode === m.id
                            ? "bg-primary text-white"
                            : "text-muted hover:bg-canvas hover:text-ink"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  {/* Stress test button */}
                  <button
                    onClick={() => setStressOpen((v) => !v)}
                    className={`inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-semibold transition-colors ${
                      stressOpen ? "bg-primary-soft text-primary" : "text-muted hover:text-ink"
                    }`}
                  >
                    <FlipHorizontal2 size={13} strokeWidth={1.5} aria-hidden />
                    Monsoon Stress-Test
                  </button>

                  {/* Pathology Guide Toggle */}
                  <button
                    onClick={() => setGuideOpen((v) => !v)}
                    className={`inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-semibold transition-colors ${
                      guideOpen ? "bg-primary-soft text-primary" : "text-muted hover:text-ink"
                    }`}
                  >
                    <BookOpen size={13} strokeWidth={1.5} aria-hidden />
                    Damage SVGs
                  </button>
                </div>

                {/* Sizing & Latency Badges */}
                <div className="flex items-center gap-3 font-mono text-xs text-muted">
                  {imageEl && (
                    <span className="hidden sm:inline-block rounded-sm bg-canvas px-2 py-0.5 border border-line">
                      {imageEl.naturalWidth} × {imageEl.naturalHeight} px
                    </span>
                  )}

                  {/* Fit Viewport Toggle */}
                  <button
                    onClick={() => setFitMode((m) => (m === "contain" ? "actual" : "contain"))}
                    className="inline-flex items-center gap-1 text-ink hover:text-primary transition-colors"
                    title={fitMode === "contain" ? "Switch to 100% natural resolution" : "Fit whole image to screen"}
                  >
                    {fitMode === "contain" ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                    <span>{fitMode === "contain" ? "Fit Screen" : "1:1 Zoom"}</span>
                  </button>

                  <div className="flex items-center gap-1 text-ink font-semibold">
                    <Cpu size={13} className="text-primary" />
                    <span>{result?.latencyMs.toFixed(1)} ms</span>
                  </div>
                </div>
              </div>

              {/* Stress test sub-toolbar if open */}
              {stressOpen && (
                <div className="flex items-center gap-2 rounded-lg border border-line bg-canvas p-2.5">
                  <span className="font-mono text-xs text-muted mr-1">Simulated Weather:</span>
                  {FILTERS.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setFilter(f.id)}
                      className={`rounded-sm px-3 py-1 font-mono text-xs font-medium transition-colors ${
                        filter === f.id
                          ? "bg-ink text-white"
                          : "border border-line bg-surface text-muted hover:text-ink"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Main Prediction Canvas Stage (Guaranteed to show fully regardless of size) */}
              <div className="relative flex min-h-[380px] max-h-[72vh] w-full items-center justify-center overflow-auto rounded-xl border border-line bg-slate-950/[0.03] p-3 shadow-inner">
                <canvas
                  ref={canvasRef}
                  className={
                    fitMode === "contain"
                      ? "max-h-[66vh] max-w-full w-auto h-auto object-contain rounded-lg shadow-sm border border-line/40 transition-all"
                      : "max-w-none rounded-lg shadow-sm border border-line/40"
                  }
                  style={{ imageRendering: "auto", display: "block" }}
                />
              </div>

              {/* Expandable Visual Damage Pathology Reference (SVGs) */}
              {guideOpen && (
                <div className="rounded-xl border border-line bg-surface p-5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between border-b border-line pb-3">
                    <div className="flex items-center gap-2">
                      <BookOpen size={16} className="text-primary" />
                      <h3 className="text-sm font-bold text-ink">RDD2020 Pathology Reference SVGs</h3>
                    </div>
                    <span className="font-mono text-xs text-muted">Field Classification Standards</span>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {(["D00", "D10", "D20", "D40"] as const).map((code) => {
                      const item = DAMAGE_SVGS[code];
                      const meta = DAMAGE_CLASSES[code];
                      return (
                        <div key={code} className="flex flex-col rounded-lg border border-line bg-surface p-3 shadow-sm">
                          <div className="overflow-hidden rounded-md border border-line bg-slate-900/[0.03] h-40 relative">
                            <img
                              src={item.svg}
                              alt={meta.label}
                              className={`h-full w-full ${code === "D00" || code === "D10" ? "scale-100 object-contain p-2" : "scale-115 object-cover"}`}
                            />
                          </div>
                          <div className="mt-2.5 flex items-center gap-2">
                            <span className="size-2.5 rounded-sm" style={{ backgroundColor: CLASS_COLORS[code] }} />
                            <span className="font-mono text-xs font-bold text-ink">{code}</span>
                            <span className="text-xs font-medium text-ink truncate">{meta.label}</span>
                          </div>
                          <p className="mt-1 text-[11px] text-muted leading-tight">{item.summary}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Class Legend */}
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-surface p-4">
                <div className="flex flex-wrap gap-4">
                  {(["D00", "D10", "D20", "D40"] as const).map((code) => (
                    <div key={code} className="flex items-center gap-2">
                      <span className="size-2.5 rounded-sm" style={{ backgroundColor: CLASS_COLORS[code] }} aria-hidden />
                      <span className="font-mono text-xs font-bold text-ink">{code}</span>
                      <span className="text-xs text-muted">{DAMAGE_CLASSES[code].label}</span>
                    </div>
                  ))}
                </div>
                <span className="font-mono text-[11px] text-muted">
                  Shown fully in {fitMode === "contain" ? "Adaptive Viewport" : "1:1 Pixel Scale"}
                </span>
              </div>
            </>
          )}
        </div>

        {/* ── Right Column: Telemetry & Controls ───────────────────── */}
        <aside className="flex flex-col gap-6">

          {/* Confidence Slider with Optimal Bookmark */}
          <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders size={15} strokeWidth={1.5} className="text-primary" aria-hidden />
                <span className="text-sm font-semibold text-ink">Confidence Threshold</span>
              </div>
              <span className="font-mono text-sm font-bold text-primary">{threshold.toFixed(3)}</span>
            </div>

            <input
              type="range" min={0.001} max={0.95} step={0.001}
              value={threshold}
              onChange={(e) => setThreshold(parseFloat(e.target.value))}
              className="mt-4 w-full accent-primary"
            />

            <div className="mt-1.5 flex justify-between font-mono text-[11px] text-muted">
              <span>0.001</span>
              <button
                onClick={() => setThreshold(0.182)}
                className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                title="Reset to Kaggle F1-optimal calibrated threshold (0.1821)"
              >
                <Sparkles size={11} /> Calibrated: 0.182
              </button>
              <span>0.950</span>
            </div>
          </div>

          {/* Road Health Index */}
          {phase === "done" && (
            <>
              <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <Info size={15} strokeWidth={1.5} className="text-primary" aria-hidden />
                  <span className="text-sm font-semibold text-ink">Road Health Index (RHI)</span>
                </div>
                <div className="mt-4 flex items-end gap-4">
                  <span className="font-mono text-5xl font-bold" style={{ color: rhiColor }}>{rhi}</span>
                  <div className="pb-1">
                    <span className="rounded-sm px-2 py-0.5 font-mono text-xs font-semibold" style={{ backgroundColor: rhiColor + "18", color: rhiColor }}>
                      {rhiLbl}
                    </span>
                    <p className="mt-1 font-mono text-xs text-muted">score / 100</p>
                  </div>
                </div>
                <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-canvas">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${rhi}%`, backgroundColor: rhiColor }}
                  />
                </div>
              </div>

              {/* Pipeline Telemetry */}
              <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <Layers size={15} strokeWidth={1.5} className="text-primary" aria-hidden />
                  <span className="text-sm font-semibold text-ink">Inference Telemetry</span>
                </div>
                <dl className="space-y-2.5 font-mono text-xs">
                  <div className="flex justify-between">
                    <dt className="text-muted">Inference Mode</dt>
                    <dd className="font-semibold text-ink">{result?.modelMode ?? modelMode}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Latency</dt>
                    <dd className="font-semibold text-ink">{result?.latencyMs.toFixed(1)} ms</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Device / Backend</dt>
                    <dd className="font-semibold text-ink uppercase">
                      {result?.isMock ? "Mock fallback" : result?.device ?? "cpu"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Total Raw Boxes</dt>
                    <dd className="font-semibold text-ink">{result?.detections.length}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Filtered (≥ {threshold.toFixed(2)})</dt>
                    <dd className="font-semibold text-primary">{visible.length}</dd>
                  </div>
                </dl>
              </div>

              {/* Class Breakdown */}
              <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <Eye size={15} strokeWidth={1.5} className="text-primary" aria-hidden />
                  <span className="text-sm font-semibold text-ink">Damage Breakdown</span>
                </div>
                <div className="space-y-3">
                  {breakdown.map(({ code, count }) => {
                    const color = CLASS_COLORS[code];
                    const pct = visible.length > 0 ? (count / visible.length) * 100 : 0;
                    return (
                      <div key={code}>
                        <div className="flex justify-between mb-1">
                          <span className="flex items-center gap-2 font-mono text-xs font-semibold text-ink">
                            <span className="size-2 rounded-sm shrink-0" style={{ backgroundColor: color }} aria-hidden />
                            {code} · {DAMAGE_CLASSES[code].label}
                          </span>
                          <span className="font-mono text-xs text-muted">{count}</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-canvas">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{ width: `${pct}%`, backgroundColor: color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Detected Boxes Table */}
              {visible.length > 0 && (
                <div className="rounded-xl border border-line bg-surface p-4 shadow-sm max-h-64 overflow-y-auto">
                  <p className="mb-2.5 font-mono text-[11px] font-semibold text-muted uppercase tracking-wider">
                    Detected Proposals ({visible.length})
                  </p>
                  <div className="space-y-1.5 font-mono text-[11px]">
                    {visible.slice(0, 15).map((box, idx) => (
                      <div key={idx} className="flex items-center justify-between border-b border-line/60 pb-1">
                        <span className="font-bold" style={{ color: CLASS_COLORS[box.code] }}>{box.code}</span>
                        <span className="text-muted">{(box.confidence * 100).toFixed(1)}%</span>
                        <span className="text-muted text-[10px]">
                          [{box.x1.toFixed(2)}, {box.y1.toFixed(2)}, {box.x2.toFixed(2)}, {box.y2.toFixed(2)}]
                        </span>
                      </div>
                    ))}
                    {visible.length > 15 && (
                      <p className="text-muted text-[10px] text-center pt-1">+ {visible.length - 15} more proposals</p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Model Specification Card */}
          <div className="rounded-xl border border-line bg-surface p-5 shadow-sm font-mono text-xs space-y-2">
            <p className="font-sans font-semibold text-ink text-sm">Ensemble Spec</p>
            <div className="flex justify-between text-muted">
              <span>Primary Model</span>
              <span className="text-ink">yolo26s (1088px)</span>
            </div>
            <div className="flex justify-between text-muted">
              <span>Secondary Model</span>
              <span className="text-ink">yolo26s (640px)</span>
            </div>
            <div className="flex justify-between text-muted">
              <span>Fusion Method</span>
              <span className="text-ink">WBF (weights 1:1)</span>
            </div>
            <div className="flex justify-between text-muted">
              <span>Validation Acc</span>
              <span className="text-green-600 font-bold">48.54%</span>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
