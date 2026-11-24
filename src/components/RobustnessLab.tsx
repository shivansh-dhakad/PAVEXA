import { useCallback, useEffect, useRef, useState } from "react";
import {
  Play, Upload, Sparkles, Loader2,
  AlertTriangle, CheckCircle2, Clock, Activity
} from "lucide-react";
import { runInference } from "../lib/api";
import { SAMPLE_PHOTOS } from "../lib/samples";
import { CLASS_COLORS, computeRHI, rhiLabel, type Detection, type DamageCode } from "../lib/damage";

type VariantType = "original" | "blurred" | "low_light" | "noisy" | "jpeg_compressed";

interface RobustnessVariant {
  id: VariantType;
  title: string;
  description: string;
  filterDescription: string;
  blob?: Blob;
  previewUrl?: string;
  status: "idle" | "running" | "done" | "error";
  latencyMs?: number;
  detections?: Detection[];
  rhi?: number;
  width?: number;
  height?: number;
  error?: string;
}

const INITIAL_VARIANTS: RobustnessVariant[] = [
  {
    id: "original",
    title: "1. Baseline (Original)",
    description: "Standard high-resolution optical camera capture without degradation.",
    filterDescription: "Reference ground truth input",
    status: "idle",
  },
  {
    id: "blurred",
    title: "2. Motion / Vibration Blur",
    description: "Simulates dashcam vehicular vibration and high-speed motion blur.",
    filterDescription: "Gaussian 4.5px spatial smoothing filter",
    status: "idle",
  },
  {
    id: "low_light",
    title: "3. Low-Light / Night",
    description: "Simulates twilight and overcast dusk conditions with underexposed sensors.",
    filterDescription: "35% luminance reduction + slight contrast clamp",
    status: "idle",
  },
  {
    id: "noisy",
    title: "4. Sensor Noise (High ISO)",
    description: "Simulates CMOS thermal noise, grain, and dark-current sensor interference.",
    filterDescription: "Synthetic additive Gaussian pixel noise",
    status: "idle",
  },
  {
    id: "jpeg_compressed",
    title: "5. Aggressive JPEG Compression",
    description: "Simulates edge device bandwidth throttling and 8×8 DCT block artifacts.",
    filterDescription: "Low 8% JPEG quantization quality",
    status: "idle",
  },
];

export default function RobustnessLab() {
  const [selectedSample, setSelectedSample] = useState<string>("/samples/img_000012.jpg");
  const [customImage, setCustomImage] = useState<File | null>(null);
  const [variants, setVariants] = useState<RobustnessVariant[]>(INITIAL_VARIANTS);
  const [isRunningAll, setIsRunningAll] = useState(false);
  const [inspectedVariant, setInspectedVariant] = useState<VariantType | null>("original");
  const uploadInputRef = useRef<HTMLInputElement>(null);

  // Source image ref
  const sourceImgRef = useRef<HTMLImageElement | null>(null);

  // Generate transformed image blob using HTML5 canvas
  const createTransformedBlob = useCallback(
    async (img: HTMLImageElement, type: VariantType): Promise<{ blob: Blob; url: string }> => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || 1280;
      canvas.height = img.naturalHeight || 720;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context creation failed");

      if (type === "original") {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      } else if (type === "blurred") {
        ctx.filter = "blur(4.5px)";
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        ctx.filter = "none";
      } else if (type === "low_light") {
        ctx.filter = "brightness(0.35) contrast(1.15)";
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        ctx.filter = "none";
        // Apply slight dark blue vignette
        ctx.fillStyle = "rgba(10, 15, 30, 0.25)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else if (type === "noisy") {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;
        // Inject random noise
        for (let i = 0; i < data.length; i += 4) {
          const noise = (Math.random() - 0.5) * 65;
          data[i] = Math.min(255, Math.max(0, data[i] + noise));
          data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
          data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
        }
        ctx.putImageData(imgData, 0, 0);
      } else if (type === "jpeg_compressed") {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        // Save as low quality JPEG to bake in 8x8 DCT compression blocking
        const lowJpegUrl = canvas.toDataURL("image/jpeg", 0.08);
        const lowImg = new Image();
        lowImg.src = lowJpegUrl;
        await new Promise((resolve) => {
          lowImg.onload = resolve;
        });
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(lowImg, 0, 0, canvas.width, canvas.height);
      }

      return new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => {
            if (b) {
              const url = URL.createObjectURL(b);
              resolve({ blob: b, url });
            } else {
              reject(new Error("Failed to export blob"));
            }
          },
          type === "jpeg_compressed" ? "image/jpeg" : "image/png",
          type === "jpeg_compressed" ? 0.08 : 0.95
        );
      });
    },
    []
  );

  // Execute full robustness lab benchmark across all 5 versions
  const runRobustnessBenchmark = async () => {
    setIsRunningAll(true);

    // 1. Load source image
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = customImage ? URL.createObjectURL(customImage) : selectedSample;

    await new Promise((resolve) => {
      img.onload = resolve;
    });
    sourceImgRef.current = img;

    const list: VariantType[] = ["original", "blurred", "low_light", "noisy", "jpeg_compressed"];

    // Initialize state to running
    setVariants((prev) =>
      prev.map((v) => ({ ...v, status: "running", error: undefined }))
    );

    for (const vType of list) {
      try {
        const { blob, url } = await createTransformedBlob(img, vType);

        // Run model inference on the transformed image
        const res = await runInference(blob, "ensemble", 0.1821);
        const rhi = computeRHI(res.detections, 0.1821);

        setVariants((prev) =>
          prev.map((v) =>
            v.id === vType
              ? {
                  ...v,
                  blob,
                  previewUrl: url,
                  status: "done",
                  latencyMs: res.latencyMs,
                  detections: res.detections,
                  rhi,
                  width: res.imageWidth,
                  height: res.imageHeight,
                }
              : v
          )
        );
      } catch (err) {
        setVariants((prev) =>
          prev.map((v) =>
            v.id === vType
              ? { ...v, status: "error", error: (err as Error).message }
              : v
          )
        );
      }
    }

    setIsRunningAll(false);
  };

  // Run automatically on first mount
  useEffect(() => {
    runRobustnessBenchmark();
  }, [selectedSample, customImage]);

  const originalVariant = variants.find((v) => v.id === "original");
  const activeInspected = variants.find((v) => v.id === inspectedVariant) || originalVariant;

  return (
    <div className="space-y-6">
      {/* ── Top Header and Sample Selection ── */}
      <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={uploadInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) {
                setCustomImage(e.target.files[0]);
              }
            }}
          />
          <button
            onClick={() => uploadInputRef.current?.click()}
            className="btn btn-ghost border border-line text-xs flex items-center gap-1.5"
          >
            <Upload size={14} /> Upload Custom Road Frame
          </button>

          <div className="flex items-center gap-1.5 overflow-x-auto">
            <span className="text-xs font-mono text-muted flex items-center gap-1">
              <Sparkles size={13} className="text-primary" /> Test Images:
            </span>
            {SAMPLE_PHOTOS.slice(0, 4).map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setCustomImage(null);
                  setSelectedSample(s.url);
                }}
                className={`rounded-lg border px-2.5 py-1 text-xs font-mono transition-all ${
                  !customImage && selectedSample === s.url
                    ? "border-primary bg-primary-soft font-bold text-primary"
                    : "border-line bg-canvas text-muted hover:text-ink"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={runRobustnessBenchmark}
          disabled={isRunningAll}
          className="btn btn-primary text-xs flex items-center gap-2"
        >
          {isRunningAll ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Testing 5 Image Variants...
            </>
          ) : (
            <>
              <Play size={14} />
              Re-Run Robustness Lab
            </>
          )}
        </button>
      </div>

      {/* ── Prominent Scientific Disclosure Banner ── */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs">
        <AlertTriangle size={18} className="shrink-0 text-amber-600 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold text-ink">Empirical Diagnostic Testing Disclosure</p>
          <p className="text-muted leading-relaxed">
            These transformations are engineered specifically for diagnostic sensitivity stress-testing under adverse real-world acquisition conditions (lens blur, nighttime underexposure, thermal sensor noise, and aggressive edge network compression). They are <b>used for testing and evaluation, not presented as proof of invariant robustness</b>. All displayed detection statistics, bounding boxes, and latencies represent actual empirical measurements from the models.
          </p>
        </div>
      </div>

      {/* ── 5-Way Comparison Grid ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {variants.map((v) => {
          const isSelected = inspectedVariant === v.id;
          const detCount = v.detections?.length ?? 0;
          const origDetCount = originalVariant?.detections?.length ?? 0;
          const delta = detCount - origDetCount;

          return (
            <div
              key={v.id}
              onClick={() => setInspectedVariant(v.id)}
              className={`cursor-pointer rounded-2xl border p-3.5 transition-all flex flex-col justify-between ${
                isSelected
                  ? "border-primary bg-surface shadow-md ring-2 ring-primary/20"
                  : "border-line bg-surface hover:border-primary/40 hover:bg-canvas"
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-ink">{v.title}</span>
                  {v.status === "running" && <Loader2 size={13} className="animate-spin text-primary" />}
                  {v.status === "done" && <CheckCircle2 size={13} className="text-green-600" />}
                </div>
                <p className="mt-1 text-[11px] text-muted line-clamp-2">{v.description}</p>

                {/* Transformed Thumbnail */}
                <div className="relative mt-3 aspect-video w-full overflow-hidden rounded-lg border border-line bg-canvas">
                  {v.previewUrl ? (
                    <img src={v.previewUrl} alt={v.title} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted font-mono text-[10px]">
                      Rendering...
                    </div>
                  )}
                  {v.latencyMs !== undefined && (
                    <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-white backdrop-blur-sm">
                      {v.latencyMs.toFixed(1)} ms
                    </span>
                  )}
                </div>
              </div>

              {/* Metrics Box */}
              <div className="mt-3 pt-3 border-t border-line space-y-1.5 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted text-[11px]">Detections:</span>
                  <div className="flex items-center gap-1">
                    <span className="font-bold text-ink">{detCount} boxes</span>
                    {v.id !== "original" && (
                      <span
                        className={`text-[10px] font-bold ${
                          delta === 0 ? "text-muted" : delta < 0 ? "text-red-500" : "text-amber-600"
                        }`}
                      >
                        ({delta > 0 ? `+${delta}` : delta})
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-muted text-[11px]">RHI Score:</span>
                  <span
                    className="font-bold"
                    style={{ color: v.rhi !== undefined ? rhiLabel(v.rhi).color : "#64748b" }}
                  >
                    {v.rhi !== undefined ? `${v.rhi}/100` : "—"}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[10px] text-muted">
                  <span>Latency:</span>
                  <span>{v.latencyMs !== undefined ? `${v.latencyMs.toFixed(1)} ms` : "—"}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Detailed Inspector for Selected Variant ── */}
      {activeInspected && (
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-line pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-primary uppercase tracking-wider">
                  Active Inspector View
                </span>
                <span className="rounded bg-canvas px-2 py-0.5 font-mono text-[11px] text-muted border border-line">
                  {activeInspected.filterDescription}
                </span>
              </div>
              <h3 className="text-lg font-bold text-ink mt-0.5">{activeInspected.title}</h3>
            </div>

            <div className="flex items-center gap-3 font-mono text-xs">
              <div className="flex items-center gap-1.5 rounded-lg border border-line bg-canvas px-3 py-1.5">
                <Clock size={13} className="text-primary" />
                <span className="text-muted">Inference:</span>
                <span className="font-bold text-ink">
                  {activeInspected.latencyMs ? `${activeInspected.latencyMs.toFixed(1)} ms` : "—"}
                </span>
              </div>

              <div className="flex items-center gap-1.5 rounded-lg border border-line bg-canvas px-3 py-1.5">
                <Activity size={13} className="text-primary" />
                <span className="text-muted">Detections:</span>
                <span className="font-bold text-ink">
                  {activeInspected.detections?.length ?? 0}
                </span>
              </div>
            </div>
          </div>

          {/* Large Image Preview with Bounding Box Overlay Canvas */}
          <div className="relative aspect-video max-h-[520px] w-full overflow-hidden rounded-xl border border-line bg-black flex items-center justify-center">
            {activeInspected.previewUrl && (
              <VariantCanvasViewer
                imageUrl={activeInspected.previewUrl}
                detections={activeInspected.detections ?? []}
              />
            )}
          </div>

          {/* Damage Detections Breakdown List */}
          <div className="grid gap-3 sm:grid-cols-4 pt-2">
            {(["D00", "D10", "D20", "D40"] as DamageCode[]).map((code) => {
              const count =
                activeInspected.detections?.filter((d) => d.code === code).length ?? 0;
              const color = CLASS_COLORS[code];
              return (
                <div
                  key={code}
                  className="flex items-center justify-between rounded-xl border border-line bg-canvas p-3 font-mono text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="size-2.5 rounded-sm" style={{ backgroundColor: color }} />
                    <span className="font-bold text-ink">{code}</span>
                  </div>
                  <span className="font-bold text-ink">{count} boxes</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** Internal Canvas Viewer to render bounding boxes over transformed image */
function VariantCanvasViewer({
  imageUrl,
  detections,
}: {
  imageUrl: string;
  detections: Detection[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageUrl;

    img.onload = () => {
      canvas.width = img.naturalWidth || 1280;
      canvas.height = img.naturalHeight || 720;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Draw bounding boxes
      for (const d of detections) {
        const color = CLASS_COLORS[d.code] || "#dc2626";
        const bx = d.x1 * canvas.width;
        const by = d.y1 * canvas.height;
        const bw = (d.x2 - d.x1) * canvas.width;
        const bh = (d.y2 - d.y1) * canvas.height;

        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.strokeRect(bx, by, bw, bh);

        ctx.fillStyle = `${color}20`;
        ctx.fillRect(bx, by, bw, bh);

        // Label pill
        const label = `${d.code} ${(d.confidence * 100).toFixed(1)}%`;
        ctx.font = "bold 13px 'JetBrains Mono', monospace";
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = color;
        ctx.fillRect(bx, by - 22 > 0 ? by - 22 : by, tw + 10, 22);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(label, bx + 5, by - 22 > 0 ? by - 6 : by + 16);
      }
    };
  }, [imageUrl, detections]);

  return (
    <canvas
      ref={canvasRef}
      className="max-h-full max-w-full object-contain rounded-lg"
    />
  );
}
