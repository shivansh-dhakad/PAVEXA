/** Real RDD2020 road survey samples stored locally for instant 100% offline reliability */
export interface SamplePhoto {
  id: string;
  label: string;
  /** Short machine-readable name used as a file label */
  name: string;
  /** Dominant damage class in the sample frame */
  damageClass: "D00" | "D10" | "D20" | "D40";
  description: string;
  url: string;
  thumb: string;
}

export const SAMPLE_PHOTOS: SamplePhoto[] = [
  {
    id: "rdd-potholes",
    label: "RDD Potholes & Cracks",
    name: "D40 Pothole",
    damageClass: "D40",
    description: "Official RDD2020 survey frame containing pothole cavities and transverse fissures.",
    url: "/samples/img_000012.jpg",
    thumb: "/samples/img_000012.jpg",
  },
  {
    id: "rdd-alligator",
    label: "RDD Alligator Surface",
    name: "D20 Alligator",
    damageClass: "D20",
    description: "High-density fatigue cracking with characteristic polygonal interconnected network.",
    url: "/samples/img_000044.jpg",
    thumb: "/samples/img_000044.jpg",
  },
  {
    id: "rdd-transverse",
    label: "RDD Transverse Cracks",
    name: "D10 Transverse",
    damageClass: "D10",
    description: "Thermal contraction fractures perpendicular to vehicle travel trajectory.",
    url: "/samples/img_000052.jpg",
    thumb: "/samples/img_000052.jpg",
  },
  {
    id: "rdd-longitudinal",
    label: "RDD Longitudinal Seam",
    name: "D00 Longitudinal",
    damageClass: "D00",
    description: "Lane seam crack propagation along the direction of traffic flow.",
    url: "/samples/img_000060.jpg",
    thumb: "/samples/img_000060.jpg",
  },
  {
    id: "rdd-mixed",
    label: "RDD Mixed Distress",
    name: "Multi-Class Frame",
    damageClass: "D20",
    description: "Mixed cracking survey frame with multiple overlapping damage classes.",
    url: "/samples/img_000099.jpg",
    thumb: "/samples/img_000099.jpg",
  },
];
