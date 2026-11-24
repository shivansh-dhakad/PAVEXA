import { useEffect, useRef } from "react";

type RGB = readonly [number, number, number];

interface BackgroundNode {
  bx: number;
  by: number;
  ax: number;
  ay: number;
  frequency: number;
  phase: number;
  alternate: boolean;
}

interface Point extends BackgroundNode {
  x: number;
  y: number;
}

const PERIOD = 64;
const LOOP_SECONDS = 24;
const TWO_PI = Math.PI * 2;
const CONFIG = {
  speed: 1,
  columns: 18,
  rows: 36,
  lidar: 0.85,
  bg: "#F8FAFC",
  surface: "#FFFFFF",
  glow: "rgba(37, 99, 235, 0.08)",
  blue: [37, 99, 235] as RGB,
  sky: [2, 132, 199] as RGB,
  amber: [217, 119, 6] as RGB,
  coral: [225, 29, 72] as RGB,
  gray: [148, 163, 184] as RGB,
  grayLight: [203, 213, 225] as RGB,
};

const NODES: BackgroundNode[] = Array.from({ length: 22 }, (_, index) => {
  const random = (seed: number) => {
    const value = Math.sin(index * seed) * 43758.5453;
    return value - Math.floor(value);
  };

  return {
    bx: random(12.98),
    by: 0.07 + random(78.23) * 0.34,
    ax: 0.016 + random(39.42) * 0.028,
    ay: 0.012 + random(19.19) * 0.022,
    frequency: (index % 3) + 1,
    phase: random(78.23) * TWO_PI,
    alternate: index % 5 === 0,
  };
});

function elevation(column: number, row: number) {
  const wrappedRow = ((row % PERIOD) + PERIOD) % PERIOD;
  const theta = (wrappedRow / PERIOD) * TWO_PI;
  const absColumn = Math.abs(column);
  const crown =
    absColumn < 0.44
      ? -0.07 * Math.cos((column / 0.44) * 1.5708)
      : Math.pow((absColumn - 0.44) / 0.56, 1.8) * 0.82;

  return (
    crown +
    Math.sin(theta * 2 + column * 4.5) * 0.12 +
    Math.cos(theta * 3 - column * 7) * 0.07 +
    (absColumn >= 0.44
      ? (Math.sin(theta * 4 + column * 9) * 0.2 +
          Math.cos(theta + column * 5) * 0.16) *
        ((absColumn - 0.44) / 0.56)
      : 0)
  );
}

function rgba(color: RGB, alpha: number) {
  const boundedAlpha = Math.max(0, Math.min(1, alpha));
  return `rgba(${color[0]},${color[1]},${color[2]},${boundedAlpha.toFixed(3)})`;
}

export default function PavexaBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { alpha: false });
    if (!canvas || !context) return;

    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0;
    let height = 0;
    let mouseX = 0;
    let mouseY = 0;
    let targetMouseX = 0;
    let targetMouseY = 0;
    let distance = 0;
    let clock = 0;
    let lastFrameTime = performance.now();
    let animationFrame = 0;
    let isRunning = false;

    const resize = () => {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      width = document.documentElement.clientWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    };

    const handleMouseMove = (event: MouseEvent) => {
      targetMouseX = (event.clientX / Math.max(1, width) - 0.5) * 2;
      targetMouseY = (event.clientY / Math.max(1, height) - 0.5) * 2;
    };

    const draw = (now: number, animate: boolean) => {
      if (animate && now - lastFrameTime < 1000 / 30) {
        animationFrame = window.requestAnimationFrame((time) => draw(time, true));
        return;
      }

      const deltaTime = animate
        ? Math.min((now - lastFrameTime) / 1000, 0.1)
        : 0;
      lastFrameTime = now;
      if (animate) {
        mouseX += (targetMouseX - mouseX) * 0.05;
        mouseY += (targetMouseY - mouseY) * 0.05;
        distance = (distance + deltaTime * 5 * CONFIG.speed) % PERIOD;
        clock = (clock + deltaTime * CONFIG.speed) % LOOP_SECONDS;
      }

      const horizonY = height * (0.42 + mouseY * 0.02);
      const vanishingX = width * (0.5 + mouseX * 0.04);
      const theta = (clock / LOOP_SECONDS) * TWO_PI;
      const background = context.createLinearGradient(0, 0, 0, height);
      background.addColorStop(0, CONFIG.bg);
      background.addColorStop(0.42, CONFIG.surface);
      background.addColorStop(1, CONFIG.bg);
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);

      const glow = context.createRadialGradient(
        vanishingX,
        horizonY,
        12,
        vanishingX,
        horizonY,
        Math.max(width, height) * 0.65,
      );
      glow.addColorStop(0, CONFIG.glow);
      glow.addColorStop(0.6, "rgba(255,255,255,0)");
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);

      for (let index = 0; index < 4; index += 1) {
        context.strokeStyle = rgba(CONFIG.grayLight, 0.22 + index * 0.06);
        context.lineWidth = 1;
        context.beginPath();
        for (let step = 0; step <= 64; step += 1) {
          const progress = step / 64;
          const y =
            horizonY * (0.26 + index * 0.15) +
            Math.sin(progress * 12.566 + theta + index * 1.15) * 12 +
            Math.cos(progress * 21.991 - theta * 2 + index * 0.75) * 5;
          if (step === 0) context.moveTo(progress * width, y);
          else context.lineTo(progress * width, y);
        }
        context.stroke();
      }

      const points: Point[] = NODES.map((node) => ({
        ...node,
        x:
          (node.bx +
            Math.sin(theta * node.frequency + node.phase) * node.ax +
            mouseX * 0.012) *
          width,
        y:
          (node.by +
            Math.cos(theta * node.frequency + node.phase) * node.ay +
            mouseY * 0.008) *
          height,
      }));
      const maxDistance = Math.min(width, height) * 0.21;

      for (let first = 0; first < points.length; first += 1) {
        for (let second = first + 1; second < points.length; second += 1) {
          const start = points[first];
          const end = points[second];
          const separation = Math.hypot(start.x - end.x, start.y - end.y);
          if (separation >= maxDistance) continue;

          context.strokeStyle = rgba(
            CONFIG.blue,
            (1 - separation / maxDistance) * 0.18,
          );
          context.lineWidth = 0.85;
          context.beginPath();
          context.moveTo(start.x, start.y);
          context.lineTo(end.x, end.y);
          context.stroke();
        }
      }

      points.forEach((point) => {
        context.fillStyle = rgba(
          point.alternate ? CONFIG.amber : CONFIG.blue,
          0.55,
        );
        context.beginPath();
        context.arc(point.x, point.y, point.alternate ? 2.3 : 1.8, 0, TWO_PI);
        context.fill();
      });

      const firstRow = Math.floor(distance);
      const rowFraction = distance - firstRow;
      const firstLidarWave = (distance / 16) % 1;
      const secondLidarWave = ((distance + 8) / 16) % 1;
      const fieldOfView = Math.min(width, height) * 0.68;
      const grid = Array.from({ length: CONFIG.rows + 1 }, (_, row) => {
        const depth = (row + (1 - rowFraction)) / CONFIG.rows;
        const scale = fieldOfView / (1.4 + Math.pow(depth, 1.55) * 34);
        const worldRow = firstRow + (CONFIG.rows - row);
        const distanceProgress = 1 - depth;
        const envelope = Math.sin(distanceProgress * Math.PI);
        const waveDistance = Math.min(
          Math.abs(distanceProgress - firstLidarWave),
          Math.abs(distanceProgress - secondLidarWave),
          1 - Math.abs(distanceProgress - firstLidarWave),
          1 - Math.abs(distanceProgress - secondLidarWave),
        );
        const lidar = CONFIG.lidar * Math.exp(-Math.pow(waveDistance / 0.048, 2)) * envelope;

        return Array.from({ length: CONFIG.columns + 1 }, (_, column) => {
          const normalizedColumn = (column / CONFIG.columns) * 2 - 1;
          return {
            x: vanishingX + normalizedColumn * 5.4 * scale,
            y: horizonY + (2.35 - elevation(normalizedColumn, worldRow)) * scale,
            normalizedColumn,
            depthProgress: distanceProgress,
            envelope,
            lidar,
            worldRow,
          };
        });
      });

      for (let row = 0; row < CONFIG.rows; row += 1) {
        const first = grid[row][Math.round(CONFIG.columns * 0.28)];
        const second = grid[row][Math.round(CONFIG.columns * 0.72)];
        const third = grid[row + 1][Math.round(CONFIG.columns * 0.72)];
        const fourth = grid[row + 1][Math.round(CONFIG.columns * 0.28)];
        const fade = Math.pow(first.depthProgress, 1.4) * first.envelope;
        if (fade < 0.02) continue;

        context.fillStyle = rgba(
          [226, 232, 240],
          fade * 0.35 + first.lidar * 0.12,
        );
        context.beginPath();
        context.moveTo(first.x, first.y);
        context.lineTo(second.x, second.y);
        context.lineTo(third.x, third.y);
        context.lineTo(fourth.x, fourth.y);
        context.closePath();
        context.fill();
      }

      for (let rowIndex = 0; rowIndex < CONFIG.rows; rowIndex += 1) {
        const row = grid[rowIndex];
        const fade = Math.pow(row[0].depthProgress, 1.25) * row[0].envelope;
        if (fade < 0.01) continue;

        context.strokeStyle = rgba(
          row[0].lidar > 0.14 ? CONFIG.blue : CONFIG.gray,
          Math.min(0.88, fade * 0.42 + row[0].lidar * 0.65),
        );
        context.lineWidth = 0.9 + row[0].lidar * 1.45;
        context.beginPath();
        row.forEach((point, index) => {
          if (index === 0) context.moveTo(point.x, point.y);
          else context.lineTo(point.x, point.y);
        });
        context.stroke();
      }

      for (let column = 0; column <= CONFIG.columns; column += 1) {
        const normalizedColumn = (column / CONFIG.columns) * 2 - 1;
        const edge = Math.abs(Math.abs(normalizedColumn) - 0.44) < 1.05 / CONFIG.columns;
        const middle = Math.abs(normalizedColumn) < 0.6 / CONFIG.columns;

        for (let row = 0; row < CONFIG.rows; row += 1) {
          const first = grid[row][column];
          const second = grid[row + 1][column];
          const fade = Math.pow(first.depthProgress, 1.2) * first.envelope;
          if (fade < 0.01) continue;
          if (middle && ((first.worldRow % 6) + 6) % 6 >= 3) continue;

          const lidar = Math.max(first.lidar, second.lidar);
          context.strokeStyle = middle
            ? rgba(CONFIG.amber, Math.min(0.92, fade * 0.78 + lidar * 0.25))
            : edge
              ? rgba(CONFIG.blue, Math.min(0.88, fade * 0.62 + lidar * 0.4))
              : rgba(
                  lidar > 0.16 ? CONFIG.sky : CONFIG.gray,
                  Math.min(
                    0.85,
                    fade * (Math.abs(normalizedColumn) < 0.44 ? 0.36 : 0.26) +
                      lidar * 0.55,
                  ),
                );
          context.lineWidth = middle
            ? 1.8
            : edge
              ? 1.4
              : 0.85 + lidar * 1.15;
          context.beginPath();
          context.moveTo(first.x, first.y);
          context.lineTo(second.x, second.y);
          context.stroke();
        }
      }

      const damageColors = [
        CONFIG.blue,
        CONFIG.sky,
        CONFIG.amber,
        CONFIG.coral,
      ];
      for (let rowIndex = 1; rowIndex < CONFIG.rows - 2; rowIndex += 3) {
        const row = grid[rowIndex];
        const fade = Math.pow(row[0].depthProgress, 1.3) * row[0].envelope;
        if (fade < 0.14) continue;

        for (let column = 2; column < CONFIG.columns - 1; column += 2) {
          const point = row[column];
          if (Math.abs(point.normalizedColumn) > 0.46) continue;

          const value =
            Math.sin(point.worldRow * 19.19 + column * 47.77) * 43758.5453;
          const fraction = value - Math.floor(value);
          if (fraction <= 0.78) continue;

          const colorIndex =
            Math.floor(((fraction - 0.78) / 0.22) * damageColors.length) %
            damageColors.length;
          const radius = (1.8 + fade * 2.1) * (1 + point.lidar * 0.45);
          context.fillStyle = rgba(
            damageColors[colorIndex],
            Math.min(0.95, fade * 0.78 + point.lidar * 0.65),
          );
          context.beginPath();
          context.arc(point.x, point.y, radius, 0, TWO_PI);
          context.fill();
        }
      }

      if (animate && isRunning) {
        animationFrame = window.requestAnimationFrame((time) => draw(time, true));
      }
    };

    const stop = () => {
      isRunning = false;
      window.cancelAnimationFrame(animationFrame);
    };

    const start = () => {
      if (isRunning || motionPreference.matches || document.hidden) return;
      isRunning = true;
      lastFrameTime = performance.now();
      animationFrame = window.requestAnimationFrame((time) => draw(time, true));
    };

    const handleMotionChange = () => {
      if (motionPreference.matches) {
        window.removeEventListener("mousemove", handleMouseMove);
        stop();
        draw(performance.now(), false);
      } else {
        window.addEventListener("mousemove", handleMouseMove, { passive: true });
        start();
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) stop();
      else start();
    };

    const handleResize = () => {
      resize();
      draw(performance.now(), false);
    };

    resize();
    draw(lastFrameTime, false);
    window.addEventListener("resize", handleResize);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    motionPreference.addEventListener("change", handleMotionChange);
    if (!motionPreference.matches) {
      window.addEventListener("mousemove", handleMouseMove, { passive: true });
      start();
    }

    return () => {
      stop();
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      motionPreference.removeEventListener("change", handleMotionChange);
    };
  }, []);

  return <canvas ref={canvasRef} className="pavexa-background" aria-hidden="true" />;
}
