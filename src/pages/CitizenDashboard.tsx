import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Camera, ChevronDown, Clock3, MapPin, Sparkles, Video } from "lucide-react";
import PageHeader from "../components/PageHeader";
import { ClassChips, SeverityBadge, StatusPill, StatusStepper, fmtDate, timeAgo } from "../components/ComplaintBits";
import { HQS, useComplaints, type Complaint } from "../lib/complaints";
import { useSession } from "../lib/auth";
import { SEVERITY_ACTION } from "../lib/knowledge";

function ComplaintCard({ c }: { c: Complaint }) {
  const [open, setOpen] = useState(false);
  const hq = HQS.find((h) => h.id === c.hqId);
  const last = c.updates[c.updates.length - 1];

  return (
    <article className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="grid sm:grid-cols-[200px_1fr]">
        <div className="relative aspect-video bg-canvas sm:aspect-auto">
          <img src={c.thumb} alt={`Road at ${c.road}`} className="h-full w-full object-cover" />
          {c.mediaKind === "video" && (
            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-sm bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-white">
              <Video size={11} aria-hidden /> clip
            </span>
          )}
        </div>

        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-xs font-bold text-primary">{c.id}</p>
              <h3 className="mt-0.5 flex items-center gap-1.5 text-base font-bold text-ink">
                <MapPin size={15} strokeWidth={1.5} className="shrink-0 text-muted" aria-hidden />
                <span className="truncate">{c.road}</span>
              </h3>
              <p className="mt-0.5 text-xs text-muted">
                Filed {timeAgo(c.createdAt)} · sent to {hq?.name ?? "nearest headquarters"} ({c.distanceKm} km away)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <SeverityBadge severity={c.report.severity} />
              <StatusPill status={c.status} />
            </div>
          </div>

          <StatusStepper status={c.status} />

          <p className="text-sm text-body">
            <span className="font-semibold text-ink">Latest: </span>
            {last.note} <span className="text-muted">({timeAgo(last.at)})</span>
          </p>

          <button
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            aria-expanded={open}
          >
            {open ? "Hide details" : "What the model found and all updates"}
            <ChevronDown size={14} className={open ? "rotate-180" : ""} aria-hidden />
          </button>
        </div>
      </div>

      {open && (
        <div className="grid gap-6 border-t border-line bg-canvas/50 p-5 md:grid-cols-2">
          <div className="space-y-3 text-sm">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted">Model findings</h4>
            <div className="flex items-center gap-3">
              <span className="font-mono text-3xl font-extrabold text-ink">{c.report.rhi}</span>
              <span className="text-xs text-muted">Road Health Index<br />out of 100</span>
            </div>
            <ClassChips counts={c.report.counts} />
            <p className="text-body">
              <span className="font-semibold text-ink">Target: </span>
              {SEVERITY_ACTION[c.report.severity]}
            </p>
            {c.comment && (
              <p className="border-l-2 border-line pl-3 text-muted">
                <span className="font-semibold text-ink">Your note: </span>
                {c.comment}
              </p>
            )}
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted">Updates</h4>
            <ol className="mt-3 space-y-3 border-l border-line pl-4">
              {[...c.updates].reverse().map((u, i) => (
                <li key={i} className="relative text-sm">
                  <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-primary" aria-hidden />
                  <p className="font-semibold text-ink">
                    {u.status} <span className="font-mono text-[11px] font-normal text-muted">· {fmtDate(u.at)}</span>
                  </p>
                  <p className="text-muted">{u.note}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </article>
  );
}

export default function CitizenDashboard() {
  const session = useSession();
  const all = useComplaints();
  const mine = useMemo(
    () =>
      all
        .filter((c) => !session || c.citizenId === session.id || session.role === "citizen")
        .sort((a, b) => b.createdAt - a.createdAt),
    [all, session],
  );
  const resolved = mine.filter((c) => c.status === "Resolved").length;
  const pending = mine.filter((c) => c.status === "Submitted").length;
  const reviewing = mine.filter((c) => c.status === "Verified" || c.status === "Assigned" || c.status === "In Progress").length;
  const recentUpdates = mine.flatMap((c) => c.updates.map((u) => ({ ...u, complaint: c }))).sort((a, b) => b.at - a.at).slice(0, 4);

  return (
    <div className="space-y-8 pb-16">
      <PageHeader
        title="Your road reports"
        description="Report road damage, then follow each update from receipt to repair."
        actions={
          <Link to="/citizen/new" className="btn btn-primary">
            <Camera size={16} strokeWidth={1.5} aria-hidden /> Report road damage
          </Link>
        }
      />

      {mine.length > 0 && (
        <>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { k: "Total reports", v: mine.length },
            { k: "Pending", v: pending },
            { k: "Under review", v: reviewing },
            { k: "Resolved", v: resolved },
          ].map(({ k, v }) => (
            <div key={k} className="rounded-lg border border-line bg-surface p-4">
              <dt className="text-xs font-medium text-muted">{k}</dt>
              <dd className="mt-1 font-mono text-2xl font-bold text-ink">{v}</dd>
            </div>
          ))}
        </dl>
        {recentUpdates.length > 0 && <section className="rounded-lg border border-line bg-surface p-5"><div className="flex items-center gap-2"><Clock3 size={16} className="text-primary" /><h2 className="font-bold text-ink">Recent updates</h2></div><ol className="mt-4 divide-y divide-line">{recentUpdates.map((u, i) => <li key={`${u.complaint.id}-${i}`} className="py-3 first:pt-0"><div className="flex justify-between gap-3"><p className="text-sm font-semibold text-ink">{u.complaint.id} · {u.status}</p><span className="shrink-0 text-xs text-muted">{timeAgo(u.at)}</span></div><p className="mt-1 text-sm text-muted">{u.note}</p></li>)}</ol></section>}
        </>
      )}

      {mine.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-line bg-surface px-6 py-16 text-center">
          <span className="flex size-14 items-center justify-center rounded-lg border border-line bg-canvas text-primary">
            <Camera size={24} strokeWidth={1.5} aria-hidden />
          </span>
          <div>
            <h2 className="text-base font-bold text-ink">No complaints yet</h2>
            <p className="mt-1 max-w-sm text-sm text-muted">
              Take a photo of damaged road. You can review the AI's initial assessment before sending your complaint.
            </p>
          </div>
          <Link to="/citizen/new" className="btn btn-primary">Report road damage</Link>
        </div>
      ) : (
        <div className="space-y-5"><div className="flex items-center gap-2"><Sparkles size={16} className="text-primary" /><h2 className="font-bold text-ink">Complaint history</h2></div>
          {mine.map((c) => (
            <ComplaintCard key={c.id} c={c} />
          ))}
        </div>
      )}
    </div>
  );
}
