import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CLASS_COLORS, DAMAGE_CLASSES, type Detection } from "../lib/damage";
import { areaOf, type PenaltyRow } from "../lib/analytics";

interface EvidenceImageProps {
  src: string;
  width: number;
  height: number;
  /** Visible detections, sorted by confidence (index = rank − 1). */
  detections: Detection[];
  /** Penalty details aligned with `detections`. */
  rows: PenaltyRow[];
  totalPenalty: number;
  selectedIndex: number;
  onSelect: (index: number) => void;
  annotated: boolean;
}

interface Hover {
  index: number;
  x: number;
  y: number;
}

const TIP_W = 272;
const TIP_H = 300;

function BoxTooltip({
  detection,
  row,
  hover,
  width,
  height,
  totalPenalty,
}: {
  detection: Detection;
  row: PenaltyRow;
  hover: Hover;
  width: number;
  height: number;
  totalPenalty: number;
}) {
  const color = CLASS_COLORS[detection.code];
  const info = DAMAGE_CLASSES[detection.code];
  const left = Math.max(8, hover.x + 16 + TIP_W > window.innerWidth - 8 ? hover.x - 16 - TIP_W : hover.x + 16);
  const top = Math.max(8, hover.y + 16 + TIP_H > window.innerHeight - 8 ? hover.y - 16 - TIP_H : hover.y + 16);
  const x1 = Math.round(detection.x1 * width);
  const y1 = Math.round(detection.y1 * height);
  const x2 = Math.round(detection.x2 * width);
  const y2 = Math.round(detection.y2 * height);
  const share = totalPenalty > 0 ? (row.penalty / totalPenalty) * 100 : 0;

  return createPortal(
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[60] rounded-lg border border-line bg-surface p-3 text-xs shadow-2xl"
      style={{ left, top, width: TIP_W }}
    >
      <div className="flex items-center gap-2">
        <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: color }} />
        <span className="font-mono font-semibold text-ink">{detection.code}</span>
        <span className="truncate text-ink">{info.label}</span>
        <span className="ml-auto shrink-0 font-mono text-[11px] text-muted">box #{row.rank}</span>
      </div>

      <div className="mt-3">
        <div className="flex items-baseline justify-between">
          <span className="text-muted">Confidence</span>
          <span className="font-mono text-base tabular-nums text-ink">{(detection.confidence * 100).toFixed(1)}%</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-sm bg-canvas">
          <div className="h-full rounded-sm" style={{ width: `${detection.confidence * 100}%`, backgroundColor: color }} />
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
        <div>
          <dt className="text-[11px] text-muted">Size</dt>
          <dd className="font-mono text-ink">{x2 - x1} × {y2 - y1} px</dd>
        </div>
        <div>
          <dt className="text-[11px] text-muted">Image area</dt>
          <dd className="font-mono text-ink">{(row.area * 100).toFixed(2)}%</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-[11px] text-muted">Position (top-left → bottom-right)</dt>
          <dd className="font-mono text-ink">({x1}, {y1}) → ({x2}, {y2})</dd>
        </div>
      </dl>

      <div className="mt-3 rounded-md bg-canvas p-2.5">
        <p className="text-[11px] font-medium text-ink">Road Health Index penalty</p>
        <p className="mt-1 font-mono text-[11px] leading-4 text-muted">
          {row.severity} × {row.area.toFixed(4)} × {detection.confidence.toFixed(2)} × 100
        </p>
        <p className="mt-1 font-mono text-sm text-ink">
          = −{row.penalty.toFixed(2)} pts <span className="text-[11px] text-muted">({share.toFixed(0)}% of total)</span>
        </p>
        <p className="mt-1 text-[10px] leading-4 text-muted">severity × area × confidence × 100 · severity ×{row.severity} for {info.label.toLowerCase()}</p>
      </div>
    </div>,
    document.body,
  );
}

export default function EvidenceImage({
  src,
  width,
  height,
  detections,
  rows,
  totalPenalty,
  selectedIndex,
  onSelect,
  annotated,
}: EvidenceImageProps) {
  const [hover, setHover] = useState<Hover | null>(null);

  // Draw big boxes first so small boxes stay on top and remain hoverable.
  const order = useMemo(
    () =>
      detections
        .map((_, index) => index)
        .sort((a, b) => areaOf(detections[b]) - areaOf(detections[a])),
    [detections],
  );

  const showAllLabels = detections.length <= 15;
  const fontSize = Math.max(width / 90, 12);
  const labelHeight = fontSize * 1.7;
  const hoveredRow = hover ? rows[hover.index] : undefined;

  return (
    <div className="relative overflow-hidden bg-[#1d2223]" style={{ aspectRatio: `${width} / ${height}` }}>
      <img
        src={src}
        alt={annotated ? "Road image with model detections overlaid" : "Original road image"}
        className="absolute inset-0 size-full object-fill"
      />
      {annotated && (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="absolute inset-0 size-full"
          aria-label="Interactive model detection boxes"
        >
          {order.map((index) => {
            const detection = detections[index];
            const x = detection.x1 * width;
            const y = detection.y1 * height;
            const boxWidth = (detection.x2 - detection.x1) * width;
            const boxHeight = (detection.y2 - detection.y1) * height;
            const color = CLASS_COLORS[detection.code];
            const active = hover?.index === index || selectedIndex === index;
            const dimmed = hover !== null && hover.index !== index;
            const label = `${detection.code} ${(detection.confidence * 100).toFixed(1)}%`;
            const labelWidth = Math.min(label.length * fontSize * 0.66 + fontSize, width - x);
            return (
              <g
                key={`${detection.code}-${index}`}
                role="button"
                tabIndex={0}
                aria-label={`${detection.code}, ${(detection.confidence * 100).toFixed(1)} percent confidence. Select box ${index + 1}`}
                opacity={dimmed ? 0.45 : 1}
                onClick={() => onSelect(index)}
                onFocus={() => onSelect(index)}
                onMouseEnter={(event) => setHover({ index, x: event.clientX, y: event.clientY })}
                onMouseMove={(event) => setHover({ index, x: event.clientX, y: event.clientY })}
                onMouseLeave={() => setHover(null)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(index);
                  }
                }}
                className="cursor-pointer outline-none"
              >
                <rect
                  x={x}
                  y={y}
                  width={boxWidth}
                  height={boxHeight}
                  fill={color}
                  fillOpacity={active ? 0.28 : 0.1}
                  stroke={color}
                  strokeWidth={active ? Math.max(width / 300, 3) : Math.max(width / 500, 2)}
                  strokeDasharray={selectedIndex === index ? `${fontSize * 0.6} ${fontSize * 0.4}` : undefined}
                />
                {(showAllLabels || active) && (
                  <>
                    <rect x={x} y={Math.max(0, y - labelHeight)} width={labelWidth} height={labelHeight} fill={color} />
                    <text
                      x={x + fontSize * 0.4}
                      y={Math.max(labelHeight, y) - labelHeight * 0.3}
                      fill="white"
                      fontSize={fontSize}
                      fontFamily="monospace"
                    >
                      {label}
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {hover && hoveredRow && (
        <BoxTooltip
          detection={detections[hover.index]}
          row={hoveredRow}
          hover={hover}
          width={width}
          height={height}
          totalPenalty={totalPenalty}
        />
      )}
    </div>
  );
}
