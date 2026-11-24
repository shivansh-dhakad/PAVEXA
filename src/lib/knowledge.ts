import type { DamageCode } from "./damage";

export type Severity = "Low" | "Moderate" | "High" | "Critical";

export const SEVERITY_ORDER: Severity[] = ["Critical", "High", "Moderate", "Low"];
export const severityRank = (s: Severity) => SEVERITY_ORDER.indexOf(s);

export const SEVERITY_COLOR: Record<Severity, string> = {
  Low: "#16a34a",
  Moderate: "#d97706",
  High: "#ea580c",
  Critical: "#dc2626",
};

export const SEVERITY_ACTION: Record<Severity, string> = {
  Critical: "Send a crew within 48 hours.",
  High: "Schedule the repair within 7 days.",
  Moderate: "Plan the repair within 30 days.",
  Low: "Keep monitoring. No repair needed yet.",
};

export const REMEDY: Record<DamageCode, string> = {
  D00: "Clean the crack and seal it with hot-pour elastomeric sealant.",
  D10: "Rout the crack, seal it, and restore the transverse joint.",
  D20: "Fatigue failure. Reclaim the full depth or mill and lay a high-modulus overlay.",
  D40: "Safety hazard. Cold-patch now, then a permanent infrared or hot-mix patch.",
};

/** Same cut-offs as the Road Health Index tiers. Any pothole raises the floor to High. */
export function severityFromRhi(rhi: number, hasPothole: boolean): Severity {
  let s: Severity = rhi < 40 ? "Critical" : rhi < 60 ? "High" : rhi < 80 ? "Moderate" : "Low";
  if (hasPothole && (s === "Low" || s === "Moderate")) s = "High";
  return s;
}
