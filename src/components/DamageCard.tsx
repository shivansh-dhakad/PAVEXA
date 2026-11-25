import type { CSSProperties } from "react";
import type { DamageCode } from "../lib/damage";

export interface DamageCardProps {
  code: DamageCode;
  name: string;
  /** Short uppercase tag shown on the bounding-box label. */
  short: string;
  description: string;
  repair: string;
  severity: string;
  /** Road Health Index weight, 1–4. */
  weight: number;
  share: string;
  color: string;
}

const BOX: Record<DamageCode, { x: number; y: number; w: number; h: number }> = {
  D00: { x: 52, y: 160, w: 536, h: 90 },
  D10: { x: 276, y: 100, w: 88, h: 226 },
  D20: { x: 180, y: 128, w: 280, h: 190 },
  D40: { x: 236, y: 170, w: 176, h: 140 },
};

const DARK = "#1f2a2e";
const SOFT = "#6b7478";

function Crack({ d, width = 2, color = SOFT }: { d: string; width?: number; color?: string }) {
  return (
    <path
      d={d}
      pathLength={1}
      className="crack-path"
      fill="none"
      stroke={color}
      strokeWidth={width * 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

function Damage({ code }: { code: DamageCode }) {
  switch (code) {
    case "D00":
      return (
        <>
          <Crack width={4.5} color={DARK} d="M64 212 L108 206 L150 216 L196 202 L240 212 L286 200 L330 210 L376 198 L420 208 L470 202 L520 214 L576 206" />
          <Crack d="M150 216 L168 232 L214 230 L250 240" />
          <Crack d="M286 200 L304 186 L350 184 L386 178" />
          <Crack d="M196 202 L210 190" />
          <Crack d="M470 202 L488 190" />
          <Crack d="M520 214 L540 228" />
        </>
      );
    case "D10":
      return (
        <>
          <Crack width={4.5} color={DARK} d="M322 108 L308 144 L330 180 L312 218 L332 254 L314 290 L326 318" />
          <Crack d="M330 180 L348 190" />
          <Crack d="M312 218 L296 228" />
          <Crack d="M332 254 L350 262" />
          <Crack d="M308 144 L294 152" />
        </>
      );
    case "D20":
      return (
        <>
          <Crack width={3} color={DARK} d="M192 150 L290 142 L362 160 L448 148" />
          <Crack width={3} color={DARK} d="M196 214 L282 198 L352 216 L440 202" />
          <Crack width={3} color={DARK} d="M206 282 L290 268 L372 288 L444 272" />
          <Crack width={3} color={DARK} d="M290 142 L282 198 L290 268 L302 308" />
          <Crack width={3} color={DARK} d="M362 160 L352 216 L372 288" />
          <Crack width={3} color={DARK} d="M448 148 L440 202 L444 272" />
          <Crack d="M192 150 L198 214 L206 282" />
          <Crack d="M320 180 L332 194" />
          <Crack d="M400 236 L414 250" />
        </>
      );
    case "D40":
      return (
        <>
          <path
            d="M258 242 C256 204 296 186 336 190 C382 194 402 224 398 258 C394 292 352 306 312 300 C274 294 260 272 258 242 Z"
            className="crack-path"
            pathLength={1}
            fill="rgba(31,42,46,0.28)"
            stroke={DARK}
            strokeWidth={6}
            strokeLinejoin="round"
          />
          <path
            d="M290 244 C292 220 322 212 348 218 C372 224 380 246 370 264 C358 282 322 284 304 272 C292 264 289 254 290 244 Z"
            fill="rgba(31,42,46,0.55)"
          />
          <Crack d="M258 242 L238 236" />
          <Crack d="M398 258 L416 266" />
          <Crack d="M336 190 L340 174" />
        </>
      );
  }
}

function Illustration({ code, short, color }: { code: DamageCode; short: string; color: string }) {
  const box = BOX[code];
  const label = `${code} · ${short}`;
  const labelW = label.length * 12.6 + 28;
  const patternId = `dots-${code}`;
  return (
    <svg viewBox="0 0 640 410" className="block h-full w-full" role="img" aria-label={`Illustration of a ${short.toLowerCase()} detection`}>
      <defs>
        <pattern id={patternId} width="10" height="10" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1" fill="#d5dadd" />
        </pattern>
      </defs>
      <rect width="640" height="410" rx="18" fill="#f6f7f9" />
      <rect width="640" height="410" rx="18" fill={`url(#${patternId})`} opacity="0.8" />
      <rect x="0.5" y="0.5" width="639" height="409" rx="18" fill="none" stroke="#e2e6e8" />
      <line x1="38" x2="602" y1="40" y2="40" stroke="#d3d8dc" strokeWidth="5" strokeLinecap="round" />
      <line x1="38" x2="602" y1="372" y2="372" stroke="#d3d8dc" strokeWidth="5" strokeDasharray="28 22" />

      <rect className="bbox-fill" x={box.x} y={box.y} width={box.w} height={box.h} fill={color} fillOpacity="0.07" />
      <rect className="bbox" x={box.x} y={box.y} width={box.w} height={box.h} fill="none" stroke={color} strokeWidth="4" strokeDasharray="10 8" />
      <rect x={box.x} y={box.y - 40} width={labelW} height="40" rx="6" fill={color} />
      <text x={box.x + 14} y={box.y - 13} fill="#fff" fontSize="20" fontWeight="700" fontFamily="'IBM Plex Mono', monospace" letterSpacing="0.5">
        {label}
      </text>
      <Damage code={code} />
    </svg>
  );
}

export default function DamageCard({ code, name, short, description, repair, severity, weight, share, color }: DamageCardProps) {
  return (
    <article
      tabIndex={0}
      className="damage-card group flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface outline-none"
      style={{ "--dc": color } as CSSProperties}
    >
      <div className="relative overflow-hidden border-b border-line bg-canvas px-3 pb-3 pt-11">
        <span className="absolute left-3 top-3 rounded-md px-2 py-1 font-mono text-xs font-bold text-white" style={{ backgroundColor: color }}>
          {code}
        </span>
        <span className="absolute right-3 top-4 text-[10px] text-muted">{share} of train boxes</span>
        <div className="damage-art aspect-[640/410] w-full">
          <Illustration code={code} short={short} color={color} />
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-display text-2xl tracking-tight text-ink">{name}</h3>
        <p className="mt-2 text-xs leading-5 text-muted">{description}</p>
        <div className="mt-auto space-y-3 border-t border-line pt-3">
          <div className="mt-3">
            <h4 className="text-xs font-medium text-ink">Typical repair</h4>
            <p className="mt-1 text-xs leading-5 text-muted">{repair}</p>
          </div>
          <div>
            <h4 className="text-xs font-medium text-ink">Severity</h4>
            <p className="mt-1 text-xs leading-5 text-muted">{severity}</p>
            <div className="mt-2 flex gap-1" aria-label={`Road Health Index weight ${weight} of 4`}>
              {[1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className="h-1 w-6 rounded-full transition-colors duration-300"
                  style={{ backgroundColor: i <= weight ? color : "#e2e6e8" }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}