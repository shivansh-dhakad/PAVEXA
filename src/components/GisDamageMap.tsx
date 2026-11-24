import { useEffect, useRef, useState } from "react";
import {
  MapPinned, Filter, Plus, Crosshair,
  Upload, Check, Navigation, AlertTriangle, ExternalLink
} from "lucide-react";
import {
  getStoredPins,
  saveStoredPin,
  CONCENTRATION_HOTSPOTS,
  type InspectionPin,
} from "../lib/gisData";
import { DAMAGE_CLASSES, CLASS_COLORS, type DamageCode, rhiLabel } from "../lib/damage";
import { runInference } from "../lib/api";
import { SAMPLE_PHOTOS } from "../lib/samples";
import { persistInspectionRecord } from "../lib/database";
import { Link } from "react-router-dom";

type SeverityFilter = "all" | "critical" | "poor" | "fair" | "good";
type ClassFilter = "all" | DamageCode;

const SEVERITY_OPTIONS: { id: SeverityFilter; label: string; min: number; max: number }[] = [
  { id: "all", label: "All Severity", min: 0, max: 100 },
  { id: "critical", label: "Critical (<40 RHI)", min: 0, max: 39 },
  { id: "poor", label: "Poor (40-59 RHI)", min: 40, max: 59 },
  { id: "fair", label: "Fair (60-79 RHI)", min: 60, max: 79 },
  { id: "good", label: "Good (80-100 RHI)", min: 80, max: 100 },
];

declare global {
  interface Window {
    L: any;
  }
}

export default function GisDamageMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<any>(null);
  const markersGroup = useRef<any>(null);
  const hotspotCirclesGroup = useRef<any>(null);

  const [pins, setPins] = useState<InspectionPin[]>(() => getStoredPins());
  const [selectedPin, setSelectedPin] = useState<InspectionPin | null>(null);
  const [sevFilter, setSevFilter] = useState<SeverityFilter>("all");
  const [classFilter, setClassFilter] = useState<ClassFilter>("all");
  const [showHotspots, setShowHotspots] = useState(true);
  const [leafletReady, setLeafletReady] = useState(false);

  // Geo-tag modal state
  const [showGeotagModal, setShowGeotagModal] = useState(false);
  const [geotagImage, setGeotagImage] = useState<File | null>(null);
  const [geotagPreview, setGeotagPreview] = useState<string>("/samples/img_000012.jpg");
  const [geotagRoad, setGeotagRoad] = useState<string>("Bypass Arterial Link");
  const [geotagCity, setGeotagCity] = useState<string>("Mysuru");
  const [geotagLat, setGeotagLat] = useState<number>(12.2985);
  const [geotagLng, setGeotagLng] = useState<number>(76.6420);
  const [isProcessingGeotag, setIsProcessingGeotag] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load Leaflet CSS and JS
  useEffect(() => {
    if (window.L) {
      setLeafletReady(true);
      return;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => setLeafletReady(true);
    document.head.appendChild(script);
  }, []);

  // Initialize Map
  useEffect(() => {
    if (!leafletReady || !mapRef.current || leafletMap.current) return;
    const L = window.L;

    const map = L.map(mapRef.current, {
      zoomControl: true,
      maxBounds: [[-85, -180], [85, 180]],
    }).setView([12.2958, 76.6394], 12);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://www.openstreetmap.org">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    markersGroup.current = L.featureGroup().addTo(map);
    hotspotCirclesGroup.current = L.featureGroup().addTo(map);
    leafletMap.current = map;

    // Map click allows picking coordinates for geo-tagging if modal is open
    map.on("click", (e: any) => {
      setGeotagLat(parseFloat(e.latlng.lat.toFixed(5)));
      setGeotagLng(parseFloat(e.latlng.lng.toFixed(5)));
    });
  }, [leafletReady]);

  // Update Markers and Hotspots
  useEffect(() => {
    if (!leafletReady || !leafletMap.current || !markersGroup.current) return;
    const L = window.L;

    // Clear old layers
    markersGroup.current.clearLayers();
    hotspotCirclesGroup.current.clearLayers();

    const sevOpt = SEVERITY_OPTIONS.find((s) => s.id === sevFilter)!;

    // 1. Filter pins
    const filteredPins = pins.filter((p) => {
      const matchSev = p.rhi >= sevOpt.min && p.rhi <= sevOpt.max;
      const matchClass = classFilter === "all" || p.dominantClass === classFilter;
      return matchSev && matchClass;
    });

    // 2. Render Damage Markers
    filteredPins.forEach((pin) => {
      const color = CLASS_COLORS[pin.dominantClass] || "#dc2626";
      const iconHtml = `
        <div style="position:relative;display:flex;align-items:center;justify-content:center;width:34px;height:34px;cursor:pointer;">
          <div style="position:absolute;inset:0;background:${color}25;border-radius:50%;animation:ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="position:relative;width:28px;height:28px;background:${color};border:2.5px solid #ffffff;border-radius:50%;box-shadow:0 3px 8px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;color:#ffffff;font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:800;letter-spacing:-0.5px;">
            ${pin.dominantClass}
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        className: "custom-pin-marker",
        html: iconHtml,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });

      const marker = L.marker([pin.lat, pin.lng], { icon: customIcon })
        .addTo(markersGroup.current)
        .on("click", () => setSelectedPin(pin));

      marker.bindTooltip(
        `<div style="font-family:'Plus Jakarta Sans',sans-serif;padding:3px 2px;">
          <div style="font-weight:700;font-size:12px;color:#0f172a;">${pin.road}</div>
          <div style="font-size:11px;color:#64748b;">${pin.city} · Dominant: <b style="color:${color}">${pin.dominantClass}</b></div>
          <div style="font-size:10px;font-family:monospace;margin-top:2px;">RHI: ${pin.rhi}/100 · ${pin.detectionCount} Defects</div>
        </div>`,
        { direction: "top", offset: [0, -14], opacity: 0.96 }
      );
    });

    // 3. Render High-Concentration Hotspot Circles
    if (showHotspots && hotspotCirclesGroup.current) {
      CONCENTRATION_HOTSPOTS.forEach((h) => {
        const hColor = CLASS_COLORS[h.dominantClass] || "#dc2626";
        const circle = L.circle([h.lat, h.lng], {
          radius: h.radiusMeters,
          color: hColor,
          fillColor: hColor,
          fillOpacity: 0.16,
          weight: 2,
          dashArray: "4, 6",
        }).addTo(hotspotCirclesGroup.current);

        circle.bindTooltip(
          `<div style="padding:3px;">
            <div style="font-weight:800;color:#dc2626;font-size:12px;">⚠️ High Damage Concentration</div>
            <div style="font-weight:600;font-size:11px;">${h.name}</div>
            <div style="font-size:10px;color:#64748b;">${h.incidentCount} reported defects · Avg RHI ${h.avgRhi}</div>
          </div>`,
          { direction: "center", permanent: false }
        );
      });
    }
  }, [leafletReady, pins, sevFilter, classFilter, showHotspots]);

  // Jump to location helper
  const flyTo = (lat: number, lng: number, zoom: number = 14) => {
    if (leafletMap.current) {
      leafletMap.current.flyTo([lat, lng], zoom, { duration: 1.2 });
    }
  };

  // Associate uploaded road image with GPS coordinates and pin
  const handleGeoTagSubmit = async () => {
    setIsProcessingGeotag(true);
    try {
      let blob: Blob;
      if (geotagImage) {
        blob = geotagImage;
      } else {
        const res = await fetch(geotagPreview);
        blob = await res.blob();
      }

      // Run inference
      const result = await runInference(blob, "ensemble", 0.1821);
      const total = result.detections.length;
      const d00 = result.detections.filter((d) => d.code === "D00").length;
      const d10 = result.detections.filter((d) => d.code === "D10").length;
      const d20 = result.detections.filter((d) => d.code === "D20").length;
      const d40 = result.detections.filter((d) => d.code === "D40").length;

      // Determine dominant class
      const counts: Record<DamageCode, number> = { D00: d00, D10: d10, D20: d20, D40: d40 };
      const dominant = (Object.keys(counts) as DamageCode[]).reduce((a, b) =>
        counts[a] >= counts[b] ? a : b
      );

      // Compute RHI
      let penalty = 0;
      for (const d of result.detections) {
        const area = (d.x2 - d.x1) * (d.y2 - d.y1);
        const weight = d.code === "D40" ? 4 : d.code === "D20" ? 3 : 2;
        penalty += weight * area * d.confidence * 100;
      }
      const rhi = Math.max(10, Math.min(100, Math.round(100 - penalty)));

      const newPin: InspectionPin = {
        id: `pin-${Date.now()}`,
        inspectionId: `INS-${Math.floor(100 + Math.random() * 900)}`,
        lat: geotagLat,
        lng: geotagLng,
        city: geotagCity || "Municipal Survey",
        country: "Regional Roadway",
        road: geotagRoad || "Inspected Section",
        date: "24 Nov 2026",
        rhi,
        dominantClass: dominant,
        detectionCount: Math.max(1, total),
        d00Count: d00,
        d10Count: d10,
        d20Count: d20,
        d40Count: d40,
        imageUrl: geotagPreview,
        status: rhi < 40 ? "Pending Repair" : "Completed",
      };

      const updated = saveStoredPin(newPin);
      setPins(updated);
      setSelectedPin(newPin);
      setShowGeotagModal(false);
      flyTo(geotagLat, geotagLng, 15);

      // Persist in inspection history
      persistInspectionRecord({
        image_id: geotagRoad.replace(/\s+/g, "_") + ".jpg",
        latency_ms: result.latencyMs,
        detections: result.detections,
        rhi,
        thumbnail_url: geotagPreview,
        location_name: `${geotagRoad} (${geotagCity})`,
        source_mode: "gis_geotag",
      });
    } catch {
      alert("Error processing geotagged image inference.");
    } finally {
      setIsProcessingGeotag(false);
    }
  };

  // Browser Geolocation
  const requestCurrentLocation = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGeotagLat(parseFloat(pos.coords.latitude.toFixed(5)));
          setGeotagLng(parseFloat(pos.coords.longitude.toFixed(5)));
          flyTo(pos.coords.latitude, pos.coords.longitude, 15);
        },
        () => alert("Unable to acquire GPS coordinates.")
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Top GIS Action Toolbar ── */}
      <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4 lg:flex-row lg:items-center lg:justify-between shadow-sm">
        {/* Left: Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Damage Type Filter */}
          <div className="flex items-center gap-1.5 rounded-lg border border-line bg-canvas px-2.5 py-1 text-xs">
            <Filter size={13} className="text-primary" />
            <span className="font-semibold text-muted">Defect:</span>
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value as ClassFilter)}
              className="bg-transparent font-medium text-ink outline-none cursor-pointer"
            >
              <option value="all">All Damage Types</option>
              <option value="D40">D40 Pothole</option>
              <option value="D20">D20 Alligator Crack</option>
              <option value="D10">D10 Transverse Crack</option>
              <option value="D00">D00 Longitudinal Crack</option>
            </select>
          </div>

          {/* Severity Filter */}
          <div className="flex items-center gap-1.5 rounded-lg border border-line bg-canvas px-2.5 py-1 text-xs">
            <span className="font-semibold text-muted">RHI:</span>
            <select
              value={sevFilter}
              onChange={(e) => setSevFilter(e.target.value as SeverityFilter)}
              className="bg-transparent font-medium text-ink outline-none cursor-pointer"
            >
              {SEVERITY_OPTIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {/* Toggle High Concentration Hotspots */}
          <button
            onClick={() => setShowHotspots(!showHotspots)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-semibold transition-all ${
              showHotspots
                ? "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400"
                : "border-line bg-canvas text-muted hover:text-ink"
            }`}
          >
            <AlertTriangle size={13} />
            Concentration Zones ({CONCENTRATION_HOTSPOTS.length})
          </button>
        </div>

        {/* Right: City Quick Jump & Geo-tag Button */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 text-xs font-mono text-muted">
            <Navigation size={13} className="text-primary" />
            <span>Jump to:</span>
            <button
              onClick={() => flyTo(12.2958, 76.6394, 13)}
              className="rounded px-2 py-0.5 hover:bg-canvas text-ink hover:text-primary font-bold"
            >
              Mysuru
            </button>
            <span>·</span>
            <button
              onClick={() => flyTo(35.6895, 139.6917, 12)}
              className="rounded px-2 py-0.5 hover:bg-canvas text-ink hover:text-primary font-bold"
            >
              Tokyo
            </button>
            <span>·</span>
            <button
              onClick={() => flyTo(50.0755, 14.4378, 12)}
              className="rounded px-2 py-0.5 hover:bg-canvas text-ink hover:text-primary font-bold"
            >
              Prague
            </button>
          </div>

          {/* Associate uploaded road image with GPS coordinates */}
          <button
            onClick={() => setShowGeotagModal(true)}
            className="btn btn-primary text-xs flex items-center gap-1.5 shadow-sm"
          >
            <Plus size={14} />
            <span>Geo-Tag Road Image</span>
          </button>
        </div>
      </div>

      {/* ── Main Map Viewport & Details Drawer ── */}
      <div className="relative grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Leaflet Map Frame */}
        <div className="relative min-h-[580px] w-full overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
          <div ref={mapRef} className="h-full w-full min-h-[580px]" />

          {/* Interactive Map Legend Overlay */}
          <div className="absolute bottom-4 left-4 z-10 hidden sm:flex flex-col gap-1.5 rounded-xl border border-line bg-surface/90 p-3 shadow-lg backdrop-blur-md text-[11px] font-mono">
            <div className="font-bold text-ink text-xs mb-0.5">Marker Class Legend</div>
            {(["D40", "D20", "D10", "D00"] as DamageCode[]).map((code) => (
              <div key={code} className="flex items-center gap-2">
                <span
                  className="size-3 rounded-full border border-white shadow-xs"
                  style={{ backgroundColor: CLASS_COLORS[code] }}
                />
                <span className="font-bold text-ink">{code}</span>
                <span className="font-sans text-muted">{DAMAGE_CLASSES[code].label}</span>
              </div>
            ))}
            {showHotspots && (
              <div className="flex items-center gap-2 pt-1 border-t border-line text-red-600">
                <span className="size-3 rounded-full border border-red-500 border-dashed bg-red-500/30" />
                <span className="font-sans">High Concentration Cluster</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Selected Inspection Pin Details & Hotspots List */}
        <div className="space-y-4">
          {/* Selected Pin Details Card */}
          {selectedPin ? (
            <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm space-y-4 animate-in fade-in">
              <div className="flex items-start justify-between">
                <div>
                  <span className="font-mono text-xs font-bold text-primary">
                    {selectedPin.inspectionId}
                  </span>
                  <h3 className="text-base font-bold text-ink mt-0.5">{selectedPin.road}</h3>
                  <p className="text-xs text-muted">
                    {selectedPin.city}, {selectedPin.country}
                  </p>
                </div>
                <span
                  className="rounded-full px-2.5 py-0.5 font-mono text-xs font-bold"
                  style={{
                    backgroundColor: `${rhiLabel(selectedPin.rhi).color}18`,
                    color: rhiLabel(selectedPin.rhi).color,
                  }}
                >
                  {rhiLabel(selectedPin.rhi).label}
                </span>
              </div>

              {/* Road Image Thumbnail */}
              <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-line bg-canvas">
                <img
                  src={selectedPin.imageUrl}
                  alt={selectedPin.road}
                  className="h-full w-full object-cover"
                />
                <div className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 font-mono text-[10px] text-white backdrop-blur-sm">
                  {selectedPin.lat.toFixed(4)}, {selectedPin.lng.toFixed(4)}
                </div>
              </div>

              {/* RHI Meter */}
              <div className="rounded-xl border border-line bg-canvas p-3 space-y-1.5">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-muted">Road Health Index</span>
                  <span className="font-bold text-ink">{selectedPin.rhi} / 100</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-line/60">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${selectedPin.rhi}%`,
                      backgroundColor: rhiLabel(selectedPin.rhi).color,
                    }}
                  />
                </div>
              </div>

              {/* Damage Breakdown */}
              <div className="space-y-2 border-t border-line pt-3 text-xs font-mono">
                <div className="flex items-center justify-between text-muted text-[11px] font-bold uppercase tracking-wider">
                  <span>Detected Classes</span>
                  <span>{selectedPin.detectionCount} Total</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center justify-between rounded-lg border border-line bg-surface p-2">
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-[#dc2626]" />
                      <span className="text-muted">D40 Pothole</span>
                    </span>
                    <span className="font-bold text-ink">{selectedPin.d40Count}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-line bg-surface p-2">
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-[#7c3aed]" />
                      <span className="text-muted">D20 Alligator</span>
                    </span>
                    <span className="font-bold text-ink">{selectedPin.d20Count}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-line bg-surface p-2">
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-[#d97706]" />
                      <span className="text-muted">D10 Transverse</span>
                    </span>
                    <span className="font-bold text-ink">{selectedPin.d10Count}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-line bg-surface p-2">
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-[#0891b2]" />
                      <span className="text-muted">D00 Longit.</span>
                    </span>
                    <span className="font-bold text-ink">{selectedPin.d00Count}</span>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between border-t border-line text-xs font-mono text-muted">
                <span>Survey Date:</span>
                <span className="font-bold text-ink">{selectedPin.date}</span>
              </div>

              <Link
                to="/predictions?mode=single"
                className="w-full btn btn-primary text-xs flex items-center justify-center gap-1.5"
              >
                <ExternalLink size={14} />
                <span>Open in Prediction Engine</span>
              </Link>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-line bg-surface/60 p-8 text-center text-muted">
              <Crosshair size={28} className="mx-auto text-primary/60 mb-2" />
              <p className="text-xs font-semibold text-ink">Click Any Marker on Map</p>
              <p className="text-[11px] mt-1">
                Select any geo-tagged marker to view detailed road imagery, damage classification, and RHI scores.
              </p>
            </div>
          )}

          {/* High Concentration Hotspot Corridor List */}
          <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
                <AlertTriangle size={13} className="text-red-500" />
                Damage Hotspots ({CONCENTRATION_HOTSPOTS.length})
              </span>
              <span className="text-[10px] font-mono text-muted">Clusters</span>
            </div>

            <div className="space-y-2">
              {CONCENTRATION_HOTSPOTS.map((h) => (
                <div
                  key={h.id}
                  onClick={() => flyTo(h.lat, h.lng, 15)}
                  className="cursor-pointer rounded-xl border border-line bg-canvas/60 p-2.5 text-xs hover:border-red-500/40 hover:bg-red-500/5 transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-bold text-ink">{h.name}</p>
                      <p className="text-[11px] text-muted">{h.corridor}</p>
                    </div>
                    <span className="rounded bg-red-100 text-red-700 px-1.5 py-0.5 font-mono text-[10px] font-bold">
                      {h.incidentCount} defects
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] font-mono text-muted">
                    <span>Avg RHI: <b className="text-ink">{h.avgRhi}</b></span>
                    <span className="text-primary font-semibold flex items-center gap-0.5">
                      Focus Map <Crosshair size={11} />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Geo-Tag Upload Modal: Associate Road Image with GPS Coordinates ── */}
      {showGeotagModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl rounded-2xl border border-line bg-surface p-6 shadow-2xl space-y-5 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <MapPinned size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-ink">Associate Road Image with GPS</h3>
                  <p className="text-xs text-muted">Geo-tag survey imagery onto the GIS damage map</p>
                </div>
              </div>
              <button
                onClick={() => setShowGeotagModal(false)}
                className="btn btn-ghost text-xs p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Image Selection */}
              <div>
                <label className="text-xs font-bold text-ink block mb-1.5">
                  1. Select Road Image (Upload or Pick Sample)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        const file = e.target.files[0];
                        setGeotagImage(file);
                        setGeotagPreview(URL.createObjectURL(file));
                      }
                    }}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="btn btn-ghost border border-line text-xs flex items-center gap-1.5"
                  >
                    <Upload size={14} /> Upload Custom Photo
                  </button>

                  <div className="flex items-center gap-1.5 overflow-x-auto">
                    {SAMPLE_PHOTOS.slice(0, 3).map((s) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          setGeotagImage(null);
                          setGeotagPreview(s.url);
                          setGeotagRoad(s.label);
                        }}
                        className={`rounded border px-2 py-1 text-[11px] font-mono ${
                          geotagPreview === s.url
                            ? "border-primary bg-primary-soft text-primary font-bold"
                            : "border-line bg-canvas text-muted hover:text-ink"
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Selected Preview Thumbnail */}
                <div className="mt-2.5 h-28 w-full overflow-hidden rounded-xl border border-line bg-canvas">
                  <img src={geotagPreview} alt="Selected preview" className="h-full w-full object-cover" />
                </div>
              </div>

              {/* Road & Location Name */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-ink block mb-1">Road / Corridor Name</label>
                  <input
                    type="text"
                    value={geotagRoad}
                    onChange={(e) => setGeotagRoad(e.target.value)}
                    placeholder="e.g. NH-275 Highway Bypass"
                    className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-xs font-medium text-ink outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-ink block mb-1">City / Municipality</label>
                  <input
                    type="text"
                    value={geotagCity}
                    onChange={(e) => setGeotagCity(e.target.value)}
                    placeholder="e.g. Mysuru"
                    className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-xs font-medium text-ink outline-none focus:border-primary"
                  />
                </div>
              </div>

              {/* GPS Coordinates */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-ink">2. GPS Coordinates (Latitude, Longitude)</label>
                  <button
                    onClick={requestCurrentLocation}
                    className="text-[11px] font-mono text-primary hover:underline flex items-center gap-1"
                  >
                    <Crosshair size={12} /> Use My GPS
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="number"
                    step="0.0001"
                    value={geotagLat}
                    onChange={(e) => setGeotagLat(parseFloat(e.target.value))}
                    className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-xs font-mono text-ink outline-none focus:border-primary"
                  />
                  <input
                    type="number"
                    step="0.0001"
                    value={geotagLng}
                    onChange={(e) => setGeotagLng(parseFloat(e.target.value))}
                    className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-xs font-mono text-ink outline-none focus:border-primary"
                  />
                </div>
                <p className="mt-1 text-[11px] text-muted">
                  Tip: You can also click anywhere on the background map to automatically populate coordinates.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
              <button
                onClick={() => setShowGeotagModal(false)}
                className="btn btn-ghost text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleGeoTagSubmit}
                disabled={isProcessingGeotag}
                className="btn btn-primary text-xs flex items-center gap-1.5"
              >
                {isProcessingGeotag ? (
                  <>Running AI Detection...</>
                ) : (
                  <>
                    <Check size={14} /> Associate & Pin to Map
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
