import { CLASS_COLORS, type Detection } from "./damage";

export const TAU = 0.1821;

export const boxArea = (detection: Detection) =>
  Math.max(0, (detection.x2 - detection.x1) * (detection.y2 - detection.y1));

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("This image could not be read."));
    image.src = src;
  });
}

export function drawBoxes(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  detections: Detection[],
) {
  const scale = Math.max(1, width / 900);
  detections.forEach((detection) => {
    const color = CLASS_COLORS[detection.code];
    const x = detection.x1 * width;
    const y = detection.y1 * height;
    const boxWidth = (detection.x2 - detection.x1) * width;
    const boxHeight = (detection.y2 - detection.y1) * height;
    context.lineWidth = 2.5 * scale;
    context.strokeStyle = color;
    context.strokeRect(x, y, boxWidth, boxHeight);
    context.fillStyle = `${color}24`;
    context.fillRect(x, y, boxWidth, boxHeight);

    const label = `${detection.code} ${(detection.confidence * 100).toFixed(1)}%`;
    context.font = `500 ${Math.round(12 * scale)}px 'IBM Plex Mono', monospace`;
    const labelWidth = context.measureText(label).width;
    const labelHeight = 20 * scale;
    const labelY = y - labelHeight > 0 ? y - labelHeight : y;
    context.fillStyle = color;
    context.fillRect(x, labelY, labelWidth + 10 * scale, labelHeight);
    context.fillStyle = "#ffffff";
    context.fillText(label, x + 5 * scale, labelY + labelHeight - 6 * scale);
  });
}
