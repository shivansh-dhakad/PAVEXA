import { useEffect, useState } from "react";
import { Check, FileImage, Layers3, ScanSearch, Workflow } from "lucide-react";
import { useInView } from "./Reveal";

const STEP_MS = 2600;

const steps = [
  {
    icon: FileImage,
    title: "Road image",
    value: "JPG · PNG · WEBP",
    input: "Your uploaded road photo",
    output: "The same pixels, sent to both detectors",
    note: "The image is uploaded to the API once and then read at two different scales.",
  },
  {
    icon: ScanSearch,
    title: "Main detector",
    value: "YOLO26s · 1088 px + TTA",
    input: "Image resized to 1088 px",
    output: "Candidate boxes with a class and a score",
    note: "Trained at 1024 px. Test-time augmentation is switched on for the final preset to catch fine cracks.",
  },
  {
    icon: Layers3,
    title: "Second detector",
    value: "YOLO26s · 640 px",
    input: "The same image resized to 640 px",
    output: "A second set of candidate boxes",
    note: "A lower input scale gives a broader view, which helps with larger defects.",
  },
  {
    icon: Workflow,
    title: "Weighted Box Fusion",
    value: "IoU 0.55 · weights 1:1",
    input: "Both sets of candidate boxes",
    output: "One fused box per overlapping cluster",
    note: "Same-class boxes that overlap are merged, and their coordinates are averaged using confidence.",
  },
  {
    icon: Check,
    title: "Ranked detections",
    value: "Score ≥ 0.001 · max 100",
    input: "Fused boxes",
    output: "The top 100 boxes, sorted by score",
    note: "Low-score candidates are kept so they can be ranked. The display threshold only filters what you see.",
  },
];

export default function InferencePath() {
  const [ref, inView] = useInView<HTMLDivElement>(0.3);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    setReduceMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  const playing = inView && !paused && !reduceMotion;

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => setActive((a) => (a + 1) % steps.length), STEP_MS);
    return () => window.clearTimeout(timer);
  }, [playing, active]);

  const last = steps.length - 1;
  const progress = (active / last) * 100;
  const current = steps[active];

  return (
    <div
      ref={ref}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="rounded-2xl border border-line bg-surface/90 p-5 backdrop-blur-sm sm:p-8"
    >
      <div className="relative">
        {/* Track between the first and last step centres */}
        <div className="absolute left-[10%] right-[10%] top-[22px] hidden h-0.5 bg-line md:block" aria-hidden>
          <div className="h-full bg-primary transition-[width] duration-700 ease-out" style={{ width: `${progress}%` }} />
          <span
            className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-4 ring-primary/20 transition-[left] duration-700 ease-out"
            style={{ left: `${progress}%` }}
          />
        </div>

        <ol className="relative grid gap-3 md:grid-cols-5">
          {steps.map(({ icon: Icon, title, value }, index) => {
            const isActive = index === active;
            const isDone = index < active;
            return (
              <li key={title}>
                <button
                  type="button"
                  onClick={() => setActive(index)}
                  aria-current={isActive ? "step" : undefined}
                  className="group flex w-full items-center gap-3 rounded-lg p-1 text-left md:flex-col md:text-center"
                >
                  <span
                    className={`relative z-10 flex size-11 shrink-0 items-center justify-center rounded-full border transition-all duration-500 ${
                      isActive
                        ? "scale-110 border-primary bg-primary text-white shadow-lg"
                        : isDone
                          ? "border-primary bg-primary/90 text-white"
                          : "border-line bg-surface text-muted group-hover:border-primary/50 group-hover:text-ink"
                    }`}
                  >
                    {isActive && playing && (
                      <span className="absolute inset-0 animate-ping rounded-full bg-primary/25" aria-hidden />
                    )}
                    <Icon size={18} strokeWidth={1.6} aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-sm font-medium transition-colors ${isActive ? "text-ink" : "text-muted"}`}>
                      {title}
                    </span>
                    <span className="mt-0.5 block font-mono text-[11px] text-muted">{value}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="mt-8 grid gap-5 rounded-xl bg-canvas/90 p-5 md:grid-cols-[1.4fr_1fr_1fr]" aria-live="polite">
        <div key={`note-${active}`} className="page-enter">
          <p className="text-xs text-muted">
            Step {active + 1} of {steps.length}
          </p>
          <h3 className="mt-1 font-display text-2xl text-ink">{current.title}</h3>
          <p className="mt-2 text-xs leading-5 text-muted">{current.note}</p>
        </div>
        <div key={`in-${active}`} className="page-enter">
          <p className="text-xs font-medium text-ink">Goes in</p>
          <p className="mt-2 text-xs leading-5 text-muted">{current.input}</p>
        </div>
        <div key={`out-${active}`} className="page-enter">
          <p className="text-xs font-medium text-ink">Comes out</p>
          <p className="mt-2 text-xs leading-5 text-muted">{current.output}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <div className="h-0.5 flex-1 overflow-hidden rounded bg-line">
          {playing && <div key={active} className="step-progress h-full bg-primary/60" />}
        </div>
        <p className="shrink-0 text-[11px] text-muted">Hover to pause · click a step to jump to it</p>
      </div>
    </div>
  );
}
