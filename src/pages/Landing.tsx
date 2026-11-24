import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, Camera, ChevronLeft, ChevronRight, ExternalLink,
  FolderArchive, LayoutDashboard, MapPinned,
} from "lucide-react";
import { CLASS_COLORS, DAMAGE_CLASSES as DAMAGE_META, type DamageCode } from "../lib/damage";

// ── Content (all figures come from the project's validation run) ─────────────
const TICKER = [
  "Trained on RDD2020: Japan, India and Czech Republic",
  "4 damage classes: D00, D10, D20, D40",
  "Two YOLO26s models: 1024 px and 640 px",
  "Weighted Box Fusion at IoU 0.55",
  "Calibrated confidence threshold 0.1821",
  "60.3 ms per frame",
  "4,200 test images, 87,975 detections",
];

const STEPS = [
  {
    title: "Capture",
    body: "Send a photo or short video of the damaged road with your live location.",
  },
  {
    title: "Detect at two scales",
    body: "One YOLO26s model reads the frame at 1024 px for hairline cracks. A second reads it at 640 px for wider context.",
  },
  {
    title: "Fuse and filter",
    body: "Weighted Box Fusion merges overlapping boxes at IoU 0.55. Boxes under the calibrated 0.1821 confidence threshold are hidden by default.",
  },
  {
    title: "Score and map",
    body: "Each report gets a Road Health Index from 0 to 100. Reports on the same street add up, so repeat complaints raise that street on the authority map.",
  },
];

const CLASSES: {
  code: DamageCode;
  name: string;
  icon: string;
  severity: string;
  body: string;
  remedy: string;
}[] = [
  {
    code: "D00",
    name: "Longitudinal crack",
    icon: "/logitudinal.svg",
    severity: "Moderate",
    body: "Cracks that run along the direction of travel, usually at lane seams and construction joints.",
    remedy: "Route the crack and seal it with hot-pour elastomeric sealant.",
  },
  {
    code: "D10",
    name: "Transverse crack",
    icon: "/transverse.svg",
    severity: "Moderate",
    body: "Cracks that cross the road, mostly caused by thermal contraction and freeze-thaw cycles.",
    remedy: "Rout and seal, then restore the transverse joint.",
  },
  {
    code: "D20",
    name: "Alligator crack",
    icon: "/alligator-crack.svg",
    severity: "Severe",
    body: "Interconnected polygonal cracking that points to fatigue or subgrade failure under load.",
    remedy: "Full-depth reclamation or a high-modulus overlay.",
  },
  {
    code: "D40",
    name: "Pothole",
    icon: "/pothole.svg",
    severity: "Critical",
    body: "Bowl-shaped cavities where water has weakened the layers under the surface and traffic has broken them out.",
    remedy: "Emergency cold patch first, then a permanent infrared patch.",
  },
];

const ABLATION = [
  { name: "640 px single model", acc: 42.17, latency: "n/a", final: "n/a", chosen: false },
  { name: "1024 px single model", acc: 45.9, latency: "41.4 ms", final: "46.83", chosen: false },
  { name: "1024 px with test-time augmentation", acc: 47.95, latency: "93.7 ms", final: "45.02", chosen: false },
  { name: "1024 px + 640 px ensemble (WBF)", acc: 48.54, latency: "60.3 ms", final: "47.43", chosen: true },
];

const RHI_TIERS = [
  { label: "Critical", range: "below 40", width: 40, color: "#dc2626" },
  { label: "Poor", range: "40 to 59", width: 20, color: "#ea580c" },
  { label: "Fair", range: "60 to 79", width: 20, color: "#d97706" },
  { label: "Good", range: "80 to 100", width: 20, color: "#16a34a" },
];

const WORKSPACES = [
  {
    icon: Camera,
    title: "Citizen",
    body: "Report damage with a photo or clip and your live location. If the road is fine, no complaint is filed. Otherwise it goes to the nearest headquarters and you can follow the repair.",
    to: "/login?role=citizen",
  },
  {
    icon: MapPinned,
    title: "Authority",
    body: "See complaints with the model's report on a map. Streets with several reports rank as more severe, so crews go where it matters first.",
    to: "/login?role=authority",
  },
  {
    icon: LayoutDashboard,
    title: "Model testing",
    body: "Upload one image and get the full analysis: every box, its confidence, and how much each one lowers the Road Health Index.",
    to: "/login?role=tester",
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
/** Slides its children in from the side the first time they scroll into view. */
function Reveal({
  children,
  from = "up",
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  from?: "left" | "right" | "up";
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isIn, setIsIn] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !("IntersectionObserver" in window)
    ) {
      setIsIn(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsIn(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -32px 0px" },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal reveal-${from} ${isIn ? "is-in" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

function SectionHead({ title, body }: { title: string; body: string }) {
  return (
    <div className="max-w-2xl">
      <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{title}</h2>
      <p className="mt-3 text-base leading-relaxed text-muted">{body}</p>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function Landing() {
  const [idx, setIdx] = useState(0);

  const go = (n: number) => setIdx((n + CLASSES.length) % CLASSES.length);

  return (
    <div className="relative isolate min-h-screen overflow-x-clip text-body">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-line bg-surface/95">
        <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center justify-between px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2 text-ink">
            <img src="/favicon.svg" alt="" className="size-8" />
            <span className="text-lg font-semibold tracking-tight">PAVEXA</span>
          </Link>

          <nav aria-label="Page sections" className="hidden items-center gap-7 text-sm font-semibold text-muted md:flex">
            <a href="#pipeline" className="transition-colors hover:text-ink">How it works</a>
            <a href="#classes" className="transition-colors hover:text-ink">Damage classes</a>
            <a href="#results" className="transition-colors hover:text-ink">Results</a>
            <a href="#workspaces" className="transition-colors hover:text-ink">Workspaces</a>
          </nav>

          <div className="flex items-center gap-2">
            <Link to="/login?role=citizen" className="btn btn-ghost hidden sm:inline-flex">
              <Camera size={16} strokeWidth={1.5} />
              Report damage
            </Link>
            <Link to="/login" className="btn btn-primary">
              Sign in
            </Link>
          </div>
        </div>
        <nav aria-label="Page sections" className="flex gap-5 overflow-x-auto border-t border-line px-6 py-3 text-xs font-semibold text-muted md:hidden">
          <a href="#pipeline" className="shrink-0 transition-colors hover:text-ink">How it works</a>
          <a href="#classes" className="shrink-0 transition-colors hover:text-ink">Damage classes</a>
          <a href="#results" className="shrink-0 transition-colors hover:text-ink">Results</a>
          <a href="#workspaces" className="shrink-0 transition-colors hover:text-ink">Workspaces</a>
        </nav>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────── */}
      <section className="bg-surface/80">
        <div className="relative z-10 mx-auto grid w-full max-w-[1440px] gap-12 px-6 py-16 lg:min-h-[640px] lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16 lg:px-8 lg:py-20">
          <div>
            <p className="mb-5 font-mono text-xs text-primary">Road damage triage</p>
            <h1 className="max-w-xl text-4xl font-semibold leading-[1.08] tracking-tight text-ink sm:text-5xl lg:text-6xl">
              Report a damaged road. Authorities see what to fix first.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
              Citizens send a photo or short clip with their live location. The model checks the road, and only real damage reaches the nearest authority, ranked by severity on a map.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/login?role=citizen" className="btn btn-primary h-11 px-5">
                <Camera size={16} strokeWidth={1.5} />
                Report road damage
                <ArrowRight size={16} strokeWidth={1.5} />
              </Link>
              <Link to="/login?role=authority" className="btn btn-ghost h-11 px-5">
                <FolderArchive size={16} strokeWidth={1.5} />
                Authority console
              </Link>
            </div>

            <dl className="mt-12 flex flex-wrap gap-x-10 gap-y-5 border-t border-line pt-6">
              {[
                { v: "60.3 ms", l: "per frame, two-model ensemble" },
                { v: "57.88%", l: "mAP50 on validation" },
                { v: "4,200", l: "official test images processed" },
              ].map(({ v, l }) => (
                <div key={l}>
                  <dt className="font-mono text-2xl font-semibold tabular-nums text-ink">{v}</dt>
                  <dd className="mt-1 text-xs text-muted">{l}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div>
            <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
              <div className="relative aspect-[4/3] w-full overflow-hidden bg-canvas">
                <img
                  src="/hero-road.jpg"
                  alt="Road survey frame with an alligator crack detection box"
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "/samples/img_000012.jpg";
                  }}
                />
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-ink/85 px-4 py-3 font-mono text-[11px] text-white">
                  <span>Inspection frame 014</span>
                  <span className="text-marking">Damage detected</span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 border-t border-line px-5 py-3 text-xs">
                <span className="font-semibold text-ink">YOLO26s at 1024 px + 640 px</span>
                <span className="font-mono text-muted">fused with WBF</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Continuous project-facts ticker ─────────────────────────── */}
      <section aria-label="Project facts" className="marquee border-b border-line bg-canvas/80 py-4">
        <div className="marquee-track">
          {[false, true].map((isDuplicate) => (
            <div
              key={String(isDuplicate)}
              className="marquee-group flex w-max shrink-0"
              aria-hidden={isDuplicate || undefined}
            >
              {TICKER.map((t) => (
                <span
                  key={t}
                  className="mx-6 inline-flex shrink-0 items-center gap-3 whitespace-nowrap font-mono text-xs text-body"
                >
                  <span className="size-1.5 rounded-full bg-marking" aria-hidden />
                  {t}
                </span>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────── */}
      <section id="pipeline" className="mx-auto w-full max-w-[1440px] scroll-mt-28 px-6 py-20 lg:px-8 lg:py-28">
        <Reveal from="left">
          <SectionHead
            title="From camera frame to a scored road in four steps"
            body="The same pipeline runs for a single photo, a ZIP archive and every sampled video frame."
          />
        </Reveal>

        <ol className="relative mt-14 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          <div
            className="absolute left-0 right-0 top-5 hidden h-px bg-line lg:block"
            aria-hidden
          />
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative">
              <Reveal from={i % 2 === 0 ? "left" : "right"} delay={i * 120}>
                <div className="relative flex size-10 items-center justify-center rounded-full border border-line bg-surface font-mono text-sm font-bold text-ink">
                  {i + 1}
                </div>
                <h3 className="mt-5 text-base font-bold text-ink">{s.title}</h3>
                <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">{s.body}</p>
              </Reveal>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Damage classes (sliding carousel) ──────────────────────── */}
      <section id="classes" className="scroll-mt-28 border-y border-line bg-surface/80">
        <div className="mx-auto w-full max-w-[1440px] px-6 py-20 lg:px-8 lg:py-28">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <Reveal from="left">
              <SectionHead
                title="Four kinds of damage, each with a repair path"
                body="Classes follow the RDD2020 taxonomy. Each class also carries a severity weight that feeds the Road Health Index."
              />
            </Reveal>

            <div className="flex items-center gap-2">
              <button
                onClick={() => go(idx - 1)}
                className="btn btn-ghost size-10 px-0"
                aria-label="Previous damage class"
              >
                <ChevronLeft size={18} strokeWidth={1.5} />
              </button>
              <button
                onClick={() => go(idx + 1)}
                className="btn btn-ghost size-10 px-0"
                aria-label="Next damage class"
              >
                <ChevronRight size={18} strokeWidth={1.5} />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div role="tablist" aria-label="Damage classes" className="mt-10 flex flex-wrap gap-2">
            {CLASSES.map((c, i) => (
              <button
                key={c.code}
                role="tab"
                aria-selected={i === idx}
                onClick={() => setIdx(i)}
                className={`inline-flex h-10 items-center gap-2 rounded-sm border px-4 text-sm font-semibold transition-colors duration-200 ${
                  i === idx
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-line bg-surface text-muted hover:text-ink"
                }`}
              >
                <span className="size-2.5 rounded-sm" style={{ backgroundColor: CLASS_COLORS[c.code] }} aria-hidden />
                <span className="font-mono">{c.code}</span>
                <span className="hidden sm:inline">{c.name}</span>
              </button>
            ))}
          </div>

          {/* Sliding track */}
          <div
            className="mt-6 overflow-hidden rounded-lg border border-line bg-surface"
          >
            <div className="slide-track flex" style={{ transform: `translateX(-${idx * 100}%)` }}>
              {CLASSES.map((c, i) => {
                const color = CLASS_COLORS[c.code];
                return (
                  <article
                    key={c.code}
                    aria-hidden={i !== idx}
                    className="grid min-w-full gap-0 md:grid-cols-[0.9fr_1.1fr]"
                  >
                    <div className="relative flex h-64 items-center justify-center border-b border-line bg-canvas md:h-auto md:min-h-[340px] md:border-b-0 md:border-r">
                      <img src={c.icon} alt={`${c.name} diagram`} className="h-full w-full object-contain p-6" />
                      <span
                        className="absolute left-4 top-4 rounded-sm px-2.5 py-1 font-mono text-xs font-bold text-white"
                        style={{ backgroundColor: color }}
                      >
                        {c.code}
                      </span>
                    </div>

                    <div className="flex flex-col justify-center gap-6 p-6 sm:p-10">
                      <div>
                        <h3 className="text-2xl font-semibold text-ink">{c.name}</h3>
                        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">{c.body}</p>
                      </div>

                      <dl className="grid gap-4 border-t border-line pt-5 text-sm sm:grid-cols-2">
                        <div>
                          <dt className="font-semibold text-ink">Typical repair</dt>
                          <dd className="mt-1 text-muted">{c.remedy}</dd>
                        </div>
                        <div>
                          <dt className="font-semibold text-ink">Severity</dt>
                          <dd className="mt-1 text-muted">
                            {c.severity}, weighted x{DAMAGE_META[c.code].severity} in the Road Health Index
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── Results ────────────────────────────────────────────────── */}
      <section id="results" className="mx-auto w-full max-w-[1440px] scroll-mt-28 px-6 py-20 lg:px-8 lg:py-28">
        <Reveal from="left">
          <SectionHead
            title="Why the ensemble won"
            body="Scored on the Kaggle benchmark formula, 0.85 x accuracy + 10 x speed score, across 68 validation batches."
          />
        </Reveal>

        <div className="mt-14 grid gap-12 lg:grid-cols-[1.35fr_0.65fr]">
          {/* Ablation with sliding bars */}
          <Reveal from="left">
            <div className="rounded-lg border border-line bg-surface p-6 sm:p-8">
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-6 border-b border-line pb-3 text-xs font-semibold text-muted">
                <span>Configuration, local accuracy</span>
                <span className="w-16 text-right">Latency</span>
                <span className="w-16 text-right">Est. score</span>
              </div>

              <ul className="divide-y divide-line">
                {ABLATION.map((r) => (
                  <li key={r.name} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-6 py-4">
                    <div>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className={`text-sm ${r.chosen ? "font-bold text-ink" : "font-medium text-body"}`}>
                          {r.name}
                        </span>
                        <span className={`font-mono text-sm ${r.chosen ? "font-bold text-primary" : "text-ink"}`}>
                          {r.acc.toFixed(2)}%
                        </span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-canvas">
                        <div
                          className="bar-fill h-full rounded-full"
                          style={{
                            width: `${(r.acc / 60) * 100}%`,
                            backgroundColor: r.chosen ? "var(--color-primary)" : "#b4bdc9",
                          }}
                        />
                      </div>
                    </div>
                    <span className="w-16 text-right font-mono text-xs text-muted">{r.latency}</span>
                    <span className={`w-16 text-right font-mono text-xs ${r.chosen ? "font-bold text-primary" : "text-muted"}`}>
                      {r.final}
                    </span>
                  </li>
                ))}
              </ul>

              <p className="mt-4 text-xs leading-relaxed text-muted">
                Test-time augmentation scores higher on accuracy than a single model but is too slow, so the
                two-model ensemble gives the best estimated final score.
              </p>
            </div>
          </Reveal>

          {/* Validation numbers */}
          <Reveal from="right" delay={120}>
            <div>
              <h3 className="text-base font-bold text-ink">Validation at threshold 0.1821</h3>
              <dl className="mt-4 divide-y divide-line border-y border-line">
                {[
                  { k: "mAP50", v: "57.88%" },
                  { k: "Precision", v: "63.41%" },
                  { k: "Recall", v: "54.02%" },
                  { k: "Ensemble gain over 1024 px alone", v: "+2.64%" },
                ].map(({ k, v }) => (
                  <div key={k} className="flex items-baseline justify-between gap-4 py-3.5">
                    <dt className="text-sm text-body">{k}</dt>
                    <dd className="font-mono text-lg font-bold text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-sm leading-relaxed text-muted">
                On the 4,200-image official test set the pipeline produced 87,975 detections and returned
                none for 206 frames.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Road Health Index ──────────────────────────────────────── */}
      <section className="border-y border-line bg-surface/80">
        <div className="mx-auto grid w-full max-w-[1440px] gap-12 px-6 py-20 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:px-8 lg:py-28">
          <Reveal from="left">
            <SectionHead
              title="One number per road"
              body="The Road Health Index starts at 100 and subtracts a penalty for every visible box: severity weight x box area x confidence. Potholes cost the most."
            />
          </Reveal>

          <Reveal from="right" delay={100}>
            <div>
              <div className="flex h-4 w-full overflow-hidden rounded-full">
                {RHI_TIERS.map((t) => (
                  <div
                    key={t.label}
                    className="bar-fill h-full"
                    style={{ width: `${t.width}%`, backgroundColor: t.color }}
                    title={`${t.label}: ${t.range}`}
                  />
                ))}
              </div>
              <div className="mt-3 flex w-full">
                {RHI_TIERS.map((t) => (
                  <div key={t.label} style={{ width: `${t.width}%` }} className="pr-2">
                    <p className="text-sm font-bold text-ink">{t.label}</p>
                    <p className="font-mono text-xs text-muted">{t.range}</p>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex flex-wrap gap-3 text-sm">
                {(["D00", "D10", "D20", "D40"] as DamageCode[]).map((c) => (
                  <span
                    key={c}
                    className="inline-flex items-center gap-2 rounded-sm border border-line bg-canvas px-3 py-1.5"
                  >
                    <span className="size-2.5 rounded-sm" style={{ backgroundColor: CLASS_COLORS[c] }} aria-hidden />
                    <span className="font-mono font-semibold text-ink">{c}</span>
                    <span className="text-muted">weight {DAMAGE_META[c].severity}</span>
                  </span>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Workspaces ─────────────────────────────────────────────── */}
      <section id="workspaces" className="mx-auto w-full max-w-[1440px] scroll-mt-28 px-6 py-20 lg:px-8 lg:py-28">
        <Reveal from="left">
          <SectionHead
            title="Choose a demo login"
            body="Sign in as a citizen, an authority officer or a model tester. There are no real accounts, and demo data stays in your browser."
          />
        </Reveal>

        <ul className="mt-12 divide-y divide-line border-y border-line">
          {WORKSPACES.map(({ icon: Icon, title, body, to }, i) => (
            <li key={title}>
              <Reveal from={i % 2 === 0 ? "left" : "right"} delay={i * 60}>
                <Link
                  to={to}
                  className="row-link flex items-center gap-5 py-6 transition-colors hover:bg-surface sm:gap-8 sm:px-4"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-primary">
                    <Icon size={20} strokeWidth={1.5} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-bold text-ink">{title}</span>
                    <span className="mt-1 block max-w-2xl text-sm leading-relaxed text-muted">{body}</span>
                  </span>
                  <ArrowRight size={20} strokeWidth={1.5} className="row-arrow shrink-0 text-primary" aria-hidden />
                </Link>
              </Reveal>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer className="border-t border-line bg-surface/90">
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-8 px-6 py-12 sm:flex-row sm:items-start sm:justify-between lg:px-8">
          <div className="max-w-sm">
            <div className="flex items-center gap-2 text-ink">
              <img src="/favicon.svg" alt="" className="size-7" />
              <span className="text-base font-semibold tracking-tight">PAVEXA</span>
            </div>
            <p className="mt-3 text-sm text-muted">See the damage. Understand the road. Improve the journey.</p>
          </div>

          <div className="flex flex-col gap-2 text-sm">
            <a
              href="https://github.com/sekilab/RoadDamageDetector"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-body transition-colors hover:text-primary"
            >
              RDD2020 dataset by Sekilab
              <ExternalLink size={13} strokeWidth={1.5} aria-hidden />
            </a>
            <a
              href="https://www.kaggle.com/competitions/road-damage-detection-and-classification"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-body transition-colors hover:text-primary"
            >
              Kaggle road damage competition
              <ExternalLink size={13} strokeWidth={1.5} aria-hidden />
            </a>
            <a
              href="https://github.com/ultralytics/ultralytics"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-body transition-colors hover:text-primary"
            >
              Ultralytics YOLO
              <ExternalLink size={13} strokeWidth={1.5} aria-hidden />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
