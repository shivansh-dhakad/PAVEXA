import { Check } from "lucide-react";
import { CLASS_COLORS, type DamageCode } from "../lib/damage";
import { SEVERITY_COLOR, type Severity } from "../lib/knowledge";
import { STATUS_FLOW, type Status } from "../lib/complaints";
import { CODES } from "../lib/vision";

export function timeAgo(ts: number) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export const fmtDate = (ts: number) =>
  new Date(ts).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function SeverityBadge({ severity }: { severity: Severity }) {
  const c = SEVERITY_COLOR[severity];
  return (
    <span className="rounded-sm px-2 py-0.5 text-[11px] font-bold" style={{ backgroundColor: `${c}1a`, color: c }}>
      {severity}
    </span>
  );
}

export function StatusPill({ status }: { status: Status }) {
  const done = status === "Resolved";
  return (
    <span
      className={`rounded-sm px-2 py-0.5 text-[11px] font-semibold ${
        done ? "bg-green-100 text-green-800" : status === "In Progress" ? "bg-primary-soft text-primary" : "bg-canvas text-body border border-line"
      }`}
    >
      {status}
    </span>
  );
}

export function ClassChips({ counts }: { counts: Record<DamageCode, number> }) {
  const present = CODES.filter((c) => counts[c] > 0);
  if (present.length === 0) return <span className="text-xs text-muted">No damage</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {present.map((c) => (
        <span
          key={c}
          className="rounded-sm px-1.5 py-0.5 font-mono text-[11px] font-bold"
          style={{ backgroundColor: `${CLASS_COLORS[c]}18`, color: CLASS_COLORS[c] }}
        >
          {c}×{counts[c]}
        </span>
      ))}
    </div>
  );
}

export function StatusStepper({ status }: { status: Status }) {
  const idx = STATUS_FLOW.indexOf(status);
  return (
    <ol className="flex items-start">
      {STATUS_FLOW.map((s, i) => {
        const done = i < idx || (i === idx && status === "Resolved");
        const current = i === idx && !done;
        return (
          <li key={s} className="relative flex-1 text-center">
            {i > 0 && (
              <span className={`absolute left-[-50%] top-[11px] h-0.5 w-full ${i <= idx ? "bg-primary" : "bg-line"}`} aria-hidden />
            )}
            <span
              className={`relative z-10 mx-auto flex size-6 items-center justify-center rounded-full border text-[10px] font-bold ${
                done
                  ? "border-primary bg-primary text-white"
                  : current
                    ? "border-primary bg-primary-soft text-primary ring-4 ring-primary/10"
                    : "border-line bg-surface text-muted"
              }`}
            >
              {done ? <Check size={12} strokeWidth={2.5} /> : i + 1}
            </span>
            <span className={`mt-1.5 block text-[11px] leading-tight ${i <= idx ? "font-semibold text-ink" : "text-muted"}`}>{s}</span>
          </li>
        );
      })}
    </ol>
  );
}
