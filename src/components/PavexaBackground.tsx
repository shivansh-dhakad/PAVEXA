import { useEffect, useRef } from "react";

type RGB = [number, number, number];

interface PavexaBackgroundProps {
  /** Animation speed multiplier (1 = default). */
  speed?: number;
  /** Strength of the sweeping LiDAR scan lines, 0–1. */
  lidar?: number;
  /** Extra classes for the canvas element. */
  className?: string;
}

const TWO_PI = Math.PI * 2;
const PERIOD = 64;
const LOOP_SEC = 24;
const COLS = 18;
const ROWS = 36;

const C = {
  bg: "#F8FAFC",
  hw: "#FFFFFF",
  glow: "rgba(37, 99, 235, 0.08)",
  p: [37, 99, 235] as RGB,
  sky: [2, 132, 199] as RGB,
  amb: [217, 119, 6] as RGB,
  cor: [225, 29, 72] as RGB,
  g: [148, 163, 184] as RGB,
  gf: [203, 213, 225] as RGB,
};

const NODES = Array.from({ length: 22 }, (_, i) => {
  const r = (k: number) => {
    const x = Math.sin(i * k) * 43758.5453;
    return x - Math.floor(x);
  };
  return {
    bx: r(12.98),
    by: 0.07 + r(78.23) * 0.34,
    ax: 0.016 + r(39.42) * 0.028,
    ay: 0.012 + r(19.19) * 0.022,
    f: (i % 3) + 1,
    ph: r(78.23) * TWO_PI,
    alt: i % 5 === 0,
  };
});

const rgba = (rgb: RGB, a: number) =>
  `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`;

function elev(col: number, row: number) {
  const wr = ((row % PERIOD) + PERIOD) % PERIOD;
  const th = (wr / PERIOD) * TWO_PI;
  const ax = Math.abs(col);
  const crown =
    ax < 0.44 ? -0.07 * Math.cos((col / 0.44) * 1.5708) : Math.pow((ax - 0.44) / 0.56, 1.8) * 0.82;
  return (
    crown +
    Math.sin(th * 2 + col * 4.5) * 0.12 +
    Math.cos(th * 3 - col * 7) * 0.07 +
    (ax >= 0.44
      ? (Math.sin(th * 4 + col * 9) * 0.2 + Math.cos(th + col * 5) * 0.16) * ((ax - 0.44) / 0.56)
      : 0)
  );
}

interface GridPoint {
  x: number;
  y: number;
  cn: number;
  dp: number;
  env: number;
  lb: number;
  wr: number;
}

export default function PavexaBackground({
  speed = 1,
  lidar = 0.85,
  className = "pointer-events-none fixed inset-0 -z-10 h-full w-full",
}: PavexaBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const maybeCanvas = canvasRef.current;
    if (!maybeCanvas) return;
    const maybeCtx = maybeCanvas.getContext("2d", { alpha: false });
    if (!maybeCtx) return;
    const canvas: HTMLCanvasElement = maybeCanvas;
    const ctx: CanvasRenderingContext2D = maybeCtx;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0;
    let h = 0;
    let mx = 0;
    let my = 0;
    let tmx = 0;
    let tmy = 0;
    let dist = 0;
    let clock = 0;
    let last = performance.now();
    let raf = 0;

    const draw = (dt: number) => {
      mx += (tmx - mx) * 0.05;
      my += (tmy - my) * 0.05;
      dist = (dist + dt * 5.0 * speed) % PERIOD;
      clock = (clock + dt * speed) % LOOP_SEC;

      const hy = h * (0.42 + my * 0.02);
      const vx = w * (0.5 + mx * 0.04);
      const th = (clock / LOOP_SEC) * TWO_PI;

      const bgG = ctx.createLinearGradient(0, 0, 0, h);
      bgG.addColorStop(0, C.bg);
      bgG.addColorStop(0.42, C.hw);
      bgG.addColorStop(1, C.bg);
      ctx.fillStyle = bgG;
      ctx.fillRect(0, 0, w, h);

      const rg = ctx.createRadialGradient(vx, hy, 12, vx, hy, Math.max(w, h) * 0.65);
      rg.addColorStop(0, C.glow);
      rg.addColorStop(0.6, "rgba(255,255,255,0)");
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);

      for (let i = 0; i < 4; i++) {
        ctx.strokeStyle = rgba(C.gf, 0.22 + i * 0.06);
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let s = 0; s <= 64; s++) {
          const u = s / 64;
          const y =
            hy * (0.26 + i * 0.15) +
            Math.sin(u * 12.566 + th + i * 1.15) * 12 +
            Math.cos(u * 21.991 - th * 2 + i * 0.75) * 5;
          if (s) ctx.lineTo(u * w, y);
          else ctx.moveTo(u * w, y);
        }
        ctx.stroke();
      }

      const pts = NODES.map((n) => ({
        ...n,
        x: (n.bx + Math.sin(th * n.f + n.ph) * n.ax + mx * 0.012) * w,
        y: (n.by + Math.cos(th * n.f + n.ph) * n.ay + my * 0.008) * h,
      }));
      const md = Math.min(w, h) * 0.21;
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
          if (d < md) {
            ctx.strokeStyle = rgba(C.p, (1 - d / md) * 0.18);
            ctx.lineWidth = 0.85;
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.stroke();
          }
        }
      }
      pts.forEach((n) => {
        ctx.fillStyle = rgba(n.alt ? C.amb : C.p, 0.55);
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.alt ? 2.3 : 1.8, 0, TWO_PI);
        ctx.fill();
      });

      const iRow = Math.floor(dist);
      const fRow = dist - iRow;
      const lw1 = (dist / 16) % 1;
      const lw2 = ((dist + 8) / 16) % 1;
      const fov = Math.min(w, h) * 0.68;

      const grid: GridPoint[][] = Array.from({ length: ROWS + 1 }, (_, r) => {
        const zn = (r + (1 - fRow)) / ROWS;
        const sc = fov / (1.4 + Math.pow(zn, 1.55) * 34);
        const wr = iRow + (ROWS - r);
        const dp = 1 - zn;
        const env = Math.sin(dp * Math.PI);
        const wDist = Math.min(
          Math.abs(dp - lw1),
          Math.abs(dp - lw2),
          1 - Math.abs(dp - lw1),
          1 - Math.abs(dp - lw2),
        );
        const lb = lidar * Math.exp(-Math.pow(wDist / 0.048, 2)) * env;
        return Array.from({ length: COLS + 1 }, (_, col) => {
          const cn = (col / COLS) * 2 - 1;
          return { x: vx + cn * 5.4 * sc, y: hy + (2.35 - elev(cn, wr)) * sc, cn, dp, env, lb, wr };
        });
      });

      const lCol = Math.max(0, Math.round(COLS * 0.28));
      const rCol = Math.min(COLS, Math.round(COLS * 0.72));
      for (let r = 0; r < ROWS; r++) {
        const p1 = grid[r][lCol];
        const p2 = grid[r][rCol];
        const p3 = grid[r + 1][rCol];
        const p4 = grid[r + 1][lCol];
        const fade = Math.pow(p1.dp, 1.4) * p1.env;
        if (fade < 0.02) continue;
        ctx.fillStyle = rgba([226, 232, 240], fade * 0.35 + p1.lb * 0.12);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.closePath();
        ctx.fill();
      }

      for (let r = 0; r < ROWS; r++) {
        const row = grid[r];
        const fade = Math.pow(row[0].dp, 1.25) * row[0].env;
        if (fade < 0.01) continue;
        ctx.strokeStyle = rgba(row[0].lb > 0.14 ? C.p : C.g, Math.min(0.88, fade * 0.42 + row[0].lb * 0.65));
        ctx.lineWidth = 0.9 + row[0].lb * 1.45;
        ctx.beginPath();
        row.forEach((p, idx) => (idx ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.stroke();
      }

      for (let col = 0; col <= COLS; col++) {
        const cn = (col / COLS) * 2 - 1;
        const edge = Math.abs(Math.abs(cn) - 0.44) < 1.05 / COLS;
        const mid = Math.abs(cn) < 0.6 / COLS;
        for (let r = 0; r < ROWS; r++) {
          const p1 = grid[r][col];
          const p2 = grid[r + 1][col];
          const fade = Math.pow(p1.dp, 1.2) * p1.env;
          if (fade < 0.01) continue;
          const b = Math.max(p1.lb, p2.lb);
          if (mid && ((p1.wr % 6) + 6) % 6 >= 3) continue;
          ctx.strokeStyle = mid
            ? rgba(C.amb, Math.min(0.92, fade * 0.78 + b * 0.25))
            : edge
              ? rgba(C.p, Math.min(0.88, fade * 0.62 + b * 0.4))
              : rgba(b > 0.16 ? C.sky : C.g, Math.min(0.85, fade * (Math.abs(cn) < 0.44 ? 0.36 : 0.26) + b * 0.55));
          ctx.lineWidth = mid ? 1.8 : edge ? 1.4 : 0.85 + b * 1.15;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }

      const markers = [C.p, C.sky, C.amb, C.cor];
      for (let r = 1; r < ROWS - 2; r += 3) {
        const row = grid[r];
        const fade = Math.pow(row[0].dp, 1.3) * row[0].env;
        if (fade < 0.14) continue;
        for (let col = 2; col < COLS - 1; col += 2) {
          const pt = row[col];
          if (Math.abs(pt.cn) > 0.46) continue;
          const hVal = Math.sin(pt.wr * 19.19 + col * 47.77) * 43758.5453;
          const frac = hVal - Math.floor(hVal);
          if (frac > 0.78) {
            const idx = Math.floor(((frac - 0.78) / 0.22) * 4) % 4;
            const rad = (1.8 + fade * 2.1) * (1 + pt.lb * 0.45);
            ctx.fillStyle = rgba(markers[idx], Math.min(0.95, fade * 0.78 + pt.lb * 0.65));
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, rad, 0, TWO_PI);
            ctx.fill();
          }
        }
      }
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduceMotion) draw(0);
    };

    const onMove = (e: MouseEvent) => {
      tmx = (e.clientX / Math.max(1, w) - 0.5) * 2;
      tmy = (e.clientY / Math.max(1, h) - 0.5) * 2;
    };

    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      draw(dt);
      raf = requestAnimationFrame(loop);
    };

    window.addEventListener("resize", resize);
    resize();
    if (!reduceMotion) {
      window.addEventListener("mousemove", onMove, { passive: true });
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
    };
  }, [speed, lidar]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}