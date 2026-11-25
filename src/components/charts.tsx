import type { ReactNode } from "react";
import { RHI_BANDS } from "../lib/analytics";

/* ── Card wrapper ─────────────────────────────────────────────────────────── */

export function ChartCard({
  title,
  caption,
  children,
  className = "",
}: {
  title: string;
  caption?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex flex-col rounded-xl border border-line bg-surface p-4 ${className}`}>
      <h3 className="text-sm font-medium text-ink">{title}</h3>
      {caption && <p className="mt-1 text-[11px] leading-4 text-muted">{caption}</p>}
      <div className="mt-3 flex-1">{children}</div>
    </section>
  );
}

/* ── Road Health Index gauge ──────────────────────────────────────────────── */

const polar = (cx: number, cy: number, r: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy - r * Math.sin(a)];
};

const arc = (from: number, to: number) => {
  const [x0, y0] = polar(100, 100, 80, 180 - from * 1.8);
  const [x1, y1] = polar(100, 100, 80, 180 - to * 1.8);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A80 80 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
};

export function RhiGauge({ value, label, color }: { value: number; label: string; color: string }) {
  const [tx, ty] = polar(100, 100, 62, 180 - value * 1.8);
  return (
    <div>
      <svg viewBox="0 0 200 132" className="mx-auto block w-full max-w-[260px]" role="img" aria-label={`Road Health Index ${value} out of 100, ${label}`}>
        {RHI_BANDS.map((band) => (
          <path key={band.label} d={arc(band.from, band.to)} fill="none" stroke={band.color} strokeWidth="14" opacity={value >= band.from && value < (band.to === 100 ? 101 : band.to) ? 1 : 0.28}>
            <title>{`${band.label}: ${band.range}`}</title>
          </path>
        ))}
        <line x1="100" y1="100" x2={tx} y2={ty} stroke="#171b1c" strokeWidth="3" strokeLinecap="round" />
        <circle cx="100" cy="100" r="6" fill="#171b1c" />
        <text x="14" y="118" fontSize="9" fill="#626c70">0</text>
        <text x="174" y="118" fontSize="9" fill="#626c70">100</text>
        <text x="100" y="128" textAnchor="middle" fontSize="22" fontWeight="600" fill={color} fontFamily="'IBM Plex Mono', monospace">
          {value}
        </text>
      </svg>
      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted">
        {RHI_BANDS.map((band) => (
          <li key={band.label} className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm" style={{ backgroundColor: band.color }} />
            {band.label} <span className="font-mono">{band.range}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Donut ────────────────────────────────────────────────────────────────── */

export interface Slice {
  label: string;
  value: number;
  color: string;
}

export function DonutChart({ slices, centerLabel }: { slices: Slice[]; centerLabel: string }) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const r = 40;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 120 120" className="size-28 shrink-0" role="img" aria-label="Detections by class">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#eef0f1" strokeWidth="16" />
        {total > 0 &&
          slices.map((slice) => {
            const length = (slice.value / total) * circumference;
            const node = (
              <circle
                key={slice.label}
                cx="60"
                cy="60"
                r={r}
                fill="none"
                stroke={slice.color}
                strokeWidth="16"
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 60 60)"
              >
                <title>{`${slice.label}: ${slice.value}`}</title>
              </circle>
            );
            offset += length;
            return node;
          })}
        <text x="60" y="58" textAnchor="middle" fontSize="20" fontWeight="600" fill="#171b1c" fontFamily="'IBM Plex Mono', monospace">
          {total}
        </text>
        <text x="60" y="73" textAnchor="middle" fontSize="8" fill="#626c70">
          {centerLabel}
        </text>
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5 text-xs">
        {slices.map((slice) => (
          <li key={slice.label} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2 text-muted">
              <span className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: slice.color }} />
              <span className="truncate">{slice.label}</span>
            </span>
            <span className="shrink-0 font-mono tabular-nums text-ink">
              {slice.value} · {total ? Math.round((slice.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Horizontal bars ──────────────────────────────────────────────────────── */

export interface BarItem {
  label: string;
  value: number;
  display: string;
  color: string;
}

export function BarList({ items, max }: { items: BarItem[]; max?: number }) {
  const ceiling = max ?? Math.max(...items.map((item) => item.value), 1e-9);
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label}>
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate text-ink">{item.label}</span>
            <span className="shrink-0 font-mono tabular-nums text-muted">{item.display}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-sm bg-canvas">
            <div
              className="h-full rounded-sm transition-[width] duration-500"
              style={{ width: `${Math.min(100, (item.value / ceiling) * 100)}%`, backgroundColor: item.color }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ── Confidence histogram ─────────────────────────────────────────────────── */

export function Histogram({ values, threshold }: { values: number[]; threshold: number }) {
  const bins = 10;
  const counts = Array.from({ length: bins }, () => 0);
  values.forEach((value) => {
    counts[Math.min(bins - 1, Math.floor(value * bins))] += 1;
  });
  const peak = Math.max(...counts, 1);
  const left = 8;
  const plotWidth = 204;
  const base = 84;
  const plotHeight = 62;
  const slot = plotWidth / bins;
  const thresholdX = left + threshold * plotWidth;
  return (
    <svg viewBox="0 0 220 106" className="block w-full" role="img" aria-label="Confidence distribution of raw candidate boxes">
      <line x1={left} x2={left + plotWidth} y1={base} y2={base} stroke="#cfd4d4" />
      {counts.map((count, index) => {
        const height = (count / peak) * plotHeight;
        const x = left + index * slot + 1.5;
        const kept = index / bins >= threshold;
        return (
          <g key={index}>
            <rect x={x} y={base - height} width={slot - 3} height={height} rx="1.5" fill={kept ? "#374044" : "#c3c9ca"}>
              <title>{`${index * 10}–${(index + 1) * 10}% confidence: ${count} boxes`}</title>
            </rect>
            {count > 0 && (
              <text x={x + (slot - 3) / 2} y={base - height - 3} textAnchor="middle" fontSize="7" fill="#626c70">
                {count}
              </text>
            )}
          </g>
        );
      })}
      <line x1={thresholdX} x2={thresholdX} y1="6" y2={base} stroke="#b24b34" strokeDasharray="3 3" strokeWidth="1.2" />
      <text x={Math.min(thresholdX + 3, 190)} y="12" fontSize="8" fill="#b24b34">
        threshold {Math.round(threshold * 1000) / 10}%
      </text>
      {[0, 50, 100].map((tick) => (
        <text key={tick} x={left + (tick / 100) * plotWidth} y="98" textAnchor={tick === 0 ? "start" : tick === 100 ? "end" : "middle"} fontSize="8" fill="#626c70">
          {tick}%
        </text>
      ))}
    </svg>
  );
}
