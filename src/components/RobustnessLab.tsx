import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, LoaderCircle, Play } from "lucide-react";
import EvidenceImage from "./EvidenceImage";
import { runInference, type InferenceResult, type ModelInferenceMode } from "../lib/api";
import { breakdown } from "../lib/analytics";
import { compareRobustness, createRobustnessVariant, ROBUSTNESS_CONDITIONS, type RobustnessConditionId } from "../lib/robustness";

interface RobustnessRun {
  conditionId: RobustnessConditionId;
  previewUrl?: string;
  result?: InferenceResult;
  error?: string;
}

interface RobustnessLabProps {
  file: File;
  sourceUrl: string;
  mode: ModelInferenceMode;
  threshold: number;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
}

function visibleDetections(result: InferenceResult, threshold: number) {
  return result.detections
    .filter((detection) => detection.confidence >= threshold)
    .sort((a, b) => b.confidence - a.confidence);
}

function formatDelta(value: number | null) {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)} pp`;
}

export default function RobustnessLab({
  file,
  sourceUrl,
  mode,
  threshold,
  busy,
  onBusyChange,
}: RobustnessLabProps) {
  const [selectedIds, setSelectedIds] = useState<RobustnessConditionId[]>(
    () => ROBUSTNESS_CONDITIONS.map((condition) => condition.id),
  );
  const [baseline, setBaseline] = useState<InferenceResult | null>(null);
  const [runs, setRuns] = useState<RobustnessRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<RobustnessConditionId | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const previewUrlsRef = useRef(new Set<string>());

  useEffect(
    () => () => previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url)),
    [],
  );

  const selectedConditions = useMemo(
    () => ROBUSTNESS_CONDITIONS.filter((condition) => selectedIds.includes(condition.id)),
    [selectedIds],
  );
  const completedRuns = runs.filter((run) => run.result);
  const comparisons = completedRuns.map((run) => ({
    run,
    stats: compareRobustness(baseline?.detections ?? [], run.result!.detections, threshold),
  }));
  const meanRetention = comparisons
    .map(({ stats }) => stats.retentionRate)
    .filter((value): value is number => value !== null);
  const averageRetention = meanRetention.length
    ? meanRetention.reduce((sum, value) => sum + value, 0) / meanRetention.length
    : null;
  const selectedRun = runs.find((run) => run.conditionId === selectedRunId && run.result);
  const cleanBoxes = baseline ? visibleDetections(baseline, threshold) : [];
  const cleanBreakdown = breakdown(cleanBoxes);
  const alteredBoxes = selectedRun?.result ? visibleDetections(selectedRun.result, threshold) : [];
  const alteredBreakdown = breakdown(alteredBoxes);

  const clearResults = () => {
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrlsRef.current.clear();
    setBaseline(null);
    setRuns([]);
    setSelectedRunId(null);
    setProgress("");
    setError("");
  };

  const toggleCondition = (conditionId: RobustnessConditionId) => {
    if (busy) return;
    clearResults();
    setSelectedIds((current) =>
      current.includes(conditionId)
        ? current.filter((value) => value !== conditionId)
        : [...current, conditionId],
    );
  };

  const runSuite = async () => {
    if (busy || selectedConditions.length === 0) return;
    clearResults();
    setRunning(true);
    onBusyChange(true);
    try {
      setProgress("Running clean-image baseline");
      const cleanResult = await runInference(file, mode, 0.001);
      setBaseline(cleanResult);

      let failedConditions = 0;
      for (const [index, condition] of selectedConditions.entries()) {
        setProgress(`Testing ${condition.label} (${index + 1}/${selectedConditions.length})`);
        let previewUrl: string | undefined;
        try {
          const blob = await createRobustnessVariant(file, condition.id);
          previewUrl = URL.createObjectURL(blob);
          previewUrlsRef.current.add(previewUrl);
          const extension = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
          const variantFile = new File(
            [blob],
            `${file.name.replace(/\.[^/.]+$/, "")}-${condition.id}.${extension}`,
            { type: blob.type },
          );
          const result = await runInference(variantFile, mode, 0.001);
          setRuns((current) => [...current, { conditionId: condition.id, previewUrl, result }]);
          setSelectedRunId((current) => current ?? condition.id);
        } catch (runError) {
          failedConditions += 1;
          setRuns((current) => [
            ...current,
            {
              conditionId: condition.id,
              previewUrl,
              error: runError instanceof Error ? runError.message : "The condition test failed.",
            },
          ]);
        }
      }
      setProgress(
        failedConditions
          ? `Finished with ${failedConditions} condition ${failedConditions === 1 ? "error" : "errors"}`
          : "Robustness tests complete",
      );
    } catch (baselineError) {
      setError(baselineError instanceof Error ? baselineError.message : "The clean-image baseline failed.");
      setProgress("");
    } finally {
      setRunning(false);
      onBusyChange(false);
    }
  };

  return (
    <section className="space-y-4 rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-medium text-ink">Robustness lab</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted">
            Compare the model on the clean image and controlled lighting, blur, compression, haze, and occlusion variants
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || selectedConditions.length === 0}
            onClick={() => void runSuite()}
          >
            {running ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : <Play size={15} aria-hidden />}
            {running ? progress : baseline ? "Run tests again" : "Run robustness tests"}
          </button>
          {!running && progress && <p role="status" className="text-[11px] text-muted">{progress}</p>}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {ROBUSTNESS_CONDITIONS.map((condition) => (
          <label
            key={condition.id}
            className={`flex min-w-0 items-start gap-2 rounded-md border p-3 text-xs transition-colors ${
              selectedIds.includes(condition.id) ? "border-primary/40 bg-canvas" : "border-line bg-surface"
            } ${busy ? "opacity-60" : "cursor-pointer hover:border-primary/50"}`}
          >
            <input
              type="checkbox"
              checked={selectedIds.includes(condition.id)}
              disabled={busy}
              onChange={() => toggleCondition(condition.id)}
              className="mt-0.5 accent-[#374044]"
            />
            <span className="min-w-0">
              <span className="block font-medium text-ink">{condition.label}</span>
              <span className="mt-1 block text-[11px] leading-4 text-muted">{condition.description}</span>
            </span>
          </label>
        ))}
      </div>

      <p className="rounded-md bg-canvas px-3 py-2 text-[11px] leading-5 text-muted">
        Consistency compares same-class boxes at IoU ≥ 0.50 against the clean baseline. Without labeled boxes this is not accuracy, precision, or recall. The display threshold is {(threshold * 100).toFixed(1)}%.
      </p>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800">
          <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden /> {error}
        </p>
      )}

      {baseline && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-line p-3">
              <p className="text-[11px] text-muted">Clean-image detections</p>
              <p className="mt-1 font-mono text-lg tabular-nums text-ink">{cleanBoxes.length}</p>
              <p className="text-[11px] text-muted">At current threshold</p>
            </div>
            <div className="rounded-lg border border-line p-3">
              <p className="text-[11px] text-muted">Average box retention</p>
              <p className="mt-1 font-mono text-lg tabular-nums text-ink">
                {averageRetention === null ? "N/A" : `${averageRetention.toFixed(1)}%`}
              </p>
              <p className="text-[11px] text-muted">Across comparable completed tests</p>
            </div>
            <div className="rounded-lg border border-line p-3">
              <p className="text-[11px] text-muted">Completed conditions</p>
              <p className="mt-1 font-mono text-lg tabular-nums text-ink">{completedRuns.length}/{selectedConditions.length}</p>
              <p className="text-[11px] text-muted">API runs completed</p>
            </div>
          </div>

          {runs.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full min-w-[680px] text-left text-xs">
                <thead className="bg-canvas text-[11px] text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Condition</th>
                    <th className="px-3 py-2 font-medium">Boxes</th>
                    <th className="px-3 py-2 font-medium">Retained</th>
                    <th className="px-3 py-2 font-medium">Mean IoU</th>
                    <th className="px-3 py-2 font-medium">Confidence Δ</th>
                    <th className="px-3 py-2 font-medium">Latency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {runs.map((run) => {
                    const condition = ROBUSTNESS_CONDITIONS.find((item) => item.id === run.conditionId)!;
                    const stats = run.result && baseline
                      ? compareRobustness(baseline.detections, run.result.detections, threshold)
                      : null;
                    return (
                      <tr key={run.conditionId} className={selectedRunId === run.conditionId ? "bg-canvas/70" : ""}>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            disabled={!run.result}
                            aria-pressed={selectedRunId === run.conditionId}
                            onClick={() => setSelectedRunId(run.conditionId)}
                            className="text-left font-medium text-ink hover:underline disabled:cursor-default disabled:no-underline"
                          >
                            {condition.label}
                          </button>
                          {run.error && <p className="mt-1 max-w-56 text-[11px] text-red-700">{run.error}</p>}
                        </td>
                        <td className="px-3 py-2 font-mono tabular-nums text-ink">
                          {stats ? `${stats.variantCount} / ${stats.baselineCount}` : "—"}
                        </td>
                        <td className="px-3 py-2 font-mono tabular-nums text-ink">
                          {stats?.retentionRate === null || !stats ? "N/A" : `${stats.matchedCount} · ${stats.retentionRate.toFixed(0)}%`}
                        </td>
                        <td className="px-3 py-2 font-mono tabular-nums text-ink">
                          {stats?.meanIou === null || !stats ? "—" : `${(stats.meanIou * 100).toFixed(0)}%`}
                        </td>
                        <td className="px-3 py-2 font-mono tabular-nums text-ink">
                          {formatDelta(stats?.meanConfidenceDelta ?? null)}
                        </td>
                        <td className="px-3 py-2 font-mono tabular-nums text-ink">
                          {run.result ? `${run.result.latencyMs.toFixed(0)} ms` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {selectedRun?.result && selectedRun.previewUrl && (
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-medium text-ink">
                  Clean image vs {ROBUSTNESS_CONDITIONS.find((condition) => condition.id === selectedRun.conditionId)?.label}
                </h3>
                <p className="mt-1 text-[11px] text-muted">Hover over any box for class, confidence, coordinates, and RHI impact</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="overflow-hidden rounded-lg border border-line">
                  <p className="border-b border-line px-3 py-2 text-xs font-medium text-ink">Clean baseline · {cleanBoxes.length} boxes</p>
                  <EvidenceImage
                    src={sourceUrl}
                    width={baseline.imageWidth}
                    height={baseline.imageHeight}
                    detections={cleanBoxes}
                    rows={cleanBreakdown.rows}
                    totalPenalty={cleanBreakdown.totalPenalty}
                    selectedIndex={-1}
                    onSelect={() => {}}
                    annotated
                  />
                </div>
                <div className="overflow-hidden rounded-lg border border-line">
                  <p className="border-b border-line px-3 py-2 text-xs font-medium text-ink">
                    {ROBUSTNESS_CONDITIONS.find((condition) => condition.id === selectedRun.conditionId)?.label} · {alteredBoxes.length} boxes
                  </p>
                  <EvidenceImage
                    src={selectedRun.previewUrl}
                    width={selectedRun.result.imageWidth}
                    height={selectedRun.result.imageHeight}
                    detections={alteredBoxes}
                    rows={alteredBreakdown.rows}
                    totalPenalty={alteredBreakdown.totalPenalty}
                    selectedIndex={-1}
                    onSelect={() => {}}
                    annotated
                  />
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {!baseline && !error && !running && (
        <p className="text-xs text-muted">Choose the conditions to simulate, then run the suite against this image.</p>
      )}
    </section>
  );
}
