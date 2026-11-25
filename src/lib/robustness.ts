import type { Detection } from "./damage";
import { loadImage } from "./vision";

export const ROBUSTNESS_CONDITIONS = [
  { id: "low-light", label: "Low light", description: "Brightness reduced to 55%" },
  { id: "overexposure", label: "Overexposure", description: "Brightness increased to 140%" },
  { id: "low-contrast", label: "Low contrast", description: "Contrast reduced to 55%" },
  { id: "blur", label: "Gaussian blur", description: "2 px blur applied" },
  { id: "jpeg-compression", label: "JPEG compression", description: "Compressed at 25% quality" },
  { id: "fog", label: "Fog / haze", description: "Light veil overlays the image" },
  { id: "occlusion", label: "Partial occlusion", description: "Central area obscured" },
] as const;

export type RobustnessConditionId = (typeof ROBUSTNESS_CONDITIONS)[number]["id"];

export interface RobustnessComparison {
  baselineCount: number;
  variantCount: number;
  matchedCount: number;
  additionalCount: number;
  retentionRate: number | null;
  meanIou: number | null;
  meanConfidenceDelta: number | null;
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the transformed image."))),
      type,
      quality,
    );
  });
}

export async function createRobustnessVariant(
  file: File,
  condition: RobustnessConditionId,
): Promise<Blob> {
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(sourceUrl);
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare the transformed image.");

    if (condition === "low-light") context.filter = "brightness(55%)";
    if (condition === "overexposure") context.filter = "brightness(140%)";
    if (condition === "low-contrast") context.filter = "contrast(55%)";
    if (condition === "blur") context.filter = "blur(2px)";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    context.filter = "none";

    if (condition === "fog") {
      context.fillStyle = "rgba(235, 239, 240, 0.4)";
      context.fillRect(0, 0, canvas.width, canvas.height);
    } else if (condition === "occlusion") {
      context.fillStyle = "rgba(35, 40, 44, 0.82)";
      context.fillRect(canvas.width * 0.41, canvas.height * 0.34, canvas.width * 0.18, canvas.height * 0.32);
    }

    const compressed = condition === "jpeg-compression";
    return await canvasBlob(
      canvas,
      compressed ? "image/jpeg" : file.type,
      compressed ? 0.25 : 0.92,
    );
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function intersectionOverUnion(a: Detection, b: Detection) {
  const width = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
  const height = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
  const intersection = width * height;
  const areaA = Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1);
  const areaB = Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
  const union = areaA + areaB - intersection;
  return union > 0 ? intersection / union : 0;
}

export function compareRobustness(
  baseline: Detection[],
  variant: Detection[],
  threshold: number,
  minimumIou = 0.5,
): RobustnessComparison {
  const baseBoxes = baseline
    .filter((detection) => detection.confidence >= threshold)
    .sort((a, b) => b.confidence - a.confidence);
  const variantBoxes = variant.filter((detection) => detection.confidence >= threshold);
  const unmatched = new Set(variantBoxes.map((_, index) => index));
  const matches: Array<{ iou: number; confidenceDelta: number }> = [];

  for (const baseBox of baseBoxes) {
    let bestIndex = -1;
    let bestIou = minimumIou;
    unmatched.forEach((index) => {
      const candidate = variantBoxes[index];
      if (candidate.code !== baseBox.code) return;
      const iou = intersectionOverUnion(baseBox, candidate);
      if (iou > bestIou) {
        bestIou = iou;
        bestIndex = index;
      }
    });

    if (bestIndex < 0) continue;
    unmatched.delete(bestIndex);
    matches.push({
      iou: bestIou,
      confidenceDelta: (variantBoxes[bestIndex].confidence - baseBox.confidence) * 100,
    });
  }

  return {
    baselineCount: baseBoxes.length,
    variantCount: variantBoxes.length,
    matchedCount: matches.length,
    additionalCount: Math.max(0, variantBoxes.length - matches.length),
    retentionRate: baseBoxes.length ? (matches.length / baseBoxes.length) * 100 : null,
    meanIou: matches.length
      ? matches.reduce((sum, match) => sum + match.iou, 0) / matches.length
      : null,
    meanConfidenceDelta: matches.length
      ? matches.reduce((sum, match) => sum + match.confidenceDelta, 0) / matches.length
      : null,
  };
}
