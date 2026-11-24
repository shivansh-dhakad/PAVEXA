import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Camera, Upload, Sliders,
  Loader2, Eye, FlipHorizontal2,
  Cpu, Sparkles, Maximize2, Minimize2, Video, Film,
  Play, Pause, Download,
  CheckCheck, FolderArchive,
  HardDrive,
  FileText, BarChart2, MousePointerClick, Crosshair
} from "lucide-react";
import JSZip from "jszip";
import { DAMAGE_CLASSES, CLASS_COLORS, computeRHI, rhiLabel, type Detection, type DamageCode } from "../lib/damage";
import { runInference, type InferenceResult, type ModelInferenceMode } from "../lib/api";
import { SAMPLE_PHOTOS } from "../lib/samples";
import { persistInspectionRecord } from "../lib/database";
import PageHeader from "../components/PageHeader";
import DetectionInspector, { type DetectionWithId } from "../components/DetectionInspector";
import InspectionReportModal from "../components/InspectionReportModal";
import DamageAnalytics from "../components/DamageAnalytics";

type PredictionTab = "single" | "batch" | "video";

// ── Shared Types ─────────────────────────────────────────────────────────────
interface BatchItem {
  id: string;
  name: string;
  file: File | Blob;
  previewUrl: string;
  status: "queued" | "running" | "done" | "error";
  detections?: Detection[];
  latencyMs?: number;
  width?: number;
  height?: number;
  rhi?: number;
  error?: string;
}

interface VideoFrameResult {
  frameIdx: number;
  timestamp: number;
  timeFormatted: string;
  detections: Detection[];
  rhi: number;
  latencyMs: number;
  thumbnailUrl?: string;
}

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

function drawCanvasBoxes(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement | HTMLVideoElement,
  detections: Detection[],
  threshold: number,
  filter: Filter = "none"
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
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

// Format seconds into MM:SS.S
function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 10);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms}`;
}

export default function Predictions() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialMode = (searchParams.get("mode") as PredictionTab) || "single";
  const [activeTab, setActiveTab] = useState<PredictionTab>(initialMode);

  // Sync activeTab when URL param changes (e.g. dashboard deep-links)
  useEffect(() => {
    const mode = (searchParams.get("mode") as PredictionTab) || "single";
    if (["single", "batch", "video"].includes(mode)) {
      setActiveTab(mode);
    }
  }, [searchParams]);

  // Sync tab with URL
  const switchTab = (tab: PredictionTab) => {
    setActiveTab(tab);
    setSearchParams({ mode: tab }, { replace: true });
  };

  return (
    <div className="space-y-8 pb-16">
      <PageHeader
        title="PAVEXA Prediction Engine"
        description="See the damage. Understand the road. Improve the journey — run pavement inspections across single frames, ZIP archives, or dashcam video streams."
        actions={
          <div className="flex items-center gap-1.5 rounded-xl border border-line bg-canvas p-1 shadow-sm">
            <button
              onClick={() => switchTab("single")}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
                activeTab === "single"
                  ? "bg-surface text-primary shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              <Camera size={14} strokeWidth={1.7} />
              Single Image
            </button>

            <button
              onClick={() => switchTab("batch")}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
                activeTab === "batch"
                  ? "bg-surface text-primary shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              <FolderArchive size={14} strokeWidth={1.7} />
              Batch ZIP
            </button>

            <button
              onClick={() => switchTab("video")}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
                activeTab === "video"
                  ? "bg-surface text-primary shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              <Video size={14} strokeWidth={1.7} />
              Video Stream
            </button>
          </div>
        }
      />

      {/* ── Active Module View ── */}
      {activeTab === "single" && <SingleImageSection />}
      {activeTab === "batch" && <BatchZipSection />}
      {activeTab === "video" && <VideoStreamSection />}
    </div>
  );
}

// =============================================================================
// OPTION 1: SINGLE IMAGE INSPECTION (Upload + Camera Capture + Mock Presets)
// =============================================================================
function SingleImageSection() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [phase, setPhase] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<InferenceResult | null>(null);
  const [threshold, setThreshold] = useState<number>(0.1821);
  const [filter, setFilter] = useState<Filter>("none");
  const [fitMode, setFitMode] = useState<"contain" | "actual">("contain");
  const [modelMode, setModelMode] = useState<ModelInferenceMode>("ensemble");

  // Detailed detection inspector & inspection report modal & analytics view states
  const [selectedDetection, setSelectedDetection] = useState<DetectionWithId | null>(null);
  const [showReportModal, setShowReportModal] = useState<boolean>(false);
  const [showAnalytics, setShowAnalytics] = useState<boolean>(true);

  // Camera Capture state
  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgElementRef = useRef<HTMLImageElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  // Stop camera helper
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  // Start camera
  const startCamera = async () => {
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
    } catch {
      alert("Unable to access camera. Please check browser permissions or ensure no other app is using it.");
    }
  };

  // Flip camera
  const flipCamera = () => {
    const next = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
  };

  useEffect(() => {
    if (cameraActive) {
      startCamera();
    }
  }, [facingMode]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // Capture frame from webcam
  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) return;
      stopCamera();
      const url = URL.createObjectURL(blob);
      setImageSrc(url);
      setFileName(`camera_capture_${Date.now()}.jpg`);
      triggerInference(blob, url);
    }, "image/jpeg", 0.95);
  };

  // Run inference
  const triggerInference = useCallback(async (f: File | Blob, url: string) => {
    setPhase("loading");
    setErrorMsg(null);
    try {
      const res = await runInference(f, modelMode, 0.001);
      setResult(res);

      // Record in database
      persistInspectionRecord({
        image_id: fileName || `capture_${Date.now()}.jpg`,
        latency_ms: res.latencyMs,
        detections: res.detections,
        rhi: computeRHI(res.detections, 0.1821),
        thumbnail_url: url,
        location_name: "Active Survey Frame",
        source_mode: "single",
      });

      const img = new Image();
      img.src = url;
      img.onload = () => {
        imgElementRef.current = img;
        if (canvasRef.current) {
          canvasRef.current.width = img.naturalWidth;
          canvasRef.current.height = img.naturalHeight;
          drawCanvasBoxes(canvasRef.current, img, res.detections, threshold, filter);
        }
        setPhase("done");
      };
    } catch (err) {
      setErrorMsg((err as Error).message ?? "Inference execution failed.");
      setPhase("error");
    }
  }, [modelMode, threshold, filter]);

  // Re-render canvas when threshold or filter changes
  useEffect(() => {
    if (imgElementRef.current && canvasRef.current && result) {
      drawCanvasBoxes(canvasRef.current, imgElementRef.current, result.detections, threshold, filter);
    }
  }, [threshold, filter, result]);

  // Handle uploaded file
  const handleFileUpload = (f: File) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) {
      alert("Unsupported file format. Please upload JPG, PNG, or WEBP.");
      return;
    }
    const url = URL.createObjectURL(f);
    setImageSrc(url);
    setFileName(f.name);
    triggerInference(f, url);
  };

  // Handle mock sample selection
  const handleSampleSelect = async (url: string, name: string) => {
    setPhase("loading");
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      setImageSrc(url);
      setFileName(name);
      triggerInference(blob, url);
    } catch {
      alert("Failed to load sample image.");
      setPhase("idle");
    }
  };

  const visibleDetections = (result?.detections ?? []).filter((d) => d.confidence >= threshold);
  const detectionsWithId: DetectionWithId[] = visibleDetections.map((d, i) => ({
    ...d,
    id: `DET-${(i + 1).toString().padStart(2, "0")}`,
  }));

  const rhi = result ? computeRHI(result.detections, threshold) : 100;
  const { label: rhiStatus, color: rhiColor } = rhiLabel(rhi);

  // Click canvas to select and inspect bounding box
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !result || detectionsWithId.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const clickY = (e.clientY - rect.top) * (canvas.height / rect.height);

    // Search top-most bounding box
    const hit = [...detectionsWithId].reverse().find((d) => {
      const bx1 = d.x1 * canvas.width;
      const by1 = d.y1 * canvas.height;
      const bx2 = d.x2 * canvas.width;
      const by2 = d.y2 * canvas.height;
      return clickX >= bx1 && clickX <= bx2 && clickY >= by1 && clickY <= by2;
    });

    if (hit) {
      setSelectedDetection(hit);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Top Bar: Input Controls, Export Dossier, & Mock Presets ── */}
      <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {/* Upload Button */}
          <input
            ref={uploadInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) handleFileUpload(e.target.files[0]);
            }}
          />
          <button
            onClick={() => uploadInputRef.current?.click()}
            className="btn btn-primary"
          >
            <Upload size={15} strokeWidth={1.5} />
            Upload Image
          </button>

          {/* Camera Button */}
          <button
            onClick={() => {
              if (cameraActive) stopCamera();
              else startCamera();
            }}
            className={`btn ${cameraActive ? "btn-danger" : "btn-ghost"}`}
          >
            <Camera size={15} strokeWidth={1.5} />
            {cameraActive ? "Close Camera" : "Click Picture"}
          </button>

          {/* Model Selector */}
          <div className="flex items-center gap-1.5 rounded-sm border border-line bg-canvas px-2.5 py-1 text-xs font-mono">
            <Cpu size={13} className="text-primary" />
            <select
              value={modelMode}
              onChange={(e) => setModelMode(e.target.value as ModelInferenceMode)}
              className="bg-transparent font-medium text-ink outline-none cursor-pointer"
            >
              <option value="ensemble">Dual-Scale Ensemble (1088 + 640px)</option>
              <option value="main_only">Primary Model Only (1088px)</option>
              <option value="640_only">Secondary Model Only (640px)</option>
            </select>
          </div>

          {/* Downloadable Inspection Reports Button */}
          {result && (
            <button
              onClick={() => setShowReportModal(true)}
              className="btn btn-primary bg-emerald-600 hover:bg-emerald-700 text-white text-xs flex items-center gap-1.5 shadow-sm"
              title="Generate downloadable PDF / CSV inspection report"
            >
              <FileText size={14} />
              <span>Export Report (PDF/CSV)</span>
            </button>
          )}

          {/* Toggle Damage Analytics View */}
          {result && (
            <button
              onClick={() => setShowAnalytics(!showAnalytics)}
              className={`btn text-xs flex items-center gap-1.5 border transition-all ${
                showAnalytics
                  ? "bg-primary text-white border-primary shadow-sm"
                  : "btn-ghost border-line text-ink hover:bg-canvas"
              }`}
              title="Toggle comprehensive 6-metric Damage Analysis with 5 interactive charts"
            >
              <BarChart2 size={14} />
              <span>{showAnalytics ? "Hide Analytics" : "Damage Analysis"}</span>
            </button>
          )}
        </div>

        {/* Mock Test Presets */}
        <div className="flex items-center gap-2 overflow-x-auto">
          <span className="shrink-0 text-xs font-semibold text-muted font-mono flex items-center gap-1">
            <Sparkles size={13} className="text-primary" /> Mock Tests:
          </span>
          {SAMPLE_PHOTOS.slice(0, 4).map((s) => (
            <button
              key={s.id}
              onClick={() => handleSampleSelect(s.url, s.label)}
              className="shrink-0 rounded-lg border border-line bg-canvas px-2.5 py-1 text-xs font-medium text-ink hover:border-primary/50 hover:bg-primary-soft/50 transition-colors"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Camera Viewfinder Modal/Drawer ── */}
      {cameraActive && (
        <div className="relative overflow-hidden rounded-2xl border border-line bg-slate-950 p-6 text-white shadow-xl">
          <div className="flex items-center justify-between pb-4 border-b border-white/10">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="size-2.5 rounded-full bg-red-500 animate-pulse" />
              Live Webcam Viewfinder
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={flipCamera}
                className="btn btn-ghost text-white hover:bg-white/10 text-xs flex items-center gap-1"
              >
                <FlipHorizontal2 size={14} /> Flip Camera
              </button>
              <button
                onClick={stopCamera}
                className="btn btn-ghost text-white hover:bg-white/10 text-xs"
              >
                Cancel
              </button>
            </div>
          </div>

          <div className="relative mt-4 aspect-video max-h-[500px] w-full overflow-hidden rounded-xl bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
            />
            {/* Viewfinder reticle overlay */}
            <div className="pointer-events-none absolute inset-12 rounded-xl border border-dashed border-white/40 flex items-center justify-center">
              <span className="font-mono text-xs text-white/70 bg-black/50 px-2 py-1 rounded">
                Align Road Surface Inside Frame
              </span>
            </div>
          </div>

          <div className="mt-4 flex justify-center">
            <button
              onClick={capturePhoto}
              className="flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 font-semibold text-white shadow-lg hover:bg-primary/90 transition-all text-sm"
            >
              <Camera size={16} /> Capture Frame & Inspect
            </button>
          </div>
        </div>
      )}

      {/* ── Main Workspace: Left Canvas (65%) | Right Telemetry (35%) ── */}
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Canvas Display Viewport */}
        <div className="relative flex flex-col rounded-2xl border border-line bg-surface shadow-sm overflow-hidden min-h-[520px]">
          {/* Canvas Sub-Header */}
          <div className="flex items-center justify-between border-b border-line px-5 py-3 bg-canvas/40">
            <div className="flex items-center gap-2 truncate">
              <span className="font-mono text-xs font-semibold text-muted truncate">
                {fileName || "No Image Loaded"}
              </span>
              {result && (
                <span className="rounded bg-primary-soft px-2 py-0.5 font-mono text-[11px] font-semibold text-primary">
                  {result.imageWidth}×{result.imageHeight} px
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* Contain / Actual Fit Toggle */}
              <button
                onClick={() => setFitMode((m) => (m === "contain" ? "actual" : "contain"))}
                className="btn btn-ghost text-xs p-1.5"
                title={fitMode === "contain" ? "Switch to 1:1 Actual Size" : "Fit inside window"}
              >
                {fitMode === "contain" ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
                <span className="hidden sm:inline font-mono">{fitMode === "contain" ? "Fit View" : "Actual 1:1"}</span>
              </button>

              {/* Stress Test Filter Pill */}
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as Filter)}
                className="rounded-md border border-line bg-surface px-2 py-1 text-xs font-mono text-muted cursor-pointer"
              >
                {FILTERS.map((f) => (
                  <option key={f.id} value={f.id}>
                    Filter: {f.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Canvas Center Area */}
          <div className="relative flex-1 flex items-center justify-center p-4 bg-slate-950/[0.03] overflow-auto">
            {phase === "loading" && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-surface/85 backdrop-blur-sm">
                <Loader2 size={36} className="animate-spin text-primary" />
                <p className="mt-3 font-mono text-xs font-semibold text-ink">Running Dual-Scale Ensemble Inference...</p>
                <p className="mt-1 font-mono text-[11px] text-muted">Primary 1088px + Secondary 640px · WBF Consensus</p>
              </div>
            )}

            {phase === "error" && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-surface/90 p-6 text-center">
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-mono text-red-600 max-w-md">
                  <p className="font-bold">Inference Error</p>
                  <p className="mt-1">{errorMsg || "An unexpected error occurred during prediction."}</p>
                </div>
              </div>
            )}

            {imageSrc ? (
              <div className={`relative ${fitMode === "contain" ? "flex items-center justify-center max-h-[66vh] w-full" : "w-auto"}`}>
                <canvas
                  ref={canvasRef}
                  onClick={handleCanvasClick}
                  className={`rounded-lg shadow-md ${
                    detectionsWithId.length > 0 ? "cursor-crosshair" : "cursor-default"
                  } ${
                    fitMode === "contain"
                      ? "max-h-[66vh] max-w-full object-contain"
                      : "max-w-none"
                  }`}
                />
                {detectionsWithId.length > 0 && (
                  <div className="absolute bottom-3 left-3 z-10 flex items-center gap-1.5 rounded-full bg-slate-900/80 px-3 py-1 font-mono text-[11px] text-white shadow-lg backdrop-blur-md pointer-events-none">
                    <MousePointerClick size={12} className="text-primary animate-pulse" />
                    <span>Click any box or list item to inspect region details</span>
                  </div>
                )}
              </div>
            ) : (
              /* Empty Dropzone State */
              <div
                onClick={() => uploadInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files[0]) handleFileUpload(e.dataTransfer.files[0]);
                }}
                className="flex flex-col items-center justify-center text-center p-12 cursor-pointer border-2 border-dashed border-line rounded-xl hover:border-primary/50 hover:bg-primary-soft/10 transition-all max-w-md"
              >
                <div className="flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                  <Upload size={24} />
                </div>
                <h3 className="mt-4 text-base font-bold text-ink">Upload or Drop Road Image</h3>
                <p className="mt-1 text-xs text-muted max-w-xs">
                  Supports JPG, PNG, or WEBP up to 15MB. Or use the camera button or mock presets above.
                </p>
                <button className="mt-4 btn btn-primary text-xs">
                  Choose File
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Telemetry Column */}
        <div className="space-y-5">
          {/* Road Health Index Card */}
          <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">Road Health Index</span>
              <span
                className="rounded-full px-2.5 py-0.5 font-mono text-xs font-bold"
                style={{ backgroundColor: `${rhiColor}18`, color: rhiColor }}
              >
                {rhiStatus}
              </span>
            </div>

            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-mono text-4xl font-extrabold text-ink">{rhi}</span>
              <span className="font-mono text-sm text-muted">/ 100</span>
            </div>

            {/* Health Meter Progress Bar */}
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-canvas">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${rhi}%`,
                  backgroundColor: rhiColor,
                }}
              />
            </div>
            <p className="mt-2 text-[11px] text-muted">
              Computed from aggregate damage area weighted by structural severity tiers (100 = Pristine).
            </p>
          </div>

          {/* Confidence Slider Card */}
          <div className="rounded-xl border border-line bg-surface p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <label htmlFor="conf-slider" className="text-xs font-semibold text-ink flex items-center gap-1.5">
                <Sliders size={13} className="text-primary" /> Confidence Threshold
              </label>
              <span className="font-mono text-xs font-bold text-primary">
                {(threshold * 100).toFixed(1)}%
              </span>
            </div>

            <input
              id="conf-slider"
              type="range"
              min="0.001"
              max="0.95"
              step="0.005"
              value={threshold}
              onChange={(e) => setThreshold(parseFloat(e.target.value))}
              className="w-full accent-primary cursor-pointer"
            />

            <div className="flex items-center justify-between text-[11px] font-mono text-muted">
              <span>0.1% (Dense)</span>
              <button
                onClick={() => setThreshold(0.1821)}
                className="text-primary hover:underline font-semibold"
                title="Kaggle validation optimal tau"
              >
                Opt: 18.2%
              </button>
              <span>95.0% (Strict)</span>
            </div>
          </div>

          {/* Detections Summary Table */}
          <div className="rounded-xl border border-line bg-surface p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted">Active Detections</h4>
              <span className="font-mono text-xs font-bold text-ink">
                {visibleDetections.length} boxes
              </span>
            </div>

            <div className="space-y-2">
              {(["D00", "D10", "D20", "D40"] as DamageCode[]).map((code) => {
                const count = visibleDetections.filter((d) => d.code === code).length;
                const meta = DAMAGE_CLASSES[code];
                return (
                  <div key={code} className="flex items-center justify-between font-mono text-xs">
                    <div className="flex items-center gap-2">
                      <span className="size-2.5 rounded-sm" style={{ backgroundColor: CLASS_COLORS[code] }} />
                      <span className="font-semibold text-ink">{code}</span>
                      <span className="font-sans text-muted text-[11px]">{meta.label}</span>
                    </div>
                    <span className="font-bold text-ink">{count}</span>
                  </div>
                );
              })}
            </div>

            {/* Interactive Identified Objects List */}
            {detectionsWithId.length > 0 && (
              <div className="mt-3 pt-3 border-t border-line space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-muted">
                    Detected Objects ({detectionsWithId.length})
                  </span>
                  <span className="font-mono text-[10px] text-muted">Click to inspect</span>
                </div>
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {detectionsWithId.map((d) => {
                    const color = CLASS_COLORS[d.code];
                    const isSelected = selectedDetection?.id === d.id;
                    return (
                      <button
                        key={d.id}
                        onClick={() => setSelectedDetection(d)}
                        className={`w-full flex items-center justify-between rounded-lg border p-2 text-xs transition-all text-left ${
                          isSelected
                            ? "border-primary bg-primary-soft/50 shadow-sm"
                            : "border-line bg-canvas/60 hover:border-primary/40 hover:bg-canvas"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-[11px] text-primary">
                            {d.id}
                          </span>
                          <span
                            className="rounded px-1.5 py-0.5 font-mono text-[10px] font-bold text-white shadow-xs"
                            style={{ backgroundColor: color }}
                          >
                            {d.code}
                          </span>
                          <span className="font-sans text-[11px] text-muted truncate max-w-[100px]">
                            {DAMAGE_CLASSES[d.code].label}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[11px] font-bold text-ink">
                            {(d.confidence * 100).toFixed(1)}%
                          </span>
                          <Crosshair size={12} className="text-muted group-hover:text-primary" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Inference Telemetry Pill */}
            {result && (
              <div className="mt-4 pt-3 border-t border-line font-mono text-[11px] text-muted space-y-1">
                <div className="flex justify-between">
                  <span>Latency:</span>
                  <span className="font-semibold text-ink">{result.latencyMs.toFixed(1)} ms</span>
                </div>
                <div className="flex justify-between">
                  <span>Model Mode:</span>
                  <span className="font-semibold text-ink">{result.modelMode || "Ensemble"}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Comprehensive Damage Analysis Section ── */}
      {result && showAnalytics && (
        <div className="mt-8 pt-6 border-t border-line">
          <DamageAnalytics
            detections={result.detections}
            threshold={threshold}
            imageWidth={result.imageWidth}
            imageHeight={result.imageHeight}
            rhi={rhi}
            latencyMs={result.latencyMs}
          />
        </div>
      )}

      {/* ── Detailed Detection Region Inspector Modal ── */}
      {selectedDetection && (
        <DetectionInspector
          detection={selectedDetection}
          imageElement={imgElementRef.current}
          imageWidth={result?.imageWidth || 1920}
          imageHeight={result?.imageHeight || 1080}
          onClose={() => setSelectedDetection(null)}
        />
      )}

      {/* ── Downloadable Inspection Reports Modal (PDF/CSV) ── */}
      {showReportModal && (
        <InspectionReportModal
          fileName={fileName || "pavement_survey.jpg"}
          rawImageUrl={imageSrc}
          annotatedCanvas={canvasRef.current}
          detections={result?.detections ?? []}
          threshold={threshold}
          latencyMs={result?.latencyMs ?? 0}
          modelMode={result?.modelMode ?? "Dual-Scale Ensemble"}
          imageWidth={result?.imageWidth ?? 1920}
          imageHeight={result?.imageHeight ?? 1080}
          onClose={() => setShowReportModal(false)}
        />
      )}
    </div>
  );
}

// =============================================================================
// OPTION 2: BATCH PROCESSING (Whole ZIP file of images)
// =============================================================================
function BatchZipSection() {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [zipName, setZipName] = useState<string>("");
  const [unzipping, setUnzipping] = useState(false);
  const [running, setRunning] = useState(false);
  const [inspectModalItem, setInspectModalItem] = useState<BatchItem | null>(null);
  const [batchMode, setBatchMode] = useState<ModelInferenceMode>("ensemble");
  const zipInputRef = useRef<HTMLInputElement>(null);

  // Unzip uploaded .zip archive using JSZip
  const handleZipFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".zip")) {
      alert("Please upload a .zip archive.");
      return;
    }

    setUnzipping(true);
    setZipName(file.name);
    try {
      const zip = new JSZip();
      const loadedZip = await zip.loadAsync(file);

      const newItems: BatchItem[] = [];
      const imageExtensions = [".jpg", ".jpeg", ".png", ".webp"];

      // Traverse all entries
      const entries = Object.keys(loadedZip.files).filter((path) => {
        const lower = path.toLowerCase();
        return (
          !loadedZip.files[path].dir &&
          !lower.includes("__macosx") &&
          !lower.includes(".ds_store") &&
          imageExtensions.some((ext) => lower.endsWith(ext))
        );
      });

      for (const path of entries) {
        const entry = loadedZip.files[path];
        const blob = await entry.async("blob");
        const cleanName = path.split("/").pop() || path;
        const previewUrl = URL.createObjectURL(blob);

        newItems.push({
          id: `${cleanName}-${Date.now()}-${Math.random()}`,
          name: cleanName,
          file: blob,
          previewUrl,
          status: "queued",
        });
      }

      setItems(newItems);
      setUnzipping(false);
    } catch (err) {
      alert(`Error reading ZIP archive: ${(err as Error).message}`);
      setUnzipping(false);
    }
  };

  // 1-Click Load Sample ZIP file
  const loadSampleZip = async () => {
    setUnzipping(true);
    setZipName("rdd2020_sample_batch.zip");
    try {
      const res = await fetch("/samples/rdd2020_sample_batch.zip");
      const blob = await res.blob();
      const file = new File([blob], "rdd2020_sample_batch.zip", { type: "application/zip" });
      await handleZipFile(file);
    } catch {
      alert("Failed to load sample ZIP file.");
      setUnzipping(false);
    }
  };

  // Run Batch sequential inference
  const executeBatch = async () => {
    if (running || items.length === 0) return;
    setRunning(true);

    for (const item of items) {
      if (item.status === "done") continue;
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: "running" } : i)));

      try {
        const res = await runInference(item.file, batchMode, 0.001);
        const rhi = computeRHI(res.detections, 0.1821);

        persistInspectionRecord({
          image_id: item.name,
          latency_ms: res.latencyMs,
          detections: res.detections,
          rhi,
          thumbnail_url: item.previewUrl,
          location_name: "Batch ZIP Archive",
          source_mode: "batch",
        });

        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? {
                  ...i,
                  status: "done",
                  detections: res.detections,
                  latencyMs: res.latencyMs,
                  width: res.imageWidth,
                  height: res.imageHeight,
                  rhi,
                }
              : i
          )
        );
      } catch (err) {
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: "error", error: (err as Error).message } : i))
        );
      }
    }
    setRunning(false);
  };

  // Kaggle submission CSV builder
  const exportKaggleCSV = () => {
    const rows = ["image_id,PredictionString"];
    for (const item of items) {
      if (item.status !== "done") continue;
      const dets = item.detections ?? [];
      if (dets.length === 0) {
        rows.push(`${item.name},none`);
      } else {
        const W = item.width || 1280;
        const H = item.height || 720;
        const sortedDets = [...dets]
          .sort((a, b) => b.confidence - a.confidence)
          .slice(0, 100);

        const parts = sortedDets.map((d) => {
          const conf = d.confidence.toFixed(6);
          const x1 = (d.x1 * W).toFixed(1);
          const y1 = (d.y1 * H).toFixed(1);
          const x2 = (d.x2 * W).toFixed(1);
          const y2 = (d.y2 * H).toFixed(1);
          return `${d.code} ${conf} ${x1} ${y1} ${x2} ${y2}`;
        });
        rows.push(`${item.name},${parts.join(" ")}`);
      }
    }

    const csvContent = rows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "submission.csv";
    a.click();
  };

  const doneCount = items.filter((i) => i.status === "done").length;
  const totalCount = items.length;
  const progressPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const damagedCount = items.filter((i) => (i.detections ?? []).some((d) => d.confidence >= 0.1821)).length;

  return (
    <div className="space-y-6">
      {/* ── ZIP Upload & Controls Bar ── */}
      <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={zipInputRef}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) handleZipFile(e.target.files[0]);
            }}
          />
          <button
            onClick={() => zipInputRef.current?.click()}
            className="btn btn-primary"
          >
            <FolderArchive size={15} strokeWidth={1.5} />
            Upload ZIP Archive
          </button>

          <button
            onClick={loadSampleZip}
            className="btn btn-ghost"
          >
            <HardDrive size={15} strokeWidth={1.5} />
            Load Sample ZIP (5 Road Frames)
          </button>

          {/* Model Selector */}
          <div className="flex items-center gap-1.5 rounded-sm border border-line bg-canvas px-2.5 py-1 text-xs font-mono">
            <Cpu size={13} className="text-primary" />
            <select
              value={batchMode}
              onChange={(e) => setBatchMode(e.target.value as ModelInferenceMode)}
              className="bg-transparent font-medium text-ink outline-none cursor-pointer"
            >
              <option value="ensemble">Dual-Scale Ensemble (1088 + 640px)</option>
              <option value="main_only">Primary 1088px Only</option>
              <option value="640_only">Secondary 640px Only</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <button
              onClick={executeBatch}
              disabled={running}
              className="btn btn-primary bg-green-600 hover:bg-green-700 text-white"
            >
              {running ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Processing Queue...
                </>
              ) : (
                <>
                  <Play size={14} /> Run Batch Inference
                </>
              )}
            </button>
          )}

          {doneCount > 0 && (
            <button
              onClick={exportKaggleCSV}
              className="btn btn-ghost border-primary/30 text-primary font-mono text-xs"
            >
              <Download size={14} /> Export submission.csv
            </button>
          )}
        </div>
      </div>

      {/* ── ZIP Status / Progress Bar ── */}
      {unzipping && (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 shadow-sm">
          <Loader2 size={18} className="animate-spin text-primary" />
          <span className="font-mono text-xs font-semibold text-ink">
            Extracting images from archive <span className="text-primary">{zipName}</span>...
          </span>
        </div>
      )}

      {totalCount > 0 && (
        <div className="space-y-3 rounded-xl border border-line bg-surface p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-ink font-mono">
              Archive: <span className="text-primary">{zipName}</span> ({totalCount} frames)
            </span>
            <div className="flex items-center gap-4 font-mono text-muted">
              <span>Completed: <b className="text-ink">{doneCount}/{totalCount}</b> ({progressPct}%)</span>
              <span>Damaged: <b className="text-amber-600">{damagedCount}</b></span>
              <span>Pristine (none): <b className="text-green-600">{doneCount - damagedCount}</b></span>
            </div>
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-canvas">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Batch Table ── */}
      {items.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-canvas font-mono text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Preview</th>
                <th className="px-4 py-3">Frame Name</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Detections</th>
                <th className="px-4 py-3 text-right">RHI Score</th>
                <th className="px-4 py-3 text-right">Latency</th>
                <th className="px-4 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line font-mono text-xs">
              {items.map((item) => {
                const dets = (item.detections ?? []).filter((d) => d.confidence >= 0.1821);
                return (
                  <tr key={item.id} className="hover:bg-canvas/50">
                    <td className="px-4 py-2.5">
                      <img
                        src={item.previewUrl}
                        alt=""
                        className="size-10 rounded object-cover border border-line"
                      />
                    </td>
                    <td className="px-4 py-2.5 font-bold text-ink truncate max-w-[200px]">
                      {item.name}
                    </td>
                    <td className="px-4 py-2.5">
                      {item.status === "queued" && <span className="text-muted">Queued</span>}
                      {item.status === "running" && (
                        <span className="flex items-center gap-1.5 text-primary">
                          <Loader2 size={12} className="animate-spin" /> Ingesting...
                        </span>
                      )}
                      {item.status === "done" && (
                        <span className="flex items-center gap-1 text-green-600 font-semibold">
                          <CheckCheck size={14} /> Ready
                        </span>
                      )}
                      {item.status === "error" && (
                        <span className="text-red-600 font-semibold">Error</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {item.status === "done" ? (
                        dets.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {dets.map((d, i) => (
                              <span
                                key={i}
                                className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                                style={{
                                  backgroundColor: `${CLASS_COLORS[d.code]}18`,
                                  color: CLASS_COLORS[d.code],
                                }}
                              >
                                {d.code}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted italic">none (pristine)</span>
                        )
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-ink">
                      {item.rhi !== undefined ? item.rhi : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right text-muted">
                      {item.latencyMs !== undefined ? `${item.latencyMs.toFixed(1)} ms` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {item.status === "done" && (
                        <button
                          onClick={() => setInspectModalItem(item)}
                          className="btn btn-ghost text-xs p-1 text-primary hover:bg-primary-soft"
                          title="Inspect detections"
                        >
                          <Eye size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* Empty State */
        <div
          onClick={() => zipInputRef.current?.click()}
          className="flex flex-col items-center justify-center text-center p-14 rounded-2xl border-2 border-dashed border-line bg-surface hover:border-primary/40 cursor-pointer transition-all"
        >
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <FolderArchive size={26} />
          </div>
          <h3 className="mt-4 text-base font-bold text-ink">Upload Image Archive (.zip)</h3>
          <p className="mt-1 text-xs text-muted max-w-sm">
            Drag and drop a complete ZIP archive containing pavement images or click below to load our sample batch dataset.
          </p>
          <div className="mt-4 flex gap-3">
            <button className="btn btn-primary text-xs">Browse ZIP File</button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                loadSampleZip();
              }}
              className="btn btn-ghost text-xs"
            >
              Load Sample Batch
            </button>
          </div>
        </div>
      )}

      {/* ── Inspection Modal for a selected batch row ── */}
      {inspectModalItem && (
        <BatchDetailModal
          item={inspectModalItem}
          onClose={() => setInspectModalItem(null)}
        />
      )}
    </div>
  );
}

function BatchDetailModal({ item, onClose }: { item: BatchItem; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [threshold, setThreshold] = useState(0.1821);

  useEffect(() => {
    const img = new Image();
    img.src = item.previewUrl;
    img.onload = () => {
      if (canvasRef.current) {
        canvasRef.current.width = img.naturalWidth;
        canvasRef.current.height = img.naturalHeight;
        drawCanvasBoxes(canvasRef.current, img, item.detections ?? [], threshold);
      }
    };
  }, [item, threshold]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-line bg-surface p-6 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div>
            <h3 className="font-mono text-sm font-bold text-ink">{item.name}</h3>
            <p className="font-mono text-xs text-muted">
              RHI: <b className="text-ink">{item.rhi}</b> · Detections: {item.detections?.length ?? 0}
            </p>
          </div>
          <button onClick={onClose} className="btn btn-ghost text-xs">
            Close
          </button>
        </div>

        <div className="mt-4 flex-1 overflow-auto flex items-center justify-center bg-slate-950/5 p-2 rounded-xl">
          <canvas ref={canvasRef} className="max-h-[60vh] max-w-full object-contain rounded-lg shadow" />
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span>Filter Threshold:</span>
            <input
              type="range"
              min="0.001"
              max="0.95"
              step="0.01"
              value={threshold}
              onChange={(e) => setThreshold(parseFloat(e.target.value))}
              className="accent-primary"
            />
            <span className="font-bold text-primary">{(threshold * 100).toFixed(1)}%</span>
          </div>
          <span className="text-muted">{item.width}×{item.height} px</span>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// OPTION 3: VIDEO STREAM INSPECTION (Frame-by-Frame Road Survey Engine)
// =============================================================================
function VideoStreamSection() {
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoName, setVideoName] = useState<string>("");
  const [processing, setProcessing] = useState(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [strideFps, setStrideFps] = useState<number>(2); // 2 frames per sec default
  const [resultsMap, setResultsMap] = useState<Map<number, VideoFrameResult>>(new Map());
  const [videoMode, setVideoMode] = useState<ModelInferenceMode>("ensemble");

  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stopRequestedRef = useRef<boolean>(false);

  // Load sample road survey video
  const loadSampleVideo = () => {
    setVideoSrc("/samples/road_survey_sample.mp4");
    setVideoName("road_survey_sample.mp4");
    setResultsMap(new Map());
    setCurrentTime(0);
  };

  // Handle uploaded video
  const handleVideoUpload = (f: File) => {
    const url = URL.createObjectURL(f);
    setVideoSrc(url);
    setVideoName(f.name);
    setResultsMap(new Map());
    setCurrentTime(0);
  };

  // Seek video and draw boxes on sync
  const renderCurrentFrameBoxes = useCallback(() => {
    if (!videoRef.current || !overlayCanvasRef.current) return;
    const video = videoRef.current;
    const canvas = overlayCanvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 640;

    // Find the closest analyzed frame within 0.4 seconds
    const curSec = video.currentTime;
    let closestRes: VideoFrameResult | null = null;
    let minDist = 0.4;

    resultsMap.forEach((res) => {
      const dist = Math.abs(res.timestamp - curSec);
      if (dist < minDist) {
        minDist = dist;
        closestRes = res;
      }
    });

    const activeDets = closestRes ? (closestRes as VideoFrameResult).detections : [];
    drawCanvasBoxes(canvas, video, activeDets, 0.1821);
  }, [resultsMap]);

  // Video time update event listener
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      renderCurrentFrameBoxes();
    };

    video.addEventListener("timeupdate", onTimeUpdate);
    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
    };
  }, [renderCurrentFrameBoxes]);

  // Execute Frame-by-Frame Processing Engine
  const startFrameProcessing = async () => {
    if (!videoRef.current || processing) return;
    const video = videoRef.current;
    stopRequestedRef.current = false;
    setProcessing(true);

    const stepSec = 1.0 / strideFps;
    const totalDuration = video.duration || 10;
    const offscreen = document.createElement("canvas");
    offscreen.width = video.videoWidth || 640;
    offscreen.height = video.videoHeight || 640;
    const offCtx = offscreen.getContext("2d");

    const newMap = new Map<number, VideoFrameResult>(resultsMap);
    let targetTime = 0;
    let frameIdx = 0;

    while (targetTime < totalDuration && !stopRequestedRef.current) {
      // Seek video
      video.currentTime = targetTime;
      await new Promise<void>((resolve) => {
        const handler = () => {
          video.removeEventListener("seeked", handler);
          resolve();
        };
        video.addEventListener("seeked", handler);
      });

      // Capture frame
      if (offCtx) {
        offCtx.drawImage(video, 0, 0, offscreen.width, offscreen.height);
        const blob = await new Promise<Blob | null>((r) => offscreen.toBlob(r, "image/jpeg", 0.9));
        if (blob) {
          try {
            const inf = await runInference(blob, videoMode, 0.001);
            const rhi = computeRHI(inf.detections, 0.1821);
            const frameRes: VideoFrameResult = {
              frameIdx,
              timestamp: targetTime,
              timeFormatted: formatTime(targetTime),
              detections: inf.detections,
              rhi,
              latencyMs: inf.latencyMs,
            };
            newMap.set(Math.round(targetTime * 10), frameRes);
            setResultsMap(new Map(newMap));
          } catch {
            // continue next frame
          }
        }
      }

      frameIdx++;
      targetTime += stepSec;
    }

    setProcessing(false);
  };

  const stopFrameProcessing = () => {
    stopRequestedRef.current = true;
    setProcessing(false);
  };

  // Export video telemetry CSV
  const exportVideoCSV = () => {
    const rows = ["timestamp,frame_index,time_formatted,rhi,detections_count,prediction_string"];
    Array.from(resultsMap.values())
      .sort((a, b) => a.timestamp - b.timestamp)
      .forEach((r) => {
        const dets = r.detections.filter((d) => d.confidence >= 0.1821);
        const predStr = dets.length === 0 ? "none" : dets.map((d) => `${d.code}:${d.confidence.toFixed(3)}`).join(";");
        rows.push(`${r.timestamp.toFixed(2)},${r.frameIdx},${r.timeFormatted},${r.rhi},${dets.length},${predStr}`);
      });

    const csvContent = rows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `video_telemetry_${videoName.replace(/\.[^/.]+$/, "")}.csv`;
    a.click();
  };

  // Jump video to timestamp
  const jumpToTime = (t: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = t;
    }
  };

  const framesList = Array.from(resultsMap.values()).sort((a, b) => a.timestamp - b.timestamp);
  const damagedEvents = framesList.filter((f) => f.detections.some((d) => d.confidence >= 0.1821));
  const avgRHI = framesList.length > 0 ? Math.round(framesList.reduce((acc, f) => acc + f.rhi, 0) / framesList.length) : 100;

  return (
    <div className="space-y-6">
      {/* ── Top Bar: Upload & Video Controls ── */}
      <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) handleVideoUpload(e.target.files[0]);
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn btn-primary"
          >
            <Film size={15} strokeWidth={1.5} />
            Upload Video
          </button>

          <button
            onClick={loadSampleVideo}
            className="btn btn-ghost"
          >
            <Video size={15} strokeWidth={1.5} />
            Load Sample Survey Video (MP4)
          </button>

          {/* Stride selection */}
          <div className="flex items-center gap-1.5 rounded-sm border border-line bg-canvas px-2.5 py-1 text-xs font-mono">
            <span className="text-muted">Rate:</span>
            <select
              value={strideFps}
              onChange={(e) => setStrideFps(parseFloat(e.target.value))}
              disabled={processing}
              className="bg-transparent font-medium text-ink outline-none cursor-pointer"
            >
              <option value="1">1 Frame / Sec (Fast Survey)</option>
              <option value="2">2 Frames / Sec (Standard)</option>
              <option value="5">5 Frames / Sec (Dense)</option>
            </select>
          </div>

          {/* Video Model Selector */}
          <div className="flex items-center gap-1.5 rounded-sm border border-line bg-canvas px-2.5 py-1 text-xs font-mono">
            <Cpu size={13} className="text-primary" />
            <select
              value={videoMode}
              onChange={(e) => setVideoMode(e.target.value as ModelInferenceMode)}
              disabled={processing}
              className="bg-transparent font-medium text-ink outline-none cursor-pointer"
            >
              <option value="ensemble">Ensemble (1088 + 640px)</option>
              <option value="main_only">Primary 1088px</option>
              <option value="640_only">Secondary 640px</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {videoSrc && (
            <>
              {processing ? (
                <button
                  onClick={stopFrameProcessing}
                  className="btn btn-danger text-xs font-mono"
                >
                  <Pause size={14} /> Stop Processing
                </button>
              ) : (
                <button
                  onClick={startFrameProcessing}
                  className="btn btn-primary bg-green-600 hover:bg-green-700 text-white text-xs font-mono"
                >
                  <Play size={14} /> Run Frame-by-Frame Inspection
                </button>
              )}
            </>
          )}

          {framesList.length > 0 && (
            <button
              onClick={exportVideoCSV}
              className="btn btn-ghost border-primary/30 text-primary font-mono text-xs"
            >
              <Download size={14} /> Export Telemetry CSV
            </button>
          )}
        </div>
      </div>

      {videoSrc ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          {/* Main Video Viewport with Live Canvas Overlay */}
          <div className="flex flex-col rounded-2xl border border-line bg-surface overflow-hidden shadow-sm">
            {/* Video Sub-Header */}
            <div className="flex items-center justify-between border-b border-line px-5 py-3 bg-canvas/40 font-mono text-xs">
              <span className="font-semibold text-ink truncate max-w-xs">{videoName}</span>
              <div className="flex items-center gap-4 text-muted">
                <span>Time: <b className="text-primary">{formatTime(currentTime)}</b> / {formatTime(duration)}</span>
                <span>Analyzed: <b className="text-ink">{framesList.length}</b> frames</span>
              </div>
            </div>

            {/* Video Canvas Container */}
            <div className="relative aspect-video w-full overflow-hidden bg-black flex items-center justify-center">
              <video
                ref={videoRef}
                src={videoSrc}
                playsInline
                controls
                onLoadedMetadata={(e) => {
                  setDuration((e.target as HTMLVideoElement).duration || 0);
                }}
                className="h-full w-full object-contain"
              />

              {/* Real-time Bounding Box Overlay Canvas */}
              <canvas
                ref={overlayCanvasRef}
                className="pointer-events-none absolute inset-0 h-full w-full object-contain"
              />

              {/* Live HUD Pill */}
              <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/90 px-3 py-1.5 backdrop-blur-md">
                <span className="size-2 rounded-full bg-cyan-400 animate-pulse" />
                <span className="font-mono text-xs font-semibold text-white">
                  FRAME HUD · {formatTime(currentTime)}
                </span>
              </div>
            </div>
          </div>

          {/* Right Column: Telemetry & Damage Log */}
          <div className="space-y-5">
            {/* Survey Health Summary */}
            <div className="rounded-xl border border-line bg-surface p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">Survey Health Index</span>
                <span className="font-mono text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded">
                  Avg: {avgRHI}/100
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 font-mono text-xs">
                <div className="rounded-lg bg-canvas p-3">
                  <span className="text-muted block text-[11px]">Total Frames:</span>
                  <span className="text-base font-bold text-ink">{framesList.length}</span>
                </div>
                <div className="rounded-lg bg-canvas p-3">
                  <span className="text-muted block text-[11px]">Damage Events:</span>
                  <span className="text-base font-bold text-amber-600">{damagedEvents.length}</span>
                </div>
              </div>
            </div>

            {/* Timestamped Incident Log */}
            <div className="rounded-xl border border-line bg-surface p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-line pb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted">Detected Damage Log</h4>
                <span className="font-mono text-[11px] text-muted">Click to Seek</span>
              </div>

              <div className="max-h-[360px] overflow-y-auto space-y-2 pr-1 font-mono text-xs">
                {damagedEvents.length > 0 ? (
                  damagedEvents.map((evt, idx) => {
                    const topDets = evt.detections.filter((d) => d.confidence >= 0.1821);
                    return (
                      <div
                        key={idx}
                        onClick={() => jumpToTime(evt.timestamp)}
                        className="flex items-center justify-between p-2.5 rounded-lg border border-line bg-canvas/60 hover:border-primary hover:bg-primary-soft/30 cursor-pointer transition-all"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-primary">{evt.timeFormatted}</span>
                          <div className="flex gap-1">
                            {topDets.map((d, i) => (
                              <span
                                key={i}
                                className="px-1.5 py-0.2 rounded text-[10px] font-bold"
                                style={{
                                  backgroundColor: `${CLASS_COLORS[d.code]}20`,
                                  color: CLASS_COLORS[d.code],
                                }}
                              >
                                {d.code}
                              </span>
                            ))}
                          </div>
                        </div>
                        <span className="font-bold text-ink">RHI: {evt.rhi}</span>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-xs text-muted py-6 text-center italic">
                    {processing ? "Analyzing video frames..." : "No damage events detected yet. Click 'Run Frame-by-Frame Inspection' above."}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Empty State */
        <div
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center justify-center text-center p-14 rounded-2xl border-2 border-dashed border-line bg-surface hover:border-primary/40 cursor-pointer transition-all"
        >
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <Video size={26} />
          </div>
          <h3 className="mt-4 text-base font-bold text-ink">Upload Road Survey Video</h3>
          <p className="mt-1 text-xs text-muted max-w-sm">
            Upload dashcam or mobile road footage (.mp4, .webm) or click below to launch our sample road driving video.
          </p>
          <div className="mt-4 flex gap-3">
            <button className="btn btn-primary text-xs">Browse Video File</button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                loadSampleVideo();
              }}
              className="btn btn-ghost text-xs"
            >
              Load Sample Road Survey Video
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
