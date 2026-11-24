import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart2,
  Camera,
  CheckCircle2,
  Clock,
  Cpu,
  Download,
  Film,
  History,
  Loader2,
  MapPin,
  RefreshCw,
  Trash2,
  Upload,
  Video,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import PageHeader from "../components/PageHeader";
import {
  CLASS_COLORS,
  DAMAGE_CLASSES,
  computeRHI,
  rhiLabel,
  type DamageCode,
  type Detection,
} from "../lib/damage";
import { runInference, type InferenceResult, type ModelInferenceMode } from "../lib/api";
import { SEVERITY_ACTION, severityFromRhi } from "../lib/knowledge";
import { CODES, TAU, boxArea, drawBoxes, loadImage, penaltyOf } from "../lib/vision";
import { extractMediaCoordinates, reverseGeocode } from "../lib/geoExtractor";
import DetectionInspector, { type DetectionWithId } from "../components/DetectionInspector";
import DamageAnalytics from "../components/DamageAnalytics";
import InspectionReportModal from "../components/InspectionReportModal";

type TestTab = "image" | "video";
type Phase = "idle" | "loading" | "done" | "error";

interface VideoFrameResult {
  frameIdx: number;
  timestamp: number;
  timeFormatted: string;
  detections: Detection[];
  rhi: number;
  latencyMs: number;
  thumbnailUrl: string;
}

export interface TestHistoryItem {
  id: string;
  timestamp: number;
  timeFormatted: string;
  name: string;
  type: "image" | "video";
  rhi: number;
  detectionsCount: number;
  potholesCount: number;
  cracksCount: number;
  latencyMs: number;
  thumbnailUrl: string;
  locationName?: string;
  coords?: { lat: number; lng: number };
  detections: Detection[];
  imageWidth: number;
  imageHeight: number;
  modelMode: ModelInferenceMode;
}

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const HISTORY_STORAGE_KEY = "pavexa_test_history_v2";

function getStoredHistory(): TestHistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed: TestHistoryItem[] = JSON.parse(raw);
    const cutoff = Date.now() - SIX_HOURS_MS;
    return parsed.filter((item) => item.timestamp >= cutoff);
  } catch {
    return [];
  }
}

function saveHistoryItem(item: TestHistoryItem) {
  try {
    const current = getStoredHistory();
    const updated = [item, ...current.filter((x) => x.id !== item.id)].slice(0, 50);
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn("[ModelTesting] Failed to save test history:", err);
  }
}

function formatVideoTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 10);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms}`;
}

export default function ModelTesting() {
  const [activeTab, setActiveTab] = useState<TestTab>("image");
  const [phase, setPhase] = useState<Phase>("idle");
  const [err, setErr] = useState("");
  const [name, setName] = useState("");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [res, setRes] = useState<InferenceResult | null>(null);
  const [mode, setMode] = useState<ModelInferenceMode>("ensemble");
  const [tau, setTau] = useState(TAU);
  const [sel, setSel] = useState(-1);
  const [drag, setDrag] = useState(false);

  // Zoom & Pan
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  // View mode
  const [viewMode, setViewMode] = useState<"annotated" | "original" | "split">("annotated");
  const [activeClasses, setActiveClasses] = useState<Record<DamageCode, boolean>>({
    D00: true,
    D10: true,
    D20: true,
    D40: true,
  });

  // Location state
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationName, setLocationName] = useState("");
  const [geoExtracted, setGeoExtracted] = useState(false);

  // Inspection modals
  const [inspectDetection, setInspectDetection] = useState<DetectionWithId | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

  // Video verification engine state
  const [videoName, setVideoName] = useState("");
  const [videoProcessing, setVideoProcessing] = useState(false);
  const [videoFrames, setVideoFrames] = useState<VideoFrameResult[]>([]);
  const [selectedVideoFrameIdx, setSelectedVideoFrameIdx] = useState(0);
  const [videoProgress, setVideoProgress] = useState(0);

  // Test history state (< 6 hours)
  const [historyList, setHistoryList] = useState<TestHistoryItem[]>(() => getStoredHistory());

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Refresh history list and prune expired entries
  useEffect(() => {
    const list = getStoredHistory();
    setHistoryList(list);
    const interval = setInterval(() => {
      setHistoryList(getStoredHistory());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // ── Single Image Inference ──────────────────────────────────────────────────
  const runImage = useCallback(
    async (
      b: Blob,
      label: string,
      m: ModelInferenceMode,
      extractedGeo?: { lat: number; lng: number; place: string }
    ) => {
      setPhase("loading");
      setErr("");
      setSel(-1);
      try {
        const previewUrl = URL.createObjectURL(b);
        const im = await loadImage(previewUrl);
        const r = await runInference(b, m, 0.001);

        setBlob(b);
        setName(label);
        setImg(im);
        setRes(r);
        setPhase("done");

        // Compute metrics for history
        const visibleDets = r.detections.filter((d) => d.confidence >= TAU);
        const rhiScore = computeRHI(r.detections, TAU);
        const d40 = visibleDets.filter((d) => d.code === "D40").length;
        const cracks = visibleDets.filter((d) => d.code !== "D40").length;

        // Create thumbnail for history
        const thumbCanvas = document.createElement("canvas");
        const tw = 320;
        const th = Math.round((im.naturalHeight / im.naturalWidth) * tw) || 180;
        thumbCanvas.width = tw;
        thumbCanvas.height = th;
        const tctx = thumbCanvas.getContext("2d");
        if (tctx) {
          tctx.drawImage(im, 0, 0, tw, th);
          drawBoxes(tctx, tw, th, visibleDets);
        }
        const thumbUrl = thumbCanvas.toDataURL("image/jpeg", 0.7);

        // Record into history (<6hr)
        const histItem: TestHistoryItem = {
          id: `hist-${Date.now()}`,
          timestamp: Date.now(),
          timeFormatted: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          name: label,
          type: "image",
          rhi: rhiScore,
          detectionsCount: visibleDets.length,
          potholesCount: d40,
          cracksCount: cracks,
          latencyMs: r.latencyMs,
          thumbnailUrl: thumbUrl,
          locationName: extractedGeo?.place || locationName,
          coords: extractedGeo ? { lat: extractedGeo.lat, lng: extractedGeo.lng } : coords ?? undefined,
          detections: r.detections,
          imageWidth: r.imageWidth,
          imageHeight: r.imageHeight,
          modelMode: m,
        };

        saveHistoryItem(histItem);
        setHistoryList(getStoredHistory());
      } catch (e) {
        setErr((e as Error).message || "Inference failed.");
        setPhase("error");
      }
    },
    [locationName, coords]
  );

  const onImageFile = async (f: File | undefined) => {
    if (!f) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) {
      alert("Use a JPG, PNG, or WEBP image.");
      return;
    }
    if (f.size > 25 * 1024 * 1024) {
      alert("The image is over 25 MB.");
      return;
    }

    let extracted: { lat: number; lng: number; place: string } | undefined;
    try {
      const geo = await extractMediaCoordinates(f);
      if (geo) {
        setCoords({ lat: geo.latitude, lng: geo.longitude });
        setGeoExtracted(true);
        const place = await reverseGeocode(geo.latitude, geo.longitude);
        setLocationName(place);
        extracted = { lat: geo.latitude, lng: geo.longitude, place };
      } else {
        setCoords(null);
        setGeoExtracted(false);
        setLocationName("");
      }
    } catch {
      setCoords(null);
      setGeoExtracted(false);
      setLocationName("");
    }

    await runImage(f, f.name, mode, extracted);
  };

  const onImageFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) await onImageFile(file);
  };

  // ── Video Verification Engine ───────────────────────────────────────────────
  const onVideoFile = async (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("video/")) {
      alert("Please upload an MP4, WebM, or QuickTime video file.");
      return;
    }

    const url = URL.createObjectURL(f);
    setVideoName(f.name);
    setVideoFrames([]);
    setSelectedVideoFrameIdx(0);
    setPhase("loading");
    setVideoProcessing(true);
    setVideoProgress(0);

    // Extract GPS from video metadata
    try {
      const geo = await extractMediaCoordinates(f);
      if (geo) {
        setCoords({ lat: geo.latitude, lng: geo.longitude });
        setGeoExtracted(true);
        const place = await reverseGeocode(geo.latitude, geo.longitude);
        setLocationName(place);
      }
    } catch {}

    // Process video frames
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.playsInline = true;

    await new Promise((resolve) => {
      video.onloadedmetadata = () => resolve(true);
    });

    const duration = video.duration || 5;
    const strideSeconds = 1.0; // sample 1 frame per second
    const totalSamples = Math.min(15, Math.max(3, Math.floor(duration / strideSeconds)));
    const frameResults: VideoFrameResult[] = [];

    const offscreen = document.createElement("canvas");
    offscreen.width = video.videoWidth || 1280;
    offscreen.height = video.videoHeight || 720;
    const offCtx = offscreen.getContext("2d");

    let totalLat = 0;

    for (let i = 0; i < totalSamples; i++) {
      const targetSec = (i * (duration / totalSamples));
      video.currentTime = targetSec;

      await new Promise((resolve) => {
        video.onseeked = () => resolve(true);
      });

      if (offCtx) {
        offCtx.drawImage(video, 0, 0, offscreen.width, offscreen.height);
        const blob = await new Promise<Blob | null>((resolve) =>
          offscreen.toBlob(resolve, "image/jpeg", 0.85)
        );

        if (blob) {
          try {
            const infRes = await runInference(blob, mode, 0.001);
            totalLat += infRes.latencyMs;
            const rhi = computeRHI(infRes.detections, TAU);

            // Thumbnail
            const tCanvas = document.createElement("canvas");
            tCanvas.width = 160;
            tCanvas.height = 90;
            const tctx = tCanvas.getContext("2d");
            if (tctx) {
              tctx.drawImage(offscreen, 0, 0, 160, 90);
              drawBoxes(tctx, 160, 90, infRes.detections.filter((d) => d.confidence >= TAU));
            }

            frameResults.push({
              frameIdx: i + 1,
              timestamp: targetSec,
              timeFormatted: formatVideoTime(targetSec),
              detections: infRes.detections,
              rhi,
              latencyMs: infRes.latencyMs,
              thumbnailUrl: tCanvas.toDataURL("image/jpeg", 0.6),
            });
          } catch {}
        }
      }
      setVideoProgress(Math.round(((i + 1) / totalSamples) * 100));
    }

    setVideoProcessing(false);
    setVideoFrames(frameResults);

    if (frameResults.length > 0) {
      // Pick the frame with the worst RHI score (peak damage)
      const worstIdx = frameResults.reduce(
        (lowestIdx, cur, idx) => (cur.rhi < frameResults[lowestIdx].rhi ? idx : lowestIdx),
        0
      );
      setSelectedVideoFrameIdx(worstIdx);

      // Load worst frame into current viewer
      const worstFrame = frameResults[worstIdx];
      const im = await loadImage(worstFrame.thumbnailUrl);
      setImg(im);
      setRes({
        detections: worstFrame.detections,
        latencyMs: worstFrame.latencyMs,
        imageWidth: offscreen.width,
        imageHeight: offscreen.height,
        modelMode: mode,
      });
      setName(`${f.name} (Frame #${worstFrame.frameIdx} @ ${worstFrame.timeFormatted})`);
      setPhase("done");

      // Save into test history (<6hr)
      const visibleDets = worstFrame.detections.filter((d) => d.confidence >= TAU);
      const d40 = visibleDets.filter((d) => d.code === "D40").length;
      const cracks = visibleDets.filter((d) => d.code !== "D40").length;

      saveHistoryItem({
        id: `hist-vid-${Date.now()}`,
        timestamp: Date.now(),
        timeFormatted: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        name: `${f.name} [Video]`,
        type: "video",
        rhi: worstFrame.rhi,
        detectionsCount: visibleDets.length,
        potholesCount: d40,
        cracksCount: cracks,
        latencyMs: Math.round(totalLat / frameResults.length),
        thumbnailUrl: worstFrame.thumbnailUrl,
        locationName,
        coords: coords ?? undefined,
        detections: worstFrame.detections,
        imageWidth: offscreen.width,
        imageHeight: offscreen.height,
        modelMode: mode,
      });
      setHistoryList(getStoredHistory());
    } else {
      setPhase("error");
      setErr("Failed to sample video frames.");
    }
  };

  // Restore previous test from history (<6hr)
  const loadHistoryRecord = async (item: TestHistoryItem) => {
    try {
      setPhase("loading");
      const im = await loadImage(item.thumbnailUrl);
      setImg(im);
      setName(item.name);
      setRes({
        detections: item.detections,
        latencyMs: item.latencyMs,
        imageWidth: item.imageWidth,
        imageHeight: item.imageHeight,
        modelMode: item.modelMode,
      });
      setMode(item.modelMode);
      if (item.coords) {
        setCoords(item.coords);
        setGeoExtracted(true);
      }
      if (item.locationName) setLocationName(item.locationName);
      setPhase("done");
    } catch {
      alert("Unable to reload this test.");
      setPhase("idle");
    }
  };

  const clearHistory = () => {
    if (confirm("Clear your test history?")) {
      localStorage.removeItem(HISTORY_STORAGE_KEY);
      setHistoryList([]);
    }
  };

  // Select video frame
  const selectVideoFrame = async (idx: number) => {
    setSelectedVideoFrameIdx(idx);
    const frame = videoFrames[idx];
    if (!frame) return;

    const im = await loadImage(frame.thumbnailUrl);
    setImg(im);
    setRes({
      detections: frame.detections,
      latencyMs: frame.latencyMs,
      imageWidth: res?.imageWidth || 1280,
      imageHeight: res?.imageHeight || 720,
      modelMode: mode,
    });
    setName(`${videoName} (Frame #${frame.frameIdx} @ ${frame.timeFormatted})`);
  };

  // ── Detections and Canvas ──────────────────────────────────────────────────
  const visible = useMemo(
    () =>
      res
        ? res.detections
            .filter((d) => activeClasses[d.code] && d.confidence >= tau)
            .sort((a, b) => b.confidence - a.confidence)
        : [],
    [res, tau, activeClasses]
  );

  const rhi = res ? computeRHI(res.detections, tau) : 100;
  const tier = rhiLabel(rhi);

  const rows = useMemo(
    () =>
      visible
        .map((d, i) => ({
          id: `det-${i}`,
          d,
          area: boxArea(d) * 100,
          pts: penaltyOf(d),
        }))
        .sort((a, b) => b.pts - a.pts),
    [visible]
  );

  const byClass = CODES.map((code) => {
    const items = visible.filter((d) => d.code === code);
    return {
      code,
      n: items.length,
      avg: items.length ? items.reduce((s, d) => s + d.confidence, 0) / items.length : 0,
      pts: items.reduce((s, d) => s + penaltyOf(d), 0),
    };
  });
  const worst = [...byClass].sort((a, b) => b.pts - a.pts)[0];

  // Draw main canvas
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !img) return;
    c.width = img.naturalWidth || 1280;
    c.height = img.naturalHeight || 720;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    const W = c.width;
    const H = c.height;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(img, 0, 0, W, H);

    if (viewMode === "original") return;

    const splitX = W / 2;
    if (viewMode === "split") {
      ctx.save();
      ctx.beginPath();
      ctx.rect(splitX, 0, W - splitX, H);
      ctx.clip();
    }

    visible.forEach((d, i) => {
      const isSelected = sel === i;
      const color = CLASS_COLORS[d.code];
      const bx = d.x1 * W;
      const by = d.y1 * H;
      const bw = (d.x2 - d.x1) * W;
      const bh = (d.y2 - d.y1) * H;

      ctx.fillStyle = isSelected ? `${color}40` : `${color}18`;
      ctx.fillRect(bx, by, bw, bh);

      ctx.strokeStyle = color;
      ctx.lineWidth = isSelected ? 4 : 2.5;
      ctx.strokeRect(bx, by, bw, bh);

      // Label
      const text = `${d.code} ${(d.confidence * 100).toFixed(1)}%`;
      ctx.font = "bold 12px 'JetBrains Mono', monospace";
      const tw = ctx.measureText(text).width;
      const ly = by - 20 > 0 ? by - 20 : by + 2;
      ctx.fillStyle = color;
      ctx.fillRect(bx, ly, tw + 12, 19);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(text, bx + 6, ly + 14);
    });

    if (viewMode === "split") {
      ctx.restore();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(splitX, 0);
      ctx.lineTo(splitX, H);
      ctx.stroke();

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
  }, [img, visible, sel, viewMode]);

  const toggleClass = (code: DamageCode) => {
    setActiveClasses((prev) => ({ ...prev, [code]: !prev[code] }));
  };

  const severity = severityFromRhi(rhi, visible.some((d) => d.code === "D40"));
  const totalHistoryDetections = historyList.reduce((sum, item) => sum + item.detectionsCount, 0);
  const averageHistoryLatency = historyList.length ? historyList.reduce((sum, item) => sum + item.latencyMs, 0) / historyList.length : 0;

  return (
    <div className="space-y-6 pb-20">
      <PageHeader
        title="AI testing laboratory"
        description="Independent model evaluation workspace for YOLO prediction runs, video sampling, robustness checks, and exportable evidence."
        actions={
          phase !== "idle" && (
            <button
              onClick={() => {
                setPhase("idle");
                setRes(null);
                setImg(null);
              }}
              className="btn btn-ghost"
            >
              <RefreshCw size={15} strokeWidth={1.5} aria-hidden /> New test
            </button>
          )
        }
      />

      <section className="rounded-xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-ink">Model evaluation dashboard</h2><p className="mt-1 text-xs text-muted">Prediction testing is separate from civilian reports and does not create complaints.</p></div><span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">Ultralytics YOLO · best.pt</span></div>
        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {[
            ["Model", "best.pt"], ["Version", "v1.0"], ["Input", "1088 / 640 px"], ["Classes", "D00 · D10 · D20 · D40"],
            ["Images tested", String(historyList.filter((h) => h.type === "image").length)], ["Avg inference", historyList.length ? `${averageHistoryLatency.toFixed(1)} ms` : "—"],
            ["Total detections", String(totalHistoryDetections)], ["Last evaluation", historyList[0] ? historyList[0].timeFormatted : "Not yet run"], ["Labeled metrics", "No validation set loaded"],
          ].map(([label, value]) => <div key={label} className="rounded-lg bg-canvas p-3"><dt className="text-[11px] text-muted">{label}</dt><dd className="mt-1 text-xs font-semibold text-ink">{value}</dd></div>)}
        </dl>
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"><b>Accuracy note:</b> mAP, precision, recall and F1 require ground-truth labels. An unlabeled upload reports predictions and inference speed only.</p>
      </section>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => {
          void onImageFiles(e.target.files ?? []);
          e.target.value = "";
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        className="hidden"
        onChange={(e) => {
          onVideoFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {/* ── Mode Tabs: Image vs Video Verification ── */}
      <div className="flex items-center justify-between border-b border-line pb-3">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("image")}
            className={`btn text-xs flex items-center gap-1.5 ${
              activeTab === "image"
                ? "btn-primary shadow-sm"
                : "btn-ghost text-muted hover:text-ink"
            }`}
          >
            <Camera size={14} /> Single Road Frame
          </button>
          <button
            onClick={() => setActiveTab("video")}
            className={`btn text-xs flex items-center gap-1.5 ${
              activeTab === "video"
                ? "btn-primary shadow-sm"
                : "btn-ghost text-muted hover:text-ink"
            }`}
          >
            <Video size={14} /> Video Verification Engine
          </button>
        </div>

        {/* Test History Badge / Trigger */}
        {historyList.length > 0 && (
          <div className="flex items-center gap-2 text-xs font-mono text-muted">
            <History size={13} className="text-primary" />
            <span>History (Past 6hr): <b className="text-ink">{historyList.length}</b></span>
            <button
              onClick={clearHistory}
              className="text-[11px] text-muted hover:text-red-500 transition-colors ml-1"
              title="Clear history"
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>

      {/* ── Recent Test History Bar (< 6 Hours) ── */}
      {historyList.length > 0 && (
        <div className="rounded-xl border border-line bg-surface p-4 space-y-2.5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-mono text-xs font-bold text-ink">
              <Clock size={13} className="text-primary" /> Recent Inspections (Past 6 Hours)
            </span>
            <span className="text-[11px] text-muted">Click any test to reload full analysis</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-thin">
            {historyList.map((item) => (
              <button
                key={item.id}
                onClick={() => loadHistoryRecord(item)}
                className="group flex items-center gap-2.5 rounded-lg border border-line bg-canvas p-2 text-left shrink-0 hover:border-primary transition-all max-w-[240px]"
              >
                <img
                  src={item.thumbnailUrl}
                  alt=""
                  className="size-11 rounded object-cover border border-line shrink-0"
                />
                <div className="min-w-0 font-mono">
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-xs font-bold text-ink group-hover:text-primary">
                      {item.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted mt-0.5">
                    <span>{item.timeFormatted}</span>
                    <span
                      className="font-bold px-1 rounded"
                      style={{
                        backgroundColor: `${rhiLabel(item.rhi).color}15`,
                        color: rhiLabel(item.rhi).color,
                      }}
                    >
                      RHI {item.rhi}
                    </span>
                    <span>{item.detectionsCount} defects</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Idle Upload State (No demo images, clean prompt) ── */}
      {phase === "idle" && (
        <div className="space-y-6">
          <div
            onClick={() => (activeTab === "image" ? fileInputRef.current?.click() : videoInputRef.current?.click())}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const file = e.dataTransfer.files[0];
              if (activeTab === "image") onImageFile(file);
              else onVideoFile(file);
            }}
            className={`flex cursor-pointer flex-col items-center gap-4 rounded-2xl border-2 border-dashed px-8 py-24 text-center transition-all ${
              drag
                ? "border-primary bg-primary-soft/50 shadow-inner"
                : "border-line bg-surface hover:border-primary/40 hover:bg-canvas"
            }`}
          >
            <span className="flex size-16 items-center justify-center rounded-2xl border border-line bg-canvas text-primary shadow-sm">
              {activeTab === "image" ? <Upload size={28} strokeWidth={1.5} /> : <Film size={28} strokeWidth={1.5} />}
            </span>
            <div>
              <p className="text-base font-bold text-ink">
                {activeTab === "image"
                  ? "Drop a road inspection image here, or click to browse"
                  : "Drop a road survey video here, or click to browse"}
              </p>
              <p className="mt-1 font-mono text-xs text-muted">
                {activeTab === "image"
                  ? "Supports JPG · PNG · WEBP up to 25 MB with automatic EXIF GPS extraction"
                  : "Supports MP4 · WebM · MOV with automatic frame-by-frame analysis & ISO-6709 coordinates"}
              </p>
            </div>
            <button className="btn btn-primary text-xs mt-2">
              Browse {activeTab === "image" ? "Photo File" : "Video File"}
            </button>
          </div>
        </div>
      )}

      {/* ── Loading State ── */}
      {phase === "loading" && (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-line bg-surface py-28 text-center shadow-sm">
          <Loader2 size={36} className="animate-spin text-primary" />
          <div>
            <p className="font-mono text-sm font-bold text-ink">
              {videoProcessing ? `Processing video frames (${videoProgress}%)...` : "Running dual-scale YOLO detector..."}
            </p>
            <p className="mt-1 text-xs text-muted">
              Dual-scale 1088px & 640px inference with Weighted Box Fusion
            </p>
          </div>
        </div>
      )}

      {/* ── Error State ── */}
      {phase === "error" && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-surface py-20 text-center">
          <AlertTriangle size={32} className="text-red-500" />
          <p className="max-w-md text-sm text-ink font-semibold">{err || "An error occurred during verification."}</p>
          <button onClick={() => setPhase("idle")} className="btn btn-ghost text-xs mt-2">
            Try another file
          </button>
        </div>
      )}

      {/* ── Done State: Full Prediction Suite ── */}
      {phase === "done" && res && (
        <>
          {/* Top Controls Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-xl border border-line bg-surface p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              {/* View Mode (Annotated vs Original vs Split) */}
              <div className="flex rounded-lg border border-line bg-canvas p-0.5 text-xs font-mono">
                <button
                  onClick={() => setViewMode("annotated")}
                  className={`px-3 py-1 rounded-md transition-colors ${
                    viewMode === "annotated" ? "bg-surface font-bold text-primary shadow-sm" : "text-muted hover:text-ink"
                  }`}
                >
                  Annotated
                </button>
                <button
                  onClick={() => setViewMode("original")}
                  className={`px-3 py-1 rounded-md transition-colors ${
                    viewMode === "original" ? "bg-surface font-bold text-primary shadow-sm" : "text-muted hover:text-ink"
                  }`}
                >
                  Original
                </button>
                <button
                  onClick={() => setViewMode("split")}
                  className={`px-3 py-1 rounded-md transition-colors ${
                    viewMode === "split" ? "bg-surface font-bold text-primary shadow-sm" : "text-muted hover:text-ink"
                  }`}
                >
                  Split View
                </button>
              </div>

              {/* Class Filter Chips */}
              <div className="flex items-center gap-1.5">
                {CODES.map((code) => {
                  const active = activeClasses[code];
                  const count = visible.filter((d) => d.code === code).length;
                  return (
                    <button
                      key={code}
                      onClick={() => toggleClass(code)}
                      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-mono font-bold transition-all ${
                        active
                          ? "border border-line bg-surface text-ink shadow-sm"
                          : "border border-dashed border-line bg-canvas/40 text-muted opacity-60"
                      }`}
                    >
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: CLASS_COLORS[code] }}
                      />
                      {code} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Action Buttons: Export Report & Analytics */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAnalytics(!showAnalytics)}
                className={`btn text-xs flex items-center gap-1.5 ${
                  showAnalytics ? "btn-primary shadow-sm" : "btn-ghost border border-line"
                }`}
              >
                <BarChart2 size={14} /> Analytics View
              </button>
              <button
                onClick={() => setShowReportModal(true)}
                className="btn btn-primary text-xs flex items-center gap-1.5 shadow-sm"
              >
                <Download size={14} /> Export Report
              </button>
            </div>
          </div>

          {/* Video Frames Scrubber (if video was verified) */}
          {videoFrames.length > 0 && (
            <div className="rounded-xl border border-line bg-surface p-4 space-y-3 shadow-sm">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="font-bold text-ink">
                  Video Frames Timeline ({videoFrames.length} sampled points):
                </span>
                <span className="text-muted">
                  Viewing Frame #{videoFrames[selectedVideoFrameIdx]?.frameIdx} @ {videoFrames[selectedVideoFrameIdx]?.timeFormatted}
                </span>
              </div>
              <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-thin">
                {videoFrames.map((vf, idx) => (
                  <button
                    key={idx}
                    onClick={() => selectVideoFrame(idx)}
                    className={`group relative rounded-lg border p-1 text-left shrink-0 transition-all ${
                      idx === selectedVideoFrameIdx
                        ? "border-primary ring-2 ring-primary/20 bg-surface shadow-md"
                        : "border-line bg-canvas opacity-75 hover:opacity-100"
                    }`}
                  >
                    <img
                      src={vf.thumbnailUrl}
                      alt=""
                      className="h-16 w-28 rounded object-cover"
                    />
                    <div className="mt-1 flex items-center justify-between font-mono text-[10px]">
                      <span className="font-bold text-ink">{vf.timeFormatted}</span>
                      <span
                        className="font-bold px-1 rounded text-[9px]"
                        style={{
                          backgroundColor: `${rhiLabel(vf.rhi).color}15`,
                          color: rhiLabel(vf.rhi).color,
                        }}
                      >
                        {vf.rhi}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Main Grid: Interactive Canvas + Sidebar Telemetry */}
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            {/* Left: Canvas Viewer with Zoom & Pan */}
            <div className="space-y-3">
              <div className="flex items-center justify-between font-mono text-xs text-muted">
                <span className="truncate max-w-md font-semibold text-ink">{name}</span>
                <span>{res.imageWidth}×{res.imageHeight} px</span>
              </div>

              <div
                className="relative overflow-hidden rounded-2xl border border-line bg-black/95 flex items-center justify-center min-h-[460px] max-h-[72vh]"
                onWheel={(e) => {
                  e.preventDefault();
                  setZoom((z) => (e.deltaY < 0 ? Math.min(4, +(z + 0.2).toFixed(2)) : Math.max(0.6, +(z - 0.2).toFixed(2))));
                }}
                onMouseDown={(e) => {
                  if (zoom <= 1) return;
                  setIsDragging(true);
                  dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
                }}
                onMouseMove={(e) => {
                  if (!isDragging) return;
                  setPan({ x: e.clientX - dragStartRef.current.x, y: e.clientY - dragStartRef.current.y });
                }}
                onMouseUp={() => setIsDragging(false)}
                onMouseLeave={() => setIsDragging(false)}
              >
                <canvas
                  ref={canvasRef}
                  className="mx-auto block max-h-[70vh] w-auto max-w-full transition-transform duration-75"
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    cursor: zoom > 1 ? (isDragging ? "grabbing" : "grab") : "default",
                  }}
                />

                {/* Floating Zoom Controls */}
                <div className="absolute bottom-3 left-3 flex items-center gap-1 rounded-lg bg-black/80 p-1 backdrop-blur-md border border-white/10 text-white font-mono text-xs">
                  <button
                    onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))}
                    className="p-1 hover:text-primary transition-colors"
                    title="Zoom in"
                  >
                    <ZoomIn size={14} />
                  </button>
                  <button
                    onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.25).toFixed(2)))}
                    className="p-1 hover:text-primary transition-colors"
                    title="Zoom out"
                  >
                    <ZoomOut size={14} />
                  </button>
                  <button
                    onClick={() => {
                      setZoom(1);
                      setPan({ x: 0, y: 0 });
                    }}
                    className="px-1.5 py-0.5 text-[11px] hover:text-primary"
                  >
                    {Math.round(zoom * 100)}%
                  </button>
                </div>
              </div>
            </div>

            {/* Right Sidebar: Telemetry, Threshold, Location */}
            <aside className="space-y-4 font-mono">
              {/* RHI Health Score Card */}
              <div className="rounded-xl border border-line bg-surface p-5 space-y-3 shadow-sm">
                <span className="text-muted text-[11px] uppercase tracking-wider">Road Health Index</span>
                <div className="flex items-end justify-between">
                  <span className="text-5xl font-extrabold" style={{ color: tier.color }}>
                    {rhi}
                  </span>
                  <span
                    className="rounded-md px-2.5 py-1 text-xs font-bold"
                    style={{ backgroundColor: `${tier.color}1a`, color: tier.color }}
                  >
                    {tier.label}
                  </span>
                </div>
                <p className="text-xs font-sans text-muted leading-relaxed">
                  {visible.length === 0
                    ? "No defects identified above calibrated threshold."
                    : `${visible.length} defects identified. Primary distress: ${
                        worst ? DAMAGE_CLASSES[worst.code].label : "None"
                      }.`}
                </p>
                {visible.length > 0 && (
                  <p className="border-t border-line pt-2 text-xs font-sans text-muted">
                    <b className="text-ink">{severity}:</b> {SEVERITY_ACTION[severity]}
                  </p>
                )}
              </div>

              {/* Confidence Threshold Slider */}
              <div className="rounded-xl border border-line bg-surface p-5 space-y-2.5 shadow-sm">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-ink font-bold">Confidence Threshold:</span>
                  <span className="font-bold text-primary">{(tau * 100).toFixed(1)}%</span>
                </div>
                <input
                  type="range"
                  min="0.001"
                  max="0.95"
                  step="0.005"
                  value={tau}
                  onChange={(e) => setTau(parseFloat(e.target.value))}
                  className="w-full accent-primary cursor-pointer"
                />
                <div className="flex items-center justify-between text-[11px] text-muted">
                  <span>More boxes</span>
                  <button onClick={() => setTau(TAU)} className="text-primary hover:underline font-bold">
                    Calibrated ({TAU})
                  </button>
                  <span>Fewer</span>
                </div>
              </div>

              {/* Model Telemetry */}
              <div className="rounded-xl border border-line bg-surface p-5 space-y-3 shadow-sm text-xs">
                <div className="flex items-center gap-2 font-bold text-ink">
                  <Cpu size={14} className="text-primary" /> Inference Engine
                </div>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as ModelInferenceMode)}
                  className="w-full rounded-lg border border-line bg-canvas p-2 text-xs text-ink outline-none focus:border-primary"
                >
                  <option value="ensemble">Dual-Scale Ensemble (1088 + 640px)</option>
                  <option value="main_only">Primary 1088px Only</option>
                  <option value="640_only">Secondary 640px Only</option>
                </select>
                <div className="space-y-1.5 pt-1 text-[11px] text-muted">
                  <div className="flex justify-between">
                    <span>Latency:</span>
                    <b className="text-ink">{res.latencyMs.toFixed(1)} ms</b>
                  </div>
                  <div className="flex justify-between">
                    <span>Hardware:</span>
                    <b className="text-ink">{res.isMock ? "Simulated" : res.device || "CPU"}</b>
                  </div>
                  <div className="flex justify-between">
                    <span>Visible Boxes:</span>
                    <b className="text-ink">{visible.length} / {res.detections.length}</b>
                  </div>
                </div>
              </div>

              {/* Location & GPS Card */}
              <div className="rounded-xl border border-line bg-surface p-5 space-y-3 shadow-sm text-xs">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-bold text-ink">
                    <MapPin size={14} className="text-primary" /> Coordinates
                  </span>
                  {geoExtracted && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-semibold">
                      <CheckCircle2 size={11} /> EXIF Verified
                    </span>
                  )}
                </div>

                {geoExtracted && coords ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/40 dark:bg-emerald-950/20 p-3 space-y-1">
                    <p className="font-bold text-emerald-800 dark:text-emerald-300">
                      {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                    </p>
                    <p className="text-[11px] text-ink font-sans">{locationName || "Verified roadway"}</p>
                  </div>
                ) : (
                  <div className="space-y-2 pt-1 text-[11px]">
                    <p className="text-muted">No GPS metadata. Set coordinates:</p>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        step="0.0001"
                        placeholder="Lat"
                        value={coords?.lat ?? ""}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          setCoords((prev) => ({ lat: v, lng: prev?.lng ?? 76.6394 }));
                        }}
                        className="rounded border border-line bg-canvas p-1 text-xs text-ink outline-none"
                      />
                      <input
                        type="number"
                        step="0.0001"
                        placeholder="Lng"
                        value={coords?.lng ?? ""}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          setCoords((prev) => ({ lat: prev?.lat ?? 12.2958, lng: v }));
                        }}
                        className="rounded border border-line bg-canvas p-1 text-xs text-ink outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            </aside>
          </div>

          {/* ── Detailed Prediction Breakdown Table ── */}
          <div className="rounded-2xl border border-line bg-surface overflow-hidden shadow-sm">
            <div className="border-b border-line p-4 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-ink font-mono">Detections Detail Log</h3>
                <p className="text-xs text-muted font-sans mt-0.5">
                  Click any detection row to open the zoomed region crop inspector.
                </p>
              </div>
              <span className="font-mono text-xs text-muted">
                Showing {rows.length} {rows.length === 1 ? "defect" : "defects"}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="border-b border-line bg-canvas text-[11px] uppercase text-muted">
                  <tr>
                    <th className="px-4 py-2.5">#</th>
                    <th className="px-4 py-2.5">Class</th>
                    <th className="px-4 py-2.5">Confidence</th>
                    <th className="px-4 py-2.5">Bounding Box [x1, y1, x2, y2]</th>
                    <th className="px-4 py-2.5 text-right">Area %</th>
                    <th className="px-4 py-2.5 text-right">Penalty</th>
                    <th className="px-4 py-2.5 text-right">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.length > 0 ? (
                    rows.map((r, i) => (
                      <tr
                        key={r.id}
                        onMouseEnter={() => setSel(i)}
                        onMouseLeave={() => setSel(-1)}
                        onClick={() =>
                          setInspectDetection({
                            ...r.d,
                            id: r.id,
                          })
                        }
                        className="cursor-pointer hover:bg-primary-soft/40 transition-colors"
                      >
                        <td className="px-4 py-3 text-muted">#{i + 1}</td>
                        <td className="px-4 py-3">
                          <span
                            className="inline-flex items-center gap-1.5 font-bold rounded px-1.5 py-0.5"
                            style={{
                              backgroundColor: `${CLASS_COLORS[r.d.code]}18`,
                              color: CLASS_COLORS[r.d.code],
                            }}
                          >
                            {r.d.code} · {DAMAGE_CLASSES[r.d.code].label}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-bold text-ink">
                          {(r.d.confidence * 100).toFixed(1)}%
                        </td>
                        <td className="px-4 py-3 text-muted">
                          [{r.d.x1.toFixed(3)}, {r.d.y1.toFixed(3)}, {r.d.x2.toFixed(3)}, {r.d.y2.toFixed(3)}]
                        </td>
                        <td className="px-4 py-3 text-right">{r.area.toFixed(2)}%</td>
                        <td className="px-4 py-3 text-right font-bold text-ink">{r.pts.toFixed(1)}</td>
                        <td className="px-4 py-3 text-right">
                          <button className="text-primary hover:underline">Inspect →</button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted font-sans text-xs">
                        No defects found above the confidence threshold.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Damage Analytics Panel ── */}
          {showAnalytics && (
            <div className="pt-4">
              <DamageAnalytics
                detections={res.detections}
                threshold={tau}
                imageWidth={res.imageWidth}
                imageHeight={res.imageHeight}
                rhi={rhi}
                latencyMs={res.latencyMs}
              />
            </div>
          )}

          {/* ── Zoomed Detection Inspector Modal ── */}
          {inspectDetection && (
            <DetectionInspector
              detection={inspectDetection}
              imageElement={img}
              imageWidth={res.imageWidth}
              imageHeight={res.imageHeight}
              onClose={() => setInspectDetection(null)}
            />
          )}

          {/* ── Export Inspection Report Modal ── */}
          {showReportModal && (
            <InspectionReportModal
              fileName={name || "road_inspection.jpg"}
              rawImageUrl={blob ? URL.createObjectURL(blob) : null}
              annotatedCanvas={canvasRef.current}
              detections={res.detections}
              threshold={tau}
              latencyMs={res.latencyMs}
              modelMode={mode}
              imageWidth={res.imageWidth}
              imageHeight={res.imageHeight}
              onClose={() => setShowReportModal(false)}
            />
          )}
        </>
      )}
    </div>
  );
}
