/**
 * src/lib/gisData.ts
 * GIS inspection pin data, hotspot concentration models, and persistent storage layer.
 */

import { type DamageCode } from "./damage";

export interface InspectionPin {
  id: string;
  inspectionId: string; // e.g. "INS-001"
  lat: number;
  lng: number;
  city: string;
  country: string;
  road: string;
  date: string;
  rhi: number;
  dominantClass: DamageCode;
  detectionCount: number;
  d00Count: number;
  d10Count: number;
  d20Count: number;
  d40Count: number;
  imageUrl: string;
  status: "Completed" | "Pending Repair" | "Monitored";
  corridor?: string;
}

export interface ConcentrationHotspot {
  id: string;
  name: string;
  corridor: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  incidentCount: number;
  avgRhi: number;
  dominantClass: DamageCode;
  severityTier: "Critical" | "High" | "Moderate";
  radiusMeters: number;
}

export const INITIAL_INSPECTION_PINS: InspectionPin[] = [
  // Mysuru, India (High concentration corridor)
  {
    id: "mys-01",
    inspectionId: "INS-101",
    lat: 12.2958,
    lng: 76.6394,
    city: "Mysuru",
    country: "India",
    road: "NH-275 Bypass KM 14.8",
    corridor: "Mysuru-Bengaluru Expressway Corridor",
    date: "24 Nov 2026",
    rhi: 34,
    dominantClass: "D40",
    detectionCount: 11,
    d00Count: 2,
    d10Count: 1,
    d20Count: 3,
    d40Count: 5,
    imageUrl: "/samples/img_000012.jpg",
    status: "Pending Repair",
  },
  {
    id: "mys-02",
    inspectionId: "INS-102",
    lat: 12.3051,
    lng: 76.6551,
    city: "Mysuru",
    country: "India",
    road: "Hunsur Road Sector 4",
    corridor: "Arterial Ring Road",
    date: "23 Nov 2026",
    rhi: 58,
    dominantClass: "D20",
    detectionCount: 7,
    d00Count: 1,
    d10Count: 2,
    d20Count: 4,
    d40Count: 0,
    imageUrl: "/samples/img_000044.jpg",
    status: "Completed",
  },
  {
    id: "mys-03",
    inspectionId: "INS-103",
    lat: 12.2817,
    lng: 76.6462,
    city: "Mysuru",
    country: "India",
    road: "Bannimantap Heavy Freight Road",
    corridor: "Industrial Goods Ring Road",
    date: "22 Nov 2026",
    rhi: 22,
    dominantClass: "D40",
    detectionCount: 14,
    d00Count: 3,
    d10Count: 2,
    d20Count: 3,
    d40Count: 6,
    imageUrl: "/samples/img_000099.jpg",
    status: "Pending Repair",
  },
  {
    id: "mys-04",
    inspectionId: "INS-104",
    lat: 12.3214,
    lng: 76.6183,
    city: "Mysuru",
    country: "India",
    road: "Chamundi Hill Road Approach",
    corridor: "Hill Scenic Highway",
    date: "21 Nov 2026",
    rhi: 71,
    dominantClass: "D00",
    detectionCount: 4,
    d00Count: 3,
    d10Count: 1,
    d20Count: 0,
    d40Count: 0,
    imageUrl: "/samples/img_000060.jpg",
    status: "Monitored",
  },
  {
    id: "mys-05",
    inspectionId: "INS-105",
    lat: 12.2690,
    lng: 76.6530,
    city: "Mysuru",
    country: "India",
    road: "Outer Ring Road South Junction",
    corridor: "Mysuru Southern Orbital Sector",
    date: "20 Nov 2026",
    rhi: 45,
    dominantClass: "D10",
    detectionCount: 9,
    d00Count: 2,
    d10Count: 5,
    d20Count: 1,
    d40Count: 1,
    imageUrl: "/samples/img_000052.jpg",
    status: "Completed",
  },

  // Tokyo, Japan
  {
    id: "tky-01",
    inspectionId: "INS-201",
    lat: 35.6895,
    lng: 139.6917,
    city: "Tokyo",
    country: "Japan",
    road: "Route 1 Tokaido Expressway",
    corridor: "National Highway 1",
    date: "19 Nov 2026",
    rhi: 88,
    dominantClass: "D00",
    detectionCount: 2,
    d00Count: 2,
    d10Count: 0,
    d20Count: 0,
    d40Count: 0,
    imageUrl: "/samples/img_000060.jpg",
    status: "Completed",
  },
  {
    id: "tky-02",
    inspectionId: "INS-202",
    lat: 35.7044,
    lng: 139.7719,
    city: "Tokyo",
    country: "Japan",
    road: "Meiji-dori Avenue Overpass",
    corridor: "Tokyo Inner Ring Route",
    date: "18 Nov 2026",
    rhi: 76,
    dominantClass: "D10",
    detectionCount: 5,
    d00Count: 1,
    d10Count: 4,
    d20Count: 0,
    d40Count: 0,
    imageUrl: "/samples/img_000052.jpg",
    status: "Monitored",
  },
  {
    id: "tky-03",
    inspectionId: "INS-203",
    lat: 35.6762,
    lng: 139.6503,
    city: "Tokyo",
    country: "Japan",
    road: "Shibuya Expressway Link",
    corridor: "Metropolitan Expressway Route 4",
    date: "17 Nov 2026",
    rhi: 91,
    dominantClass: "D00",
    detectionCount: 1,
    d00Count: 1,
    d10Count: 0,
    d20Count: 0,
    d40Count: 0,
    imageUrl: "/samples/img_000012.jpg",
    status: "Completed",
  },
  {
    id: "tky-04",
    inspectionId: "INS-204",
    lat: 35.7148,
    lng: 139.7967,
    city: "Tokyo",
    country: "Japan",
    road: "Sumida Riverside Blvd",
    corridor: "East Tokyo Arterial Sector",
    date: "16 Nov 2026",
    rhi: 63,
    dominantClass: "D20",
    detectionCount: 6,
    d00Count: 1,
    d10Count: 1,
    d20Count: 4,
    d40Count: 0,
    imageUrl: "/samples/img_000044.jpg",
    status: "Completed",
  },

  // Prague, Czech Republic
  {
    id: "prg-01",
    inspectionId: "INS-301",
    lat: 50.0755,
    lng: 14.4378,
    city: "Prague",
    country: "Czech Republic",
    road: "Václavské náměstí Transitway",
    corridor: "Historic Central Corridor",
    date: "15 Nov 2026",
    rhi: 55,
    dominantClass: "D10",
    detectionCount: 8,
    d00Count: 2,
    d10Count: 5,
    d20Count: 1,
    d40Count: 0,
    imageUrl: "/samples/img_000052.jpg",
    status: "Completed",
  },
  {
    id: "prg-02",
    inspectionId: "INS-302",
    lat: 50.0870,
    lng: 14.4213,
    city: "Prague",
    country: "Czech Republic",
    road: "Letná Park Drive",
    corridor: "Northern Transit Link",
    date: "14 Nov 2026",
    rhi: 68,
    dominantClass: "D20",
    detectionCount: 5,
    d00Count: 1,
    d10Count: 1,
    d20Count: 3,
    d40Count: 0,
    imageUrl: "/samples/img_000044.jpg",
    status: "Monitored",
  },
  {
    id: "prg-03",
    inspectionId: "INS-303",
    lat: 50.0592,
    lng: 14.4655,
    city: "Prague",
    country: "Czech Republic",
    road: "D1 Highway Corridor KM 88",
    corridor: "Central Bohemian Transit Spine",
    date: "13 Nov 2026",
    rhi: 42,
    dominantClass: "D40",
    detectionCount: 10,
    d00Count: 2,
    d10Count: 2,
    d20Count: 2,
    d40Count: 4,
    imageUrl: "/samples/img_000012.jpg",
    status: "Pending Repair",
  },
  {
    id: "prg-04",
    inspectionId: "INS-304",
    lat: 50.1050,
    lng: 14.3899,
    city: "Prague",
    country: "Czech Republic",
    road: "Dejvice Railway Underpass Approach",
    corridor: "Northern Arterial Ring",
    date: "12 Nov 2026",
    rhi: 79,
    dominantClass: "D00",
    detectionCount: 3,
    d00Count: 2,
    d10Count: 1,
    d20Count: 0,
    d40Count: 0,
    imageUrl: "/samples/img_000060.jpg",
    status: "Completed",
  },
];

// Concentration hotspots (clusters of high reported road damage)
export const CONCENTRATION_HOTSPOTS: ConcentrationHotspot[] = [
  {
    id: "hotspot-01",
    name: "NH-275 Highway Bypass Hotspot",
    corridor: "Mysuru-Bengaluru Expressway Corridor",
    city: "Mysuru",
    country: "India",
    lat: 12.2958,
    lng: 76.6394,
    incidentCount: 42,
    avgRhi: 28,
    dominantClass: "D40",
    severityTier: "Critical",
    radiusMeters: 650,
  },
  {
    id: "hotspot-02",
    name: "Bannimantap Freight Freight Hub",
    corridor: "Industrial Goods Ring Road",
    city: "Mysuru",
    country: "India",
    lat: 12.2817,
    lng: 76.6462,
    incidentCount: 38,
    avgRhi: 32,
    dominantClass: "D20",
    severityTier: "Critical",
    radiusMeters: 550,
  },
  {
    id: "hotspot-03",
    name: "Prague D1 Highway Corridor KM 88",
    corridor: "Central Bohemian Transit Spine",
    city: "Prague",
    country: "Czech Republic",
    lat: 50.0592,
    lng: 14.4655,
    incidentCount: 29,
    avgRhi: 44,
    dominantClass: "D10",
    severityTier: "High",
    radiusMeters: 800,
  },
  {
    id: "hotspot-04",
    name: "Outer Ring Road South Junction",
    corridor: "Mysuru Southern Orbital Sector",
    city: "Mysuru",
    country: "India",
    lat: 12.2690,
    lng: 76.6530,
    incidentCount: 31,
    avgRhi: 39,
    dominantClass: "D40",
    severityTier: "High",
    radiusMeters: 600,
  },
];

const LOCAL_STORAGE_PINS_KEY = "pavexa_geotagged_pins";

/** Get stored pins from localStorage with fallback to default initial pins */
export function getStoredPins(): InspectionPin[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_PINS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // fallback
  }
  return INITIAL_INSPECTION_PINS;
}

/** Save a newly geo-tagged inspection pin */
export function saveStoredPin(newPin: InspectionPin): InspectionPin[] {
  const current = getStoredPins();
  const updated = [newPin, ...current];
  try {
    localStorage.setItem(LOCAL_STORAGE_PINS_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
  return updated;
}

/** Delete a geo-tagged pin by ID */
export function deleteStoredPin(id: string): InspectionPin[] {
  const current = getStoredPins();
  const updated = current.filter((p) => p.id !== id);
  try {
    localStorage.setItem(LOCAL_STORAGE_PINS_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
  return updated;
}
