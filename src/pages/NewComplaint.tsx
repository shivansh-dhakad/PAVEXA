import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Camera, CheckCircle2, Crosshair, Loader2, MapPin, ShieldCheck, Video } from "lucide-react";
import PageHeader from "../components/PageHeader";
import { ClassChips, SeverityBadge } from "../components/ComplaintBits";
import { addComplaint, fileComplaint, routeByJurisdiction, type Complaint } from "../lib/complaints";
import { useSession } from "../lib/auth";
import { analyzeMedia, MAX_VIDEO_SECONDS, type Analysis } from "../lib/vision";
import { SEVERITY_ACTION } from "../lib/knowledge";
import { extractMediaCoordinates, reverseGeocode } from "../lib/geoExtractor";

type Phase = "form" | "analyzing" | "review" | "clear" | "filed" | "error";
type Coords = { lat: number; lng: number; acc?: number };

const DEMO_SPOTS = [
  { label: "NH-275 Bypass, Mysuru", lat: 12.2958, lng: 76.6394 },
  { label: "Hunsur Road, Mysuru", lat: 12.3051, lng: 76.6551 },
  { label: "Bannimantap, Mysuru", lat: 12.2817, lng: 76.6462 },
];

export default function NewComplaint() {
  const session = useSession();
  const [phase, setPhase] = useState<Phase>("form");
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<"image" | "video">("image");
  const [preview, setPreview] = useState<string | null>(null);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [geoSource, setGeoSource] = useState<"extracted" | "manual" | "none">("none");
  const [showManualLoc, setShowManualLoc] = useState(false);
  const [extractingGps, setExtractingGps] = useState(false);
  const [locState, setLocState] = useState<"idle" | "locating" | "ok" | "error">("idle");
  const [road, setRoad] = useState("");
  const [comment, setComment] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [filed, setFiled] = useState<Complaint | null>(null);
  const roadEdited = useRef(false);
  const photoRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const pick = async (f: File | undefined, k: "image" | "video") => {
    if (!f) return;
    if (k === "image" && !["image/jpeg", "image/png", "image/webp"].includes(f.type)) return setMsg("Use a JPG, PNG or WEBP photo.");
    if (k === "image" && f.size > 15 * 1024 * 1024) return setMsg("The photo is over 15 MB.");
    if (k === "video" && !f.type.startsWith("video/")) return setMsg("Choose a video file.");
    if (k === "video" && f.size > 100 * 1024 * 1024) return setMsg("The video is over 100 MB.");
    setMsg(null);
    setFile(f);
    setKind(k);
    setPreview(URL.createObjectURL(f));

    // Automatically attempt GPS extraction from file metadata
    setExtractingGps(true);
    try {
      const geo = await extractMediaCoordinates(f);
      if (geo) {
        setCoords({ lat: geo.latitude, lng: geo.longitude });
        setGeoSource("extracted");
        setShowManualLoc(false);
        setLocState("ok");
        const placeName = await reverseGeocode(geo.latitude, geo.longitude);
        if (!roadEdited.current) {
          setRoad(placeName);
        }
      } else {
        setGeoSource("none");
        setShowManualLoc(true);
        if (geoSource === "extracted") {
          setCoords(null);
          setLocState("idle");
        }
      }
    } catch {
      setGeoSource("none");
      setShowManualLoc(true);
    } finally {
      setExtractingGps(false);
    }
  };

  const locate = () => {
    if (!("geolocation" in navigator)) return setLocState("error");
    setLocState("locating");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        setCoords({ lat, lng, acc: accuracy });
        setGeoSource("manual");
        setLocState("ok");
        if (!roadEdited.current) {
          const name = await reverseGeocode(lat, lng);
          if (!roadEdited.current) setRoad(name);
        }
      },
      () => setLocState("error"),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  };

  const useSpot = (s: (typeof DEMO_SPOTS)[number]) => {
    setCoords({ lat: s.lat, lng: s.lng });
    setGeoSource("manual");
    setLocState("ok");
    setRoad(s.label);
    roadEdited.current = true;
  };

  const analyze = async () => {
    if (!file || !coords) {
      setMsg("Please provide both media and location.");
      return;
    }
    setPhase("analyzing");
    setMsg(null);
    try {
      const a = await analyzeMedia(file, kind);
      setAnalysis(a);
      if (a.detections.length === 0) {
        setPhase("clear");
        return;
      }
      setPhase("review");
    } catch (e) {
      setMsg((e as Error).message || "Something went wrong while checking the road.");
      setPhase("error");
    }
  };

  const submit = async () => {
    if (!file || !coords || !analysis) return;
    try {
      const c = fileComplaint({
        citizenId: session?.id ?? "demo-citizen-01",
        citizenName: session?.name ?? "Priya Sharma",
        mediaKind: kind,
        thumb: analysis.thumb,
        originalThumb: analysis.originalThumb,
        comment,
        lat: coords.lat,
        lng: coords.lng,
        road: road || `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`,
        detections: analysis.detections,
        rhi: analysis.rhi,
        latencyMs: analysis.latencyMs,
        simulated: analysis.simulated,
        frames: analysis.frames,
      });
      await addComplaint(c);
      setFiled(c);
      setPhase("filed");
    } catch (e) {
      setMsg((e as Error).message || "Something went wrong while checking the road.");
      setPhase("error");
    }
  };

  const again = () => {
    setPhase("form");
    setFile(null);
    setPreview(null);
    setAnalysis(null);
    setFiled(null);
    setComment("");
    setMsg(null);
  };

  const near = coords ? routeByJurisdiction(coords.lat, coords.lng) : null;

  // ── Result screens ─────────────────────────────────────────────────────────
  if (phase === "clear" && analysis) {
    return (
      <div className="mx-auto max-w-xl space-y-6 pb-16">
        <div className="rounded-lg border border-line bg-surface p-8 text-center">
          <CheckCircle2 size={36} strokeWidth={1.5} className="mx-auto text-green-600" aria-hidden />
          <h1 className="mt-4 text-xl font-extrabold text-ink">This road looks fine</h1>
          <p className="mt-2 text-sm text-muted">
            The model found no damage above its confidence threshold (road health {analysis.rhi}/100), so no complaint was registered.
            If you can see damage, try a closer photo in good light.
          </p>
          {analysis.simulated && <SimulatedNote />}
          <img src={analysis.thumb} alt="Checked road" className="mt-5 w-full rounded-lg border border-line object-cover" />
          <div className="mt-6 flex justify-center gap-3">
            <button onClick={again} className="btn btn-primary">Try another photo</button>
            <Link to="/citizen" className="btn btn-ghost">My complaints</Link>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "filed" && filed) {
    return (
      <div className="mx-auto max-w-xl space-y-6 pb-16">
        <div className="rounded-lg border border-line bg-surface p-8">
          <div className="text-center">
            <ShieldCheck size={36} strokeWidth={1.5} className="mx-auto text-primary" aria-hidden />
            <h1 className="mt-4 text-xl font-extrabold text-ink">Complaint registered</h1>
            <p className="mt-1 font-mono text-sm font-bold text-primary">{filed.id}</p>
          </div>
          <img src={filed.thumb} alt="Annotated road" className="mt-5 w-full rounded-lg border border-line object-cover" />
          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted">Model rating</dt>
              <dd className="flex items-center gap-2"><SeverityBadge severity={filed.report.severity} /><span className="font-mono font-bold text-ink">{filed.report.rhi}/100</span></dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted">Damage found</dt>
              <dd><ClassChips counts={filed.report.counts} /></dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted">Sent to</dt>
              <dd className="text-right font-semibold text-ink">{near?.hq.name} <span className="font-normal text-muted">({filed.distanceKm} km)</span></dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="text-muted">Target</dt>
              <dd className="text-right text-body">{SEVERITY_ACTION[filed.report.severity]}</dd>
            </div>
          </dl>
          {filed.report.simulated && <SimulatedNote />}
          <div className="mt-6 flex justify-center gap-3">
            <Link to="/citizen" className="btn btn-primary">Track this complaint</Link>
            <button onClick={again} className="btn btn-ghost">Report another</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  if (phase === "review" && analysis) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 pb-16">
        <PageHeader title="Review your report" description="Please check the AI's initial assessment before sending it to the road authority." />
        <section className="overflow-hidden rounded-lg border border-line bg-surface">
          <img src={analysis.thumb} alt="Road photo with detected damage marked" className="max-h-[460px] w-full object-contain bg-black" />
          <div className="space-y-5 p-6">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <b>AI initial assessment only.</b> This is not a confirmed municipal inspection. An administrator will review your report.
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-xs font-semibold uppercase tracking-wide text-muted">Damage detected</p><div className="mt-2"><ClassChips counts={analysis.detections.reduce((counts, d) => ({ ...counts, [d.code]: (counts[d.code] ?? 0) + 1 }), { D00: 0, D10: 0, D20: 0, D40: 0 })} /></div></div>
              <div className="text-right"><p className="text-xs text-muted">Road health estimate</p><p className="font-mono text-2xl font-bold text-ink">{analysis.rhi}/100</p></div>
            </div>
            <div className="rounded-lg bg-canvas p-4 text-sm"><p className="font-semibold text-ink">Report location</p><p className="mt-1 text-muted">{road || `${coords?.lat.toFixed(5)}, ${coords?.lng.toFixed(5)}`}</p></div>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button onClick={() => setPhase("form")} className="btn btn-ghost">Make changes</button><button onClick={submit} className="btn btn-primary">Submit complaint</button></div>
          </div>
        </section>
      </div>
    );
  }

  const busy = phase === "analyzing";
  const ready = !!file && !!coords && !busy;

  return (
    <div className="space-y-8 pb-16">
      <PageHeader
        title="Report road damage"
        description="Add a photo or short clip, share the location and say what you saw. The model checks the road first."
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {/* 1. Media */}
          <section className="rounded-lg border border-line bg-surface p-6">
            <h2 className="text-sm font-bold text-ink">1. Photo or short video</h2>
            <p className="mt-1 text-xs text-muted">Photo up to 15 MB, or a clip up to {MAX_VIDEO_SECONDS} seconds.</p>

            <input ref={photoRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { pick(e.target.files?.[0], "image"); e.target.value = ""; }} />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { pick(e.target.files?.[0], "image"); e.target.value = ""; }} />
            <input ref={videoRef} type="file" accept="video/*" className="hidden" onChange={(e) => { pick(e.target.files?.[0], "video"); e.target.value = ""; }} />

            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={() => photoRef.current?.click()} disabled={busy} className={`btn ${kind === "image" && file ? "btn-primary" : "btn-ghost"}`}>
                <Camera size={15} strokeWidth={1.5} aria-hidden /> Upload photo
              </button>
              <button onClick={() => cameraRef.current?.click()} disabled={busy} className="btn btn-ghost">
                <Camera size={15} strokeWidth={1.5} aria-hidden /> Use camera
              </button>
              <button onClick={() => videoRef.current?.click()} disabled={busy} className={`btn ${kind === "video" && file ? "btn-primary" : "btn-ghost"}`}>
                <Video size={15} strokeWidth={1.5} aria-hidden /> Choose a video
              </button>
            </div>

            {preview && (
              <div className="mt-4 overflow-hidden rounded-lg border border-line bg-black">
                {kind === "image" ? (
                  <img src={preview} alt="Selected road" className="max-h-80 w-full object-contain" />
                ) : (
                  <video src={preview} controls muted playsInline className="max-h-80 w-full" />
                )}
              </div>
            )}
          </section>

          {/* 2. Location */}
          <section className="rounded-lg border border-line bg-surface p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-ink">2. Location</h2>
              {geoSource === "extracted" && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 px-2.5 py-0.5 text-xs font-semibold">
                  <CheckCircle2 size={13} />
                  GPS extracted from {kind === "video" ? "video" : "photo"} EXIF
                </span>
              )}
            </div>

            {extractingGps && (
              <div className="flex items-center gap-2 rounded-lg border border-line bg-canvas p-3 text-xs text-muted">
                <Loader2 size={14} className="animate-spin text-primary" />
                <span>Scanning {kind} metadata for embedded GPS coordinates...</span>
              </div>
            )}

            {/* When GPS was automatically extracted from media: no manual input needed */}
            {geoSource === "extracted" && coords && !showManualLoc && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/50 dark:bg-emerald-950/20 p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <MapPin size={18} className="text-emerald-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                        GPS extracted directly from {kind}
                      </p>
                      <p className="font-mono text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
                        {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                      </p>
                      {road && (
                        <p className="text-xs text-ink font-semibold mt-1">
                          {road}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowManualLoc(true)}
                    className="text-[11px] font-semibold text-primary hover:underline shrink-0"
                  >
                    Change location
                  </button>
                </div>
              </div>
            )}

            {/* Prompt for location ONLY when no GPS found or user requested to override */}
            {(geoSource === "none" || showManualLoc) && (
              <div className="space-y-4">
                {file && geoSource === "none" && !extractingGps && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20 px-3.5 py-2.5 text-xs text-amber-900 dark:text-amber-200">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600" />
                    <span>No GPS metadata was found in this {kind}. Please provide your location below.</span>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={locate}
                    disabled={busy || locState === "locating"}
                    className="btn btn-ghost"
                  >
                    {locState === "locating" ? (
                      <Loader2 size={15} className="animate-spin" aria-hidden />
                    ) : (
                      <Crosshair size={15} strokeWidth={1.5} aria-hidden />
                    )}
                    Use my live location
                  </button>
                  {coords && (
                    <span className="font-mono text-xs text-body">
                      {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                      {coords.acc ? ` (±${Math.round(coords.acc)} m)` : ""}
                    </span>
                  )}
                </div>

                {locState === "error" && (
                  <p className="flex items-start gap-1.5 text-xs text-red-600">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
                    Location access is blocked or unavailable. Choose a corridor below or type the road name.
                  </p>
                )}

                <div>
                  <p className="text-xs text-muted">Or pick a known road corridor:</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {DEMO_SPOTS.map((s) => (
                      <button
                        key={s.label}
                        type="button"
                        onClick={() => useSpot(s)}
                        disabled={busy}
                        className="rounded-sm border border-line bg-canvas px-2.5 py-1 text-xs font-medium text-body transition-colors hover:border-primary hover:text-primary"
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-ink" htmlFor="road">
                Road or landmark
              </label>
              <input
                id="road"
                value={road}
                onChange={(e) => {
                  roadEdited.current = true;
                  setRoad(e.target.value);
                }}
                placeholder="Filled in automatically from location. You can edit it."
                className="mt-1.5 w-full rounded-sm border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-primary"
              />
            </div>

            {near && (
              <p className="rounded-sm bg-primary-soft px-3 py-2 text-xs text-primary">
                {near.matchedBoundary ? "Within the service area of " : "Outside a mapped service area; routed to "}<b>{near.hq.name}</b>.
              </p>
            )}
          </section>

          {/* 3. Comment */}
          <section className="rounded-lg border border-line bg-surface p-6">
            <h2 className="text-sm font-bold text-ink">3. Comment <span className="font-normal text-muted">(optional)</span></h2>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, 500))}
              rows={3}
              placeholder="What did you see? For example: how long it has been there, or if it is dangerous at night."
              className="mt-3 w-full rounded-sm border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-primary"
            />
            <p className="mt-1 text-right font-mono text-[11px] text-muted">{comment.length}/500</p>
          </section>

          {msg && <p className="flex items-start gap-1.5 text-sm text-red-600"><AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />{msg}</p>}

          <button onClick={analyze} disabled={!ready} className="btn btn-primary h-11 px-6 disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? (
              <><Loader2 size={16} className="animate-spin" aria-hidden /> Checking the road with the model…</>
            ) : (
              "Preview AI assessment"
            )}
          </button>
        </div>

        <aside className="h-fit space-y-4 rounded-lg border border-line bg-surface p-6 text-sm lg:sticky lg:top-24">
          <h2 className="text-sm font-bold text-ink">What happens next</h2>
          <ol className="space-y-4">
            {[
              ["The model checks your photo", "If the road is fine, no complaint is registered."],
              ["It goes to the nearest headquarters", "With the model's findings and your note."],
              ["You follow the progress", "From submitted to repaired, on My complaints."],
            ].map(([t, b], i) => (
              <li key={t} className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-line bg-canvas font-mono text-xs font-bold text-ink">{i + 1}</span>
                <div>
                  <p className="font-semibold text-ink">{t}</p>
                  <p className="text-xs text-muted">{b}</p>
                </div>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}

function SimulatedNote() {
  return (
    <p className="mt-4 rounded-sm border border-amber-300 bg-amber-50 px-3 py-2 text-left text-xs text-amber-900">
      The model backend was not reachable, so this result is simulated. Start the FastAPI service for real detections.
    </p>
  );
}
