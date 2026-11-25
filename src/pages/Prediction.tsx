import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import {
  AlertCircle,
  ArrowDownToLine,
  Check,
  FileImage,
  FileText,
  ImagePlus,
  LoaderCircle,
  Play,
  Trash2,
} from "lucide-react";
import PageHeader from "../components/PageHeader";
import InspectionReportModal from "../components/InspectionReportModal";
import RobustnessLab from "../components/RobustnessLab";
import EvidenceImage from "../components/EvidenceImage";
import { BarList, ChartCard, DonutChart, Histogram, RhiGauge } from "../components/charts";
import { runInference, type InferenceResult, type ModelInferenceMode } from "../lib/api";
import { breakdown, DAMAGE_CODES, DEFAULT_THRESHOLD } from "../lib/analytics";
import {
  CLASS_COLORS,
  DAMAGE_CLASSES,
  rhiLabel,
  type DamageCode,
} from "../lib/damage";
import { drawBoxes, loadImage } from "../lib/vision";

type PredictionStatus = "ready" | "running" | "done" | "error";
type ViewMode = "comparison" | "original" | "analysis";

interface PredictionItem {
  id: string;
  file: File;
  previewUrl: string;
  status: PredictionStatus;
  result?: InferenceResult;
  error?: string;
}

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const CLASS_ID: Record<DamageCode, number> = { D00: 0, D10: 1, D20: 2, D40: 3 };

function csvEscape(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function buildSubmission(items: PredictionItem[]) {
  const rows = ["image_id,PredictionString"];
  for (const item of items) {
    if (item.status !== "done" || !item.result) continue;
    const predictions = item.result.detections.slice(0, 100).map((detection) => {
      const { imageWidth, imageHeight } = item.result!;
      return [
        CLASS_ID[detection.code],
        detection.confidence.toFixed(6),
        (detection.x1 * imageWidth).toFixed(1),
        (detection.y1 * imageHeight).toFixed(1),
        (detection.x2 * imageWidth).toFixed(1),
        (detection.y2 * imageHeight).toFixed(1),
      ].join(" ");
    });
    rows.push(`${csvEscape(item.file.name)},${csvEscape(predictions.join(" ") || "none")}`);
  }
  return rows.join("\n");
}

function downloadSubmission(items: PredictionItem[]) {
  const url = URL.createObjectURL(new Blob([buildSubmission(items)], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "road-damage-predictions.csv";
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function PredictionPageNote() {
  return (
    <p className="text-xs leading-5 text-muted">
      Images are sent to the configured model API for inference. Runs are kept only in this page
      session; they are not saved to an account or analysis history.
    </p>
  );
}

export default function Prediction() {
  const [items, setItems] = useState<PredictionItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [batchMode, setBatchMode] = useState(false);
  const [robustnessMode, setRobustnessMode] = useState(false);
  const [mode, setMode] = useState<ModelInferenceMode>("ensemble");
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const [viewMode, setViewMode] = useState<ViewMode>("comparison");
  const [selectedDetection, setSelectedDetection] = useState<number>(-1);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [formError, setFormError] = useState("");
  const [report, setReport] = useState<{ item: PredictionItem; canvas: HTMLCanvasElement } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlsRef = useRef(new Set<string>());

  useEffect(
    () => () => objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url)),
    [],
  );

  const activeItem = items.find((item) => item.id === activeId) ?? null;
  const activeResult = activeItem?.result;
  const detections = useMemo(
    () =>
      activeResult?.detections
        .map((detection, originalIndex) => ({ detection, originalIndex }))
        .filter(({ detection }) => detection.confidence >= threshold)
        .sort((a, b) => b.detection.confidence - a.detection.confidence) ?? [],
    [activeResult, threshold],
  );
  const visibleDetections = detections.map(({ detection }) => detection);
  const rhiDetails = breakdown(visibleDetections);
  const rhi = rhiDetails.rhi;
  const rhiStatus = rhiLabel(rhi);
  const completed = items.filter((item) => item.status === "done").length;
  const queued = items.filter((item) => item.status === "ready" || item.status === "error").length;

  const releaseUrl = (url: string) => {
    URL.revokeObjectURL(url);
    objectUrlsRef.current.delete(url);
  };

  const addFiles = (files: FileList | File[]) => {
    setFormError("");
    const supported: File[] = [];
    const rejected: string[] = [];
    for (const file of Array.from(files)) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        rejected.push(`${file.name}: use a JPG, PNG or WEBP image`);
      } else if (file.size > MAX_FILE_BYTES) {
        rejected.push(`${file.name}: maximum file size is 15 MB`);
      } else {
        supported.push(file);
      }
    }

    if (rejected.length) setFormError(rejected.join(" · "));
    if (supported.length === 0) return;
    if (!batchMode && supported.length > 1) {
      setFormError("Single-image mode accepts one image. Switch to Batch images to test multiple files.");
      return;
    }

    const created = supported.map((file, index) => {
      const previewUrl = URL.createObjectURL(file);
      objectUrlsRef.current.add(previewUrl);
      return {
        id: `${file.name}-${file.lastModified}-${file.size}-${Date.now()}-${index}`,
        file,
        previewUrl,
        status: "ready" as const,
      };
    });

    if (batchMode) {
      setItems((current) => [...current, ...created]);
      setActiveId(created[0].id);
    } else {
      items.forEach((item) => releaseUrl(item.previewUrl));
      setItems([created[0]]);
      created.slice(1).forEach((item) => releaseUrl(item.previewUrl));
      setActiveId(created[0].id);
      setViewMode("comparison");
      setSelectedDetection(-1);
    }
  };

  const onFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) addFiles(event.target.files);
    event.target.value = "";
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files);
  };

  const runItem = async (item: PredictionItem) => {
    setFormError("");
    setItems((current) =>
      current.map((entry) => (entry.id === item.id ? { ...entry, status: "running", error: undefined } : entry)),
    );
    try {
      const result = await runInference(item.file, mode, 0.001);
      setItems((current) =>
        current.map((entry) =>
          entry.id === item.id ? { ...entry, status: "done", result, error: undefined } : entry,
        ),
      );
      setSelectedDetection(-1);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The model request failed.";
      setItems((current) =>
        current.map((entry) => (entry.id === item.id ? { ...entry, status: "error", error: message } : entry)),
      );
    }
  };

  const runBatch = async () => {
    if (busy) return;
    setBusy(true);
    for (const item of items.filter((entry) => entry.status === "ready" || entry.status === "error")) {
      await runItem(item);
    }
    setBusy(false);
  };

  const runSingle = async () => {
    if (!activeItem || busy) return;
    setBusy(true);
    await runItem(activeItem);
    setBusy(false);
  };

  const removeItem = (item: PredictionItem) => {
    releaseUrl(item.previewUrl);
    setItems((current) => current.filter((entry) => entry.id !== item.id));
    if (activeId === item.id) {
      const next = items.find((entry) => entry.id !== item.id);
      setActiveId(next?.id ?? null);
    }
  };

  const clearBatch = () => {
    items.forEach((item) => releaseUrl(item.previewUrl));
    setItems([]);
    setActiveId(null);
  };

  const openReport = async () => {
    if (!activeItem?.result) return;
    setFormError("");
    try {
      const image = await loadImage(activeItem.previewUrl);
      const canvas = document.createElement("canvas");
      canvas.width = activeItem.result.imageWidth;
      canvas.height = activeItem.result.imageHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not prepare the annotated report image.");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      drawBoxes(context, canvas.width, canvas.height, visibleDetections);
      setReport({ item: activeItem, canvas });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not prepare the report.");
    }
  };

  const modeDescription =
    mode === "ensemble"
      ? "1088 px + test-time augmentation and 640 px, fused with WBF"
      : mode === "main_only"
        ? "Main YOLO26s detector at 1088 px"
        : "Second YOLO26s detector at 640 px";

  return (
    <div className="space-y-5 pb-16">
      <PageHeader
        title="Prediction testing"
        description="Run the configured YOLO26s model on road images and inspect each returned box"
        actions={
          activeResult && !robustnessMode && (
            <button type="button" onClick={() => void openReport()} className="btn btn-ghost">
              <FileText size={15} aria-hidden /> Build report
            </button>
          )
        }
      />

      <section className="grid gap-4 rounded-xl border border-line bg-surface p-4 sm:p-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <label htmlFor="model-mode" className="text-xs font-medium text-muted">Inference configuration</label>
          <select
            id="model-mode"
            value={mode}
            disabled={busy}
            onChange={(event) => setMode(event.target.value as ModelInferenceMode)}
            className="mt-2 block h-10 w-full rounded-md border border-line bg-white px-3 text-sm text-ink outline-none focus:border-primary lg:max-w-md"
          >
            <option value="ensemble">Final ensemble · 1088 px + TTA + 640 px</option>
            <option value="main_only">Main detector · 1088 px</option>
            <option value="640_only">Second detector · 640 px</option>
          </select>
          <p className="mt-2 text-xs text-muted">{modeDescription}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1 rounded-md border border-line bg-canvas p-1" role="tablist" aria-label="Prediction input type">
          <button
            type="button"
            role="tab"
            aria-selected={!batchMode && !robustnessMode}
            disabled={busy}
            onClick={() => { setBatchMode(false); setRobustnessMode(false); }}
            className={`h-9 rounded px-2.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${!batchMode && !robustnessMode ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}
          >
            Single image
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={batchMode}
            disabled={busy}
            onClick={() => { setBatchMode(true); setRobustnessMode(false); }}
            className={`h-9 rounded px-2.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${batchMode ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}
          >
            Batch images
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={robustnessMode}
            disabled={busy}
            onClick={() => { setBatchMode(false); setRobustnessMode(true); }}
            className={`h-9 rounded px-2.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${robustnessMode ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}
          >
            Robustness lab
          </button>
        </div>
      </section>

      <div className="space-y-4">
        <section className="space-y-4">
          {!batchMode && items.length === 0 && (
            <UploadArea
              inputRef={fileInputRef}
              multiple={false}
              dragging={dragging}
              setDragging={setDragging}
              onFiles={onFileInput}
              onDrop={onDrop}
              onBrowse={() => fileInputRef.current?.click()}
            />
          )}

          {robustnessMode && !activeItem && (
            <div className="rounded-lg border border-line bg-canvas p-4 text-xs leading-5 text-muted">
              <p className="font-medium text-ink">Choose an image to start</p>
              <p className="mt-1">The lab will compare a clean-image baseline with each selected robustness condition.</p>
            </div>
          )}

          {batchMode && (
            <>
              <UploadArea
                inputRef={fileInputRef}
                multiple
                dragging={dragging}
                setDragging={setDragging}
                onFiles={onFileInput}
                onDrop={onDrop}
                onBrowse={() => fileInputRef.current?.click()}
              />
              {items.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-line bg-surface">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
                    <p className="text-sm font-medium text-ink">
                      Batch queue <span className="ml-1 font-mono text-xs text-muted">{completed}/{items.length} complete</span>
                    </p>
                    <div className="flex gap-2">
                      {completed > 0 && (
                        <button type="button" className="btn btn-ghost h-9 px-3 text-xs" onClick={() => downloadSubmission(items)}>
                          <ArrowDownToLine size={14} aria-hidden /> Export CSV
                        </button>
                      )}
                      <button type="button" className="btn btn-ghost h-9 px-3 text-xs" disabled={busy} onClick={clearBatch}>
                        Clear
                      </button>
                      <button type="button" className="btn btn-primary h-9 px-3 text-xs" disabled={busy || queued === 0} onClick={() => void runBatch()}>
                        {busy ? <LoaderCircle size={14} className="animate-spin" aria-hidden /> : <Play size={14} aria-hidden />}
                        {busy ? "Running batch" : "Run queued"}
                      </button>
                    </div>
                  </div>
                  <ul className="divide-y divide-line">
                    {items.map((item) => (
                      <li key={item.id} className={`flex items-center gap-3 px-4 py-3 ${activeId === item.id ? "bg-canvas/70" : ""}`}>
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                          onClick={() => { setActiveId(item.id); setSelectedDetection(-1); }}
                        >
                          <img src={item.previewUrl} alt="" className="size-12 shrink-0 rounded border border-line object-cover" />
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-medium text-ink">{item.file.name}</span>
                            <span className="mt-1 block text-[11px] text-muted">
                              {item.status === "done" && item.result
                                ? `${item.result.detections.length} boxes · ${item.result.latencyMs.toFixed(1)} ms`
                                : item.status === "running" ? "Running model inference" : item.status === "error" ? item.error : `${(item.file.size / 1024).toFixed(0)} KB · Ready`}
                            </span>
                          </span>
                        </button>
                        <span className="shrink-0 text-xs text-muted" aria-label={`Status: ${item.status}`}>
                          {item.status === "running" ? <LoaderCircle size={15} className="animate-spin" /> : item.status === "done" ? <Check size={15} className="text-emerald-700" /> : item.status === "error" ? <AlertCircle size={15} className="text-red-700" /> : "Ready"}
                        </span>
                        {!busy && (
                          <button type="button" className="rounded p-1 text-muted hover:bg-canvas hover:text-ink" aria-label={`Remove ${item.file.name}`} onClick={() => removeItem(item)}>
                            <Trash2 size={15} aria-hidden />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {!batchMode && activeItem && (
            <div className="rounded-xl border border-line bg-surface p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <FileImage size={18} className="shrink-0 text-muted" aria-hidden />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{activeItem.file.name}</p>
                    <p className="mt-1 text-xs text-muted">{(activeItem.file.size / 1024).toFixed(0)} KB</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn btn-ghost h-9 px-3 text-xs" disabled={busy} onClick={() => removeItem(activeItem)}>
                    Remove
                  </button>
                  {!robustnessMode && (
                    <button type="button" className="btn btn-primary h-9 px-3 text-xs" disabled={busy} onClick={() => void runSingle()}>
                      {busy ? <LoaderCircle size={14} className="animate-spin" aria-hidden /> : <Play size={14} aria-hidden />}
                      {busy ? "Running" : activeItem.status === "done" ? "Run again" : "Run prediction"}
                    </button>
                  )}
                </div>
              </div>
              {activeItem.status === "error" && (
                <p role="alert" className="mt-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden /> {activeItem.error}
                </p>
              )}
            </div>
          )}

          {!robustnessMode && activeResult && activeItem && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-line bg-surface p-4">
                <div className="min-w-[220px] flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor="confidence-filter" className="text-xs font-medium text-ink">Display confidence threshold</label>
                    <span className="font-mono text-xs tabular-nums text-ink">{(threshold * 100).toFixed(1)}%</span>
                  </div>
                  <input
                    id="confidence-filter"
                    type="range"
                    min="0.001"
                    max="0.9"
                    step="0.001"
                    value={threshold}
                    onChange={(event) => {
                      setThreshold(Number(event.target.value));
                      setSelectedDetection(-1);
                    }}
                    className="mt-3 w-full accent-[#374044]"
                  />
                  <p className="mt-1 text-[11px] leading-4 text-muted">Filters visible boxes only; the raw predictions are unchanged</p>
                </div>
                <div className="flex gap-1 rounded-md border border-line bg-canvas p-1" role="group" aria-label="Image view">
                  {([
                    ["comparison", "Compare"],
                    ["original", "Original"],
                    ["analysis", "Analysis"],
                  ] as const).map(([value, label]) => (
                    <button key={value} type="button" onClick={() => setViewMode(value)} className={`h-8 rounded px-3 text-xs transition-colors ${viewMode === value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {viewMode === "comparison" ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="overflow-hidden rounded-xl border border-line bg-surface">
                    <div className="flex items-center justify-between border-b border-line px-4 py-3">
                      <p className="text-xs font-medium text-ink">Original image</p>
                      <span className="font-mono text-[11px] text-muted">{activeResult.imageWidth} × {activeResult.imageHeight}</span>
                    </div>
                    <EvidenceImage
                      src={activeItem.previewUrl}
                      width={activeResult.imageWidth}
                      height={activeResult.imageHeight}
                      detections={[]}
                      rows={[]}
                      totalPenalty={rhiDetails.totalPenalty}
                      selectedIndex={-1}
                      onSelect={() => {}}
                      annotated={false}
                    />
                  </div>
                  <div className="overflow-hidden rounded-xl border border-line bg-surface">
                    <div className="flex items-center justify-between border-b border-line px-4 py-3">
                      <p className="text-xs font-medium text-ink">Model analysis</p>
                      <span className="font-mono text-[11px] text-muted">{visibleDetections.length} visible boxes</span>
                    </div>
                    <EvidenceImage
                      src={activeItem.previewUrl}
                      width={activeResult.imageWidth}
                      height={activeResult.imageHeight}
                      detections={visibleDetections}
                      rows={rhiDetails.rows}
                      totalPenalty={rhiDetails.totalPenalty}
                      selectedIndex={selectedDetection}
                      onSelect={setSelectedDetection}
                      annotated
                    />
                  </div>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-line bg-surface">
                  <div className="flex items-center justify-between border-b border-line px-4 py-3">
                    <p className="text-xs font-medium text-ink">{viewMode === "original" ? "Original image" : "Model analysis"}</p>
                    <span className="font-mono text-[11px] text-muted">{activeResult.imageWidth} × {activeResult.imageHeight}</span>
                  </div>
                  <EvidenceImage
                    src={activeItem.previewUrl}
                    width={activeResult.imageWidth}
                    height={activeResult.imageHeight}
                    detections={viewMode === "analysis" ? visibleDetections : []}
                    rows={viewMode === "analysis" ? rhiDetails.rows : []}
                    totalPenalty={rhiDetails.totalPenalty}
                    selectedIndex={viewMode === "analysis" ? selectedDetection : -1}
                    onSelect={setSelectedDetection}
                    annotated={viewMode === "analysis"}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Metric label="Visible detections" value={String(visibleDetections.length)} />
                <Metric
                  label="Raw candidates"
                  value={String(activeResult.detections.length)}
                  detail={`${activeResult.detections.length - visibleDetections.length} below threshold`}
                />
                <Metric label="Road Health Index" value={`${rhi} / 100`} detail={rhiStatus.label} />
                <Metric label="Inference time" value={`${activeResult.latencyMs.toFixed(1)} ms`} />
              </div>
            </div>
          )}

          {robustnessMode && activeItem && (
            <RobustnessLab
              key={activeItem.id}
              file={activeItem.file}
              sourceUrl={activeItem.previewUrl}
              mode={mode}
              threshold={threshold}
              busy={busy}
              onBusyChange={setBusy}
            />
          )}

        </section>

        {!robustnessMode && <aside className="grid gap-4 sm:grid-cols-2">
          {activeResult ? (
            <>
              <ChartCard
                title="Road Health Index"
                caption="A project heuristic based on visible detections, not an engineering pavement measurement"
                className="sm:row-span-2"
              >
                <RhiGauge value={rhi} label={rhiStatus.label} color={rhiStatus.color} />
                <div className="mt-3 rounded-md bg-canvas p-3 text-[11px] leading-5 text-muted">
                  <p className="font-medium text-ink">How the score is calculated</p>
                  <p className="mt-1">RHI = max(0, round(100 − total penalty))</p>
                  <p>Each box: severity × normalized area × confidence × 100</p>
                  <p>Area = box pixels ÷ image pixels · severity: D00/D10 ×2, D20 ×3, D40 ×4</p>
                  <p className="mt-2 font-mono tabular-nums text-ink">
                    100 − {rhiDetails.totalPenalty.toFixed(2)} = {Math.max(0, 100 - rhiDetails.totalPenalty).toFixed(2)} → {rhi}
                  </p>
                  <p className="mt-1">Only boxes at or above the {Math.round(threshold * 100)}% display threshold contribute.</p>
                </div>
              </ChartCard>

              <ChartCard title="Detections by class" caption="Share of visible model predictions">
                <DonutChart
                  centerLabel="boxes"
                  slices={DAMAGE_CODES.map((code) => ({
                    label: DAMAGE_CLASSES[code].label,
                    value: rhiDetails.byClass[code].count,
                    color: CLASS_COLORS[code],
                  }))}
                />
              </ChartCard>

              <ChartCard
                title="Confidence distribution"
                caption="All raw candidates; the vertical marker is the display filter"
                className="self-start"
              >
                <Histogram
                  values={activeResult.detections.map((detection) => detection.confidence)}
                  threshold={threshold}
                />
                <p className="mt-2 text-[11px] text-muted">
                  {visibleDetections.length} of {activeResult.detections.length} candidates are currently shown
                </p>
              </ChartCard>

              <ChartCard
                title="RHI penalty by class"
                caption="Points subtracted from the starting score of 100"
                className="sm:row-start-3 sm:col-start-1"
              >
                <BarList
                  max={Math.max(rhiDetails.totalPenalty, 1e-9)}
                  items={DAMAGE_CODES.map((code) => ({
                    label: DAMAGE_CLASSES[code].label,
                    value: rhiDetails.byClass[code].penalty,
                    display: `${rhiDetails.byClass[code].penalty.toFixed(2)} pts`,
                    color: CLASS_COLORS[code],
                  }))}
                />
              </ChartCard>

              <ChartCard
                title="Run details"
                caption="Metadata returned by the model API"
                className="sm:row-start-3 sm:col-start-2"
              >
                <dl className="space-y-2 text-xs">
                  <Metadata label="Configuration" value={activeResult.modelMode ?? mode} />
                  <Metadata label="Models used" value={activeResult.modelsUsed?.join(" + ") ?? "API did not report"} />
                  <Metadata label="Runtime device" value={activeResult.device ?? "API did not report"} />
                  <Metadata label="Image dimensions" value={`${activeResult.imageWidth} × ${activeResult.imageHeight}`} />
                  <Metadata label="Inference time" value={`${activeResult.latencyMs.toFixed(1)} ms`} />
                  <Metadata label="Raw candidates" value={String(activeResult.detections.length)} />
                </dl>
                <p className="mt-3 border-t border-line pt-3 text-[11px] leading-4 text-muted">
                  Requested mode: {modeDescription}
                </p>
              </ChartCard>

              <ChartCard
                title="Detection details"
                caption={`${visibleDetections.length} boxes at or above ${(threshold * 100).toFixed(1)}% confidence`}
                className="sm:col-span-2"
              >
                {rhiDetails.rows.length === 0 ? (
                  <p className="text-xs leading-5 text-muted">No boxes meet the current display threshold. Lower it to inspect more candidates.</p>
                ) : (
                  <ol className="max-h-[420px] divide-y divide-line overflow-y-auto">
                    {rhiDetails.rows.map((row, index) => {
                      const { detection } = row;
                      const { imageWidth, imageHeight } = activeResult;
                      const x1 = Math.round(detection.x1 * imageWidth);
                      const y1 = Math.round(detection.y1 * imageHeight);
                      const x2 = Math.round(detection.x2 * imageWidth);
                      const y2 = Math.round(detection.y2 * imageHeight);
                      return (
                        <li key={`${detection.code}-${row.rank}`}>
                          <button
                            type="button"
                            onClick={() => { setSelectedDetection(index); setViewMode("analysis"); }}
                            className={`w-full rounded px-2 py-3 text-left transition-colors hover:bg-canvas ${selectedDetection === index ? "bg-canvas" : ""}`}
                          >
                            <span className="flex items-center justify-between gap-3">
                              <span className="flex min-w-0 items-center gap-2">
                                <span className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: CLASS_COLORS[detection.code] }} />
                                <span className="font-mono text-xs text-ink">{detection.code}</span>
                                <span className="truncate text-xs text-muted">{DAMAGE_CLASSES[detection.code].label}</span>
                                <span className="text-xs text-muted">#{row.rank}</span>
                              </span>
                              <span className="shrink-0 font-mono text-xs tabular-nums text-ink">
                                {(detection.confidence * 100).toFixed(1)}%
                              </span>
                            </span>
                            <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
                              <span>{x2 - x1} × {y2 - y1} px</span>
                              <span>{(row.area * 100).toFixed(2)}% of image</span>
                              <span>Severity ×{row.severity}</span>
                              <span className="font-mono tabular-nums text-ink">−{row.penalty.toFixed(2)} RHI pts</span>
                            </span>
                            {selectedDetection === index && (
                              <span className="mt-2 block font-mono text-[11px] text-muted">
                                Coordinates: ({x1}, {y1}) → ({x2}, {y2})
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </ChartCard>

            </>
          ) : (
            <section className="rounded-xl border border-line bg-surface p-5 sm:col-span-2">
              <h2 className="text-sm font-medium text-ink">How to read a result</h2>
              <ol className="mt-4 space-y-4 text-xs leading-5 text-muted">
                <li><span className="mr-2 font-mono text-primary">01</span>Upload a road image and choose an inference configuration</li>
                <li><span className="mr-2 font-mono text-primary">02</span>Compare the original with the boxes returned by the model</li>
                <li><span className="mr-2 font-mono text-primary">03</span>Click a box or row to inspect confidence, dimensions and coordinates</li>
                <li><span className="mr-2 font-mono text-primary">04</span>Adjust the display threshold or export a detailed report</li>
              </ol>
            </section>
          )}
        </aside>}
      </div>

      {formError && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800">{formError}</p>}

      {batchMode && completed > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4">
          <div>
            <p className="text-sm font-medium text-ink">Export batch predictions</p>
            <p className="mt-1 text-xs text-muted">CSV uses original-image pixel coordinates, class IDs and a 0.001 candidate score floor</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => downloadSubmission(items)}>
            <ArrowDownToLine size={15} aria-hidden /> Download predictions CSV
          </button>
        </div>
      )}

      <PredictionPageNote />

      {report && (
        <InspectionReportModal
          fileName={report.item.file.name}
          rawImageUrl={report.item.previewUrl}
          annotatedCanvas={report.canvas}
          detections={report.item.result?.detections ?? []}
          threshold={threshold}
          latencyMs={report.item.result?.latencyMs ?? 0}
          modelMode={report.item.result?.modelMode ?? mode}
          imageWidth={report.item.result?.imageWidth ?? 0}
          imageHeight={report.item.result?.imageHeight ?? 0}
          onClose={() => setReport(null)}
        />
      )}
    </div>
  );
}

function UploadArea({
  inputRef,
  multiple,
  dragging,
  setDragging,
  onFiles,
  onDrop,
  onBrowse,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  multiple: boolean;
  dragging: boolean;
  setDragging: (value: boolean) => void;
  onFiles: (event: ChangeEvent<HTMLInputElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onBrowse: () => void;
}) {
  return (
    <div
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={`rounded-xl border border-dashed p-6 text-center transition-colors sm:p-8 ${dragging ? "border-primary bg-primary-soft" : "border-line bg-surface hover:border-primary/60"}`}
    >
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple={multiple} onChange={onFiles} className="sr-only" />
      <span className="mx-auto flex size-11 items-center justify-center rounded-md border border-line bg-canvas text-primary">
        <ImagePlus size={20} aria-hidden />
      </span>
      <h2 className="mt-4 text-base font-medium text-ink">
        {multiple ? "Add road images to the batch" : "Choose a road image to test"}
      </h2>
      <p className="mt-2 text-xs leading-5 text-muted">
        Drop {multiple ? "one or more images" : "an image"} here or browse · JPG, PNG or WEBP · up to 15 MB each
      </p>
      <button type="button" onClick={onBrowse} className="btn btn-primary mt-5">
        Browse images
      </button>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-2 font-mono text-lg tabular-nums text-ink">{value}</p>
      {detail && <p className="mt-1 text-[11px] text-muted">{detail}</p>}
    </div>
  );
}

function Metadata({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-right font-mono text-[11px] text-ink">{value}</dd>
    </div>
  );
}
