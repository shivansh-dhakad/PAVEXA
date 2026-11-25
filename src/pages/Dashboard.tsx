import { useEffect, useRef, type ReactNode } from "react";
import { ArrowRight, ChevronDown, CircleHelp, Cpu, Database, Gauge } from "lucide-react";
import { Link } from "react-router-dom";
import CountUp from "../components/CountUp";
import DamageCard, { type DamageCardProps } from "../components/DamageCard";
import InferencePath from "../components/InferencePath";
import Reveal, { useInView } from "../components/Reveal";
import { CLASS_COLORS } from "../lib/damage";

const validationMetrics = [
  { to: 49.39, decimals: 2, suffix: "%", label: "Local validation accuracy score" },
  { to: 59.1, decimals: 2, suffix: "%", label: "mAP@50" },
  { to: 26.08, decimals: 2, suffix: "%", label: "mAP@50:95" },
  { to: 2150, decimals: 0, suffix: "", label: "Validation images" },
];

const trainingSettings = [
  ["Starting weights", "COCO-pretrained yolo26s.pt"],
  ["Training resolution", "1024 px main · 640 px second detector"],
  ["Epochs / patience", "60 epochs · patience 15 (both ran all 60)"],
  ["Batch / warm-up", "Batch 32 · 2 epochs main / 3 epochs second"],
  ["Mosaic close", "8 epochs main / 10 epochs second"],
  ["Optimizer schedule", "Cosine learning rate · lr0 0.01 · lrf 0.01"],
  ["Regularization", "Momentum 0.937 · weight decay 0.0005"],
  ["Reproducibility", "Seed 42 · deterministic training · AMP"],
  ["Road geometry", "Horizontal flip 0.5 · translate 0.1 · scale 0.4"],
  ["Orientation", "No rotation or vertical flip; roads have a fixed vertical orientation"],
  ["Appearance", "Mosaic 1.0 · HSV hue 0.015 / saturation 0.6 / value 0.5"],
  ["Robustness", "Random erasing 0.4 · RandAugment · blur, noise, JPEG, brightness and gamma"],
];

const damageClasses: DamageCardProps[] = [
  {
    code: "D00",
    name: "Longitudinal crack",
    short: "LONGITUDINAL",
    description: "Cracks that run along the direction of travel, usually at lane seams and construction joints.",
    repair: "Route the crack and seal it with hot-pour elastomeric sealant.",
    severity: "Moderate, weighted ×2 in the Road Health Index",
    weight: 2,
    share: "26.3%",
    color: CLASS_COLORS.D00,
  },
  {
    code: "D10",
    name: "Transverse crack",
    short: "TRANSVERSE",
    description: "Cracks that cross the direction of travel, often caused by thermal contraction of the pavement.",
    repair: "Clean the crack and fill it with sealant; watch for new cracks forming at regular spacing.",
    severity: "Moderate, weighted ×2 in the Road Health Index",
    weight: 2,
    share: "17.9%",
    color: CLASS_COLORS.D10,
  },
  {
    code: "D20",
    name: "Alligator crack",
    short: "ALLIGATOR",
    description: "A web of interconnected cracks forming small polygons, a typical sign of fatigue in the pavement structure.",
    repair: "Cut out the failed area and patch it, repairing the base layer underneath if it is weak.",
    severity: "High, weighted ×3 in the Road Health Index",
    weight: 3,
    share: "33.5%",
    color: CLASS_COLORS.D20,
  },
  {
    code: "D40",
    name: "Pothole",
    short: "POTHOLE",
    description: "A bowl-shaped cavity where surface material has broken away and left the layers below exposed.",
    repair: "Remove loose material, then fill with hot-mix or cold-patch asphalt and compact it.",
    severity: "Severe, weighted ×4 in the Road Health Index",
    weight: 4,
    share: "22.4%",
    color: CLASS_COLORS.D40,
  },
];

const scoreRuns = [
  { name: "1088 px detector", score: 45.9, latency: "41.5 ms" },
  { name: "1088 px with TTA", score: 47.95, latency: "93.7 ms" },
  { name: "1088 + 640 px, WBF", score: 48.54, latency: "60.7 ms" },
  { name: "Final: TTA + ensemble", score: 49.39, latency: "~110 ms" },
];

function ScrollProgress() {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const progress = max > 0 ? window.scrollY / max : 0;
      if (bar.current) bar.current.style.transform = `scaleX(${progress})`;
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return (
    <div className="fixed inset-x-0 top-0 z-30 h-0.5" aria-hidden>
      <div ref={bar} className="h-full origin-left bg-primary" style={{ transform: "scaleX(0)" }} />
    </div>
  );
}

function ScoreBar({ pct, highlight, delay }: { pct: number; highlight: boolean; delay: number }) {
  const [ref, inView] = useInView<HTMLDivElement>(0.5);
  return (
    <div ref={ref} className="mt-3 h-2 overflow-hidden rounded-sm bg-canvas">
      <div
        className={`h-full rounded-sm transition-[width] duration-1000 ease-out ${highlight ? "bg-primary" : "bg-[#9ba3a4]"}`}
        style={{ width: inView ? `${pct}%` : "0%", transitionDelay: `${delay}ms` }}
      />
    </div>
  );
}

function SectionTitle({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <Reveal className="mb-8 max-w-3xl">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">{eyebrow}</p>
      <h2 className="mt-2 text-3xl text-ink sm:text-4xl">{title}</h2>
      {children && <p className="mt-3 text-sm leading-6 text-muted">{children}</p>}
    </Reveal>
  );
}

export default function Dashboard() {
  const heroImage = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (heroImage.current) {
          heroImage.current.style.transform = `translateY(${Math.min(window.scrollY, 700) * 0.12}px) scale(1.12)`;
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <div className="space-y-24 pb-16">
      <ScrollProgress />

      {/* Hero */}
      <section className="grid overflow-hidden rounded-2xl border border-line bg-surface/80 backdrop-blur-sm lg:grid-cols-[1.05fr_0.95fr]">
        <div className="flex flex-col justify-center p-5 sm:p-8 lg:p-10">
          <Reveal>
            <p className="text-xs font-medium uppercase tracking-wider text-muted">DataSprint 2.0 · RDD2020</p>
          </Reveal>
          <Reveal delay={100}>
            <h1 className="mt-3 max-w-xl text-3xl leading-tight text-ink sm:text-4xl lg:text-5xl">
              What does the road damage model actually detect?
            </h1>
          </Reveal>
          <Reveal delay={200}>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
              PAVEXA runs a two-scale YOLO26s object detector on road images. It predicts one of four
              damage classes and returns a confidence score and bounding box for each candidate.
            </p>
          </Reveal>
          <Reveal delay={300}>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link to="/predict" className="btn btn-primary group">
                Run a prediction{" "}
                <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-1" aria-hidden />
              </Link>
              <a
                href="https://github.com/shivansh-dhakad/DataSprint-2.0-Road-Damage-Detection"
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost"
              >
                Read the model source
              </a>
            </div>
          </Reveal>
          <Reveal delay={400}>
            <div className="mt-5 flex items-start gap-3 border-t border-line pt-4 text-xs leading-5 text-muted">
              <CircleHelp size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden />
              <p>
                Predictions on unlabeled uploads are detections, not accuracy measurements. Accuracy
                metrics below come from the labeled validation split.
              </p>
            </div>
          </Reveal>
          <a
            href="#damage"
            className="mt-4 inline-flex w-fit items-center gap-2 text-xs text-muted transition-colors hover:text-ink"
          >
            Explore the damage classes <ChevronDown size={14} className="animate-bounce" aria-hidden />
          </a>
        </div>
        <div className="relative min-h-52 overflow-hidden bg-[#222a2b] lg:min-h-0">
          <img
            ref={heroImage}
            src="/hero-road.jpg"
            alt="Road image from the bundled road-damage sample set"
            className="absolute inset-0 h-full w-full object-cover will-change-transform"
            style={{ transform: "scale(1.12)" }}
          />
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 bg-gradient-to-t from-black/75 to-transparent px-5 pb-5 pt-20 text-white">
            <div>
              <p className="text-sm font-medium">Road image sample</p>
              <p className="mt-1 text-xs text-white/75">A bundled example frame · not a live prediction</p>
            </div>
            <span className="rounded border border-white/35 px-2 py-1 font-mono text-[11px]">RDD2020</span>
          </div>
        </div>
      </section>

      {/* Explainable damage classes */}
      <section id="damage" className="scroll-mt-24">
        <SectionTitle eyebrow="RDD2020 taxonomy" title="Four kinds of road damage, explained">
          Training images include Japan, India and Czech Republic road scenes: 14,691 images and
          17,517 labeled boxes, of which 42% of images contain no damage. Hover a card to see how the
          model marks each class.
        </SectionTitle>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          {damageClasses.map((damage, index) => (
            <Reveal key={damage.code} delay={index * 100} className="h-full">
              <DamageCard {...damage} />
            </Reveal>
          ))}
        </div>
      </section>

      {/* Validation */}
      <section aria-label="Validation results">
        <SectionTitle eyebrow="Validation · final repository configuration" title="Measured on labeled data">
          Metrics are reported from the repository’s local scorer on 2,150 validation images. The
          selected inference settings were tuned on this split, so the final score may be optimistic.
        </SectionTitle>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {validationMetrics.map((metric, index) => (
            <Reveal key={metric.label} delay={index * 90} variant="scale" className="h-full">
              <div className="lift h-full rounded-xl border border-line bg-surface p-5 sm:p-6">
                <p className="font-mono text-2xl tabular-nums text-ink sm:text-4xl">
                  <CountUp to={metric.to} decimals={metric.decimals} suffix={metric.suffix} />
                </p>
                <p className="mt-2 text-xs leading-5 text-muted">{metric.label}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={200}>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted">
            <span>Precision 64.60%</span>
            <span>Recall 53.62%</span>
            <span>Reported score uses the project’s local evaluation script</span>
          </div>
        </Reveal>
      </section>

      {/* Pipeline */}
      <section>
        <SectionTitle eyebrow="Inference path" title="Two image scales, one consolidated result">
          Road damage varies greatly in size: fine cracks need image detail, while broader context
          helps identify larger defects. The ensemble combines both model outputs before returning
          detections.
        </SectionTitle>
        <Reveal>
          <InferencePath />
        </Reveal>

        <Reveal className="mt-6">
          <div className="grid gap-4 rounded-xl border border-line bg-canvas/90 p-5 sm:grid-cols-2 sm:p-6">
            <div>
              <h3 className="text-sm font-medium text-ink">Why use an ensemble?</h3>
              <p className="mt-2 text-xs leading-5 text-muted">
                A single high-resolution pass retains fine detail; the 640 px detector supplies
                predictions from another scale. WBF consolidates overlapping boxes instead of
                selecting just one model’s box. The final experiment combines TTA on the main model
                with the second detector.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-ink">What the threshold means</h3>
              <p className="mt-2 text-xs leading-5 text-muted">
                Candidate predictions use a 0.001 confidence floor so they remain rankable for
                evaluation. The validation threshold of 0.1821 is a useful starting point for
                viewing results; changing it only filters what the dashboard displays.
              </p>
            </div>
          </div>
        </Reveal>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {[
            {
              title: "YOLO26s architecture",
              text: "The small, anchor-free, single-stage Ultralytics detector is initialized from COCO weights and fine-tuned for the four RDD2020 classes. It predicts class, confidence and box coordinates in one detector pass.",
            },
            {
              title: "Suppression choice",
              text: "YOLO26 includes an end-to-end NMS-free head. The final project config disables that path and uses classic NMS at IoU 0.45 because this is the setting that was tuned and evaluated for the submission.",
            },
            {
              title: "Why two sizes",
              text: "Small potholes and thin cracks occupy little image area. The high-resolution model preserves fine detail; the second scale contributes another set of candidate boxes. Training at two sizes also gives the ensemble different scale-specific behavior.",
            },
          ].map((item, index) => (
            <Reveal key={item.title} delay={index * 100} className="h-full">
              <div className="lift h-full rounded-xl border border-line bg-surface p-5 sm:p-6">
                <h3 className="text-sm font-medium text-ink">{item.title}</h3>
                <p className="mt-2 text-xs leading-5 text-muted">{item.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Ablation + training */}
      <section className="grid gap-10 xl:grid-cols-[1.1fr_0.9fr]">
        <div>
          <SectionTitle eyebrow="Ablation results" title="Why these settings were selected">
            Local accuracy scores from the same validation scorer. Latency is measured unless
            marked approximate in the source report.
          </SectionTitle>
          <Reveal>
            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              {scoreRuns.map((run, index) => (
                <div key={run.name} className="border-b border-line p-4 transition-colors last:border-b-0 hover:bg-canvas/60 sm:p-5">
                  <div className="flex items-baseline justify-between gap-4">
                    <p className="text-sm font-medium text-ink">{run.name}</p>
                    <p className="shrink-0 font-mono text-xs tabular-nums text-muted">
                      {run.score.toFixed(2)}% · {run.latency}
                    </p>
                  </div>
                  <ScoreBar pct={(run.score / 50) * 100} highlight={index === scoreRuns.length - 1} delay={index * 120} />
                </div>
              ))}
            </div>
          </Reveal>
          <p className="mt-3 text-xs leading-5 text-muted">
            The final 49.39% result uses 1088 px + TTA + the 640 px model. The ~110 ms latency is
            an estimate in the source report, not a separately measured final-run benchmark.
          </p>
        </div>

        <div>
          <SectionTitle eyebrow="Model specification" title="How both detectors were trained" />
          <Reveal delay={100}>
            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              {trainingSettings.map(([label, value]) => (
                <div
                  key={label}
                  className="grid gap-1 border-b border-line px-4 py-3 transition-colors last:border-b-0 hover:bg-canvas/60 sm:grid-cols-[145px_1fr] sm:gap-4"
                >
                  <p className="text-xs text-muted">{label}</p>
                  <p className="text-xs leading-5 text-ink">{value}</p>
                </div>
              ))}
            </div>
          </Reveal>
          <p className="mt-3 text-xs leading-5 text-muted">
            Separate checkpoints were fine-tuned at 1024 px and 640 px. The main checkpoint runs at
            1088 px for inference; the second runs at 640 px.
          </p>
        </div>
      </section>

      {/* Dataset + limitations */}
      <section className="grid gap-4 md:grid-cols-2">
        <Reveal className="h-full">
          <article className="lift h-full rounded-xl border border-line bg-surface p-5 sm:p-6">
            <div className="flex items-center gap-2 text-primary">
              <Database size={17} aria-hidden />
              <h2 className="text-base font-medium text-ink">Dataset and evaluation</h2>
            </div>
            <ul className="mt-4 space-y-3 text-xs leading-5 text-muted">
              <li>14,691 training images · 17,517 labeled boxes</li>
              <li>2,150 validation images · 2,561 labeled boxes</li>
              <li>4,200 unlabeled competition test images</li>
              <li>Held-out test labels are hidden; test predictions are not accuracy metrics</li>
            </ul>
          </article>
        </Reveal>
        <Reveal delay={120} className="h-full">
          <article className="lift h-full rounded-xl border border-line bg-surface p-5 sm:p-6">
            <div className="flex items-center gap-2 text-primary">
              <Gauge size={17} aria-hidden />
              <h2 className="text-base font-medium text-ink">Known limitations</h2>
            </div>
            <ul className="mt-4 space-y-3 text-xs leading-5 text-muted">
              <li>Thin longitudinal and transverse cracks are harder to localize</li>
              <li>Validation mAP@50 fell from 0.571 to 0.404 on the degraded 1024-model set</li>
              <li>720 × 720 validation images were a harder subset than 600 × 600 images</li>
              <li>Upload results need ground-truth labels for per-image accuracy evaluation</li>
            </ul>
          </article>
        </Reveal>
      </section>

      {/* CTA + footer */}
      <Reveal variant="scale">
        <section className="rounded-2xl border border-line bg-surface/90 p-8 text-center backdrop-blur-sm sm:p-12">
          <h2 className="text-3xl text-ink sm:text-4xl">Try it on your own road images</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted">
            Upload a single image or a batch, inspect every box the model returns, and export the
            results as CSV or a printable report.
          </p>
          <Link to="/predict" className="btn btn-primary group mt-6">
            Open prediction testing{" "}
            <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-1" aria-hidden />
          </Link>
        </section>
      </Reveal>

      <footer className="flex flex-col justify-between gap-4 border-t border-line pt-5 text-xs text-muted sm:flex-row sm:items-center">
        <span className="inline-flex items-center gap-2">
          <Cpu size={15} aria-hidden /> PAVEXA · See the damage. Understand the road. Improve the journey.
        </span>
        <Link to="/predict" className="inline-flex items-center gap-2 text-ink hover:text-primary">
          Open prediction testing <ArrowRight size={14} aria-hidden />
        </Link>
      </footer>
    </div>
  );
}