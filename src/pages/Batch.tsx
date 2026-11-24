import { useCallback, useRef, useState } from "react";
import { Upload, Loader2, Download, X, CheckCircle2, AlertCircle, Files } from "lucide-react";
import { runInference, type ModelInferenceMode } from "../lib/api";
import { computeRHI, type Detection } from "../lib/damage";
import PageHeader from "../components/PageHeader";

interface BatchItem {
  id: string;
  file: File;
  status: "queued" | "running" | "done" | "error";
  detections?: Detection[];
  latencyMs?: number;
  width?: number;
  height?: number;
  rhi?: number;
  error?: string;
}

const CLASS_TO_ID: Record<string, number> = {
  D00: 0,
  D10: 1,
  D20: 2,
  D40: 3,
};

function buildCSV(items: BatchItem[], useNumericClasses: boolean = false): string {
  const rows = ["image_id,PredictionString"];
  for (const item of items) {
    if (item.status !== "done") continue;
    const dets = item.detections ?? [];
    if (dets.length === 0) {
      rows.push(`${item.file.name},none`);
    } else {
      const W = item.width || 1280;
      const H = item.height || 720;
      // Sort by confidence descending and cap at 100 boxes (Kaggle rule)
      const sortedDets = [...dets]
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 100);

      const parts = sortedDets.map((d) => {
        const cls = useNumericClasses ? (CLASS_TO_ID[d.code] ?? 0) : d.code;
        const conf = d.confidence.toFixed(6);
        const x1 = (d.x1 * W).toFixed(1);
        const y1 = (d.y1 * H).toFixed(1);
        const x2 = (d.x2 * W).toFixed(1);
        const y2 = (d.y2 * H).toFixed(1);
        return `${cls} ${conf} ${x1} ${y1} ${x2} ${y2}`;
      });
      rows.push(`${item.file.name},${parts.join(" ")}`);
    }
  }
  return rows.join("\n");
}

function downloadCSV(content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "submission.csv";
  a.click();
}

export default function Batch() {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [running, setRunning] = useState(false);
  const [batchMode, setBatchMode] = useState<ModelInferenceMode>("ensemble");
  const [useNumericId, setUseNumericId] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((files: FileList) => {
    const newItems: BatchItem[] = Array.from(files)
      .filter((f) => ["image/jpeg", "image/png", "image/webp"].includes(f.type))
      .map((f) => ({
        id: `${f.name}-${f.lastModified}`,
        file: f,
        status: "queued" as const,
      }));
    setItems((prev) => {
      const existing = new Set(prev.map((i) => i.id));
      return [...prev, ...newItems.filter((n) => !existing.has(n.id))];
    });
  }, []);

  const removeItem = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

  const runBatch = async () => {
    if (running) return;
    setRunning(true);
    for (const item of items) {
      if (item.status === "done") continue;
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: "running" } : i)));
      try {
        const result = await runInference(item.file, batchMode, 0.001);
        const rhi = computeRHI(result.detections, 0.182);
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? {
                  ...i,
                  status: "done",
                  detections: result.detections,
                  latencyMs: result.latencyMs,
                  width: result.imageWidth,
                  height: result.imageHeight,
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

  const done = items.filter((i) => i.status === "done").length;
  const total = items.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  };

  return (
    <>
      <PageHeader
        title="Batch & CSV Export Pipeline"
        description="Queue multiple road frames, execute dual-scale ensemble inference sequentially, and download an official RDD2020 submission.csv."
        actions={
          <div className="flex items-center gap-2">
            {items.some((i) => i.status === "done") && (
              <button onClick={() => downloadCSV(buildCSV(items, useNumericId))} className="btn btn-ghost">
                <Download size={15} strokeWidth={1.5} aria-hidden />
                Export submission.csv
              </button>
            )}
            {items.length > 0 && !running && (
              <button onClick={runBatch} className="btn btn-primary">
                <Loader2 size={15} strokeWidth={1.5} className={running ? "animate-spin" : ""} aria-hidden />
                Run Batch Inference
              </button>
            )}
          </div>
        }
      />

      <div className="mt-8 flex flex-col gap-6">
        {/* Settings Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-surface p-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold text-muted">Inference Model:</span>
            {(
              [
                { id: "ensemble", label: "Ensemble (1088 + 640)" },
                { id: "main_only", label: "Main Only (1088px)" },
                { id: "640_only", label: "640px" },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                disabled={running}
                onClick={() => setBatchMode(m.id)}
                className={`rounded-sm px-3 py-1 font-mono text-xs font-medium transition-colors ${
                  batchMode === m.id
                    ? "bg-primary text-white"
                    : "border border-line bg-canvas text-muted hover:text-ink"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 cursor-pointer font-mono text-xs text-muted">
            <input
              type="checkbox"
              checked={useNumericId}
              onChange={(e) => setUseNumericId(e.target.checked)}
              className="accent-primary rounded-sm"
            />
            <span>Use numeric class IDs (0, 1, 2, 3)</span>
          </label>
        </div>

        {/* Dropzone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className="flex cursor-pointer items-center justify-center gap-4 rounded-xl border-2 border-dashed border-line bg-surface py-10 text-center transition-colors hover:border-primary/40 hover:bg-canvas"
        >
          <Upload size={20} strokeWidth={1.5} className="text-muted" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-ink">Drop survey image frames here, or click to browse</p>
            <p className="mt-0.5 font-mono text-xs text-muted">JPG · PNG · WEBP — multiple files supported</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp"
            multiple
            className="sr-only"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
            }}
          />
        </div>

        {/* Progress bar */}
        {running && (
          <div>
            <div className="mb-2 flex justify-between font-mono text-xs text-muted">
              <span>Processing batch: {done + 1} of {total}…</span>
              <span>{pct}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-canvas">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}

        {/* Queue Table */}
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-line bg-surface py-16 text-center">
            <Files size={28} strokeWidth={1.5} className="text-muted" aria-hidden />
            <p className="text-sm text-muted">No images queued yet. Drop frames above to begin.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-canvas">
                  <th className="px-4 py-3 text-left font-semibold text-ink">Image ID / File</th>
                  <th className="px-4 py-3 text-right font-mono text-xs font-semibold text-muted">Status</th>
                  <th className="px-4 py-3 text-right font-mono text-xs font-semibold text-muted">Detections (≤ 100)</th>
                  <th className="px-4 py-3 text-right font-mono text-xs font-semibold text-muted">Road Health</th>
                  <th className="px-4 py-3 text-right font-mono text-xs font-semibold text-muted">Latency</th>
                  <th className="px-4 py-3 text-right w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((item) => (
                  <tr key={item.id} className="group">
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs font-medium text-ink truncate max-w-xs">{item.file.name}</p>
                      <p className="font-mono text-[10px] text-muted">{(item.file.size / 1024).toFixed(1)} KB</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {item.status === "queued" && <span className="font-mono text-xs text-muted">Queued</span>}
                      {item.status === "running" && (
                        <span className="inline-flex items-center gap-1 font-mono text-xs text-primary">
                          <Loader2 size={12} className="animate-spin" /> Running
                        </span>
                      )}
                      {item.status === "done" && (
                        <span className="inline-flex items-center gap-1 font-mono text-xs text-green-600">
                          <CheckCircle2 size={12} /> Done
                        </span>
                      )}
                      {item.status === "error" && (
                        <span className="inline-flex items-center gap-1 font-mono text-xs text-red-500">
                          <AlertCircle size={12} /> Error
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-ink">
                      {item.status === "done" ? item.detections?.length ?? 0 : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs font-bold text-ink">
                      {item.status === "done" ? item.rhi : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-muted">
                      {item.latencyMs ? `${item.latencyMs.toFixed(0)} ms` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!running && (
                        <button
                          onClick={() => removeItem(item.id)}
                          className="invisible text-muted hover:text-red-500 group-hover:visible"
                        >
                          <X size={14} strokeWidth={1.5} aria-hidden />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* CSV Preview */}
        {items.some((i) => i.status === "done") && (
          <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                submission.csv Output Format Preview
              </p>
              <span className="font-mono text-[11px] text-muted">
                {items.filter((i) => i.status === "done" && (i.detections?.length ?? 0) === 0).length} images tagged 'none'
              </span>
            </div>
            <pre className="overflow-x-auto rounded-lg bg-canvas p-4 font-mono text-xs text-ink leading-relaxed whitespace-pre">
              {buildCSV(items, useNumericId).split("\n").slice(0, 8).join("\n")}
              {buildCSV(items, useNumericId).split("\n").length > 8 ? "\n…" : ""}
            </pre>
          </div>
        )}
      </div>
    </>
  );
}
