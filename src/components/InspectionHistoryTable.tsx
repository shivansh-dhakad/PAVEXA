import { useEffect, useMemo, useState } from "react";
import {
  Search, Filter, Trash2, Eye, Download, GitCompare,
  CheckCircle2, Calendar, X
} from "lucide-react";
import {
  fetchDetailedInspectionHistory,
  deleteInspectionRecord,
  type InspectionRecord,
} from "../lib/database";
import { rhiLabel, type DamageCode } from "../lib/damage";

export default function InspectionHistoryTable() {
  const [records, setRecords] = useState<InspectionRecord[]>([]);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [classFilter, setClassFilter] = useState<"all" | DamageCode>("all");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "week" | "month">("all");

  // Selection for comparison
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [compareModalOpen, setCompareModalOpen] = useState(false);

  // Active result view modal
  const [viewingRecord, setViewingRecord] = useState<InspectionRecord | null>(null);

  // Load history
  const loadHistory = async () => {
    const data = await fetchDetailedInspectionHistory();
    setRecords(data);
  };

  useEffect(() => {
    loadHistory();
  }, []);

  // Filter records
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      // Search term
      const code = (r.inspection_code || `INS-${r.id}`).toLowerCase();
      const img = r.image_id.toLowerCase();
      const loc = (r.location_name || "").toLowerCase();
      const matchesSearch =
        searchTerm === "" ||
        code.includes(searchTerm.toLowerCase()) ||
        img.includes(searchTerm.toLowerCase()) ||
        loc.includes(searchTerm.toLowerCase());

      // Class filter
      let matchesClass = true;
      if (classFilter === "D40") matchesClass = r.d40_count > 0;
      else if (classFilter === "D20") matchesClass = r.d20_count > 0;
      else if (classFilter === "D10") matchesClass = r.d10_count > 0;
      else if (classFilter === "D00") matchesClass = r.d00_count > 0;

      // Date filter
      let matchesDate = true;
      if (dateFilter === "today") {
        const timeStr = r.timestamp || (r.created_at ? new Date(r.created_at).toLocaleDateString() : "");
        matchesDate = timeStr.toLowerCase().includes("today") || (r.date_formatted || "").includes("24 Nov");
      }

      return matchesSearch && matchesClass && matchesDate;
    });
  }, [records, searchTerm, classFilter, dateFilter]);

  // Handle selection for compare
  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((i) => i !== id);
      }
      if (prev.length >= 2) {
        return [prev[1], id]; // keep latest 2
      }
      return [...prev, id];
    });
  };

  // Delete an inspection
  const handleDelete = async (id: number, code: string) => {
    if (confirm(`Are you sure you want to delete inspection record ${code}?`)) {
      await deleteInspectionRecord(id);
      setRecords((prev) => prev.filter((r) => r.id !== id));
      setSelectedIds((prev) => prev.filter((i) => i !== id));
      if (viewingRecord?.id === id) setViewingRecord(null);
    }
  };

  // Re-download inspection CSV report
  const downloadReportCSV = (rec: InspectionRecord) => {
    const code = rec.inspection_code || `INS-${rec.id}`;
    const lines = [
      "PAVEXA Road Infrastructure - Inspection Record Export",
      `Inspection ID,${code}`,
      `Image File,${rec.image_id}`,
      `Date,${rec.date_formatted || rec.timestamp}`,
      `Location,${rec.location_name || "Regional Corridor"}`,
      `Status,${rec.status || "Completed"}`,
      `Road Health Index (RHI),${rec.rhi}/100`,
      `Inference Latency,${rec.latency_ms} ms`,
      `Total Detections,${rec.total_detections}`,
      `Potholes (D40),${rec.d40_count}`,
      `Alligator Cracks (D20),${rec.d20_count}`,
      `Transverse Cracks (D10),${rec.d10_count}`,
      `Longitudinal Cracks (D00),${rec.d00_count}`,
    ];

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `pavexa_report_${code}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Selected records for comparison
  const compareRecordA = records.find((r) => r.id === selectedIds[0]);
  const compareRecordB = records.find((r) => r.id === selectedIds[1]);

  return (
    <div className="space-y-6">
      {/* ── Search & Filter Controls ── */}
      <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between shadow-sm">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          {/* Search Box */}
          <div className="relative min-w-[240px] flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Search by ID, image, corridor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-line bg-canvas pl-9 pr-3 py-1.5 text-xs text-ink outline-none focus:border-primary"
            />
          </div>

          {/* Date Filter */}
          <div className="flex items-center gap-1.5 rounded-lg border border-line bg-canvas px-2.5 py-1 text-xs">
            <Calendar size={13} className="text-primary" />
            <span className="font-semibold text-muted">Date:</span>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as any)}
              className="bg-transparent font-medium text-ink outline-none cursor-pointer"
            >
              <option value="all">All Dates</option>
              <option value="today">Today (24 Nov)</option>
              <option value="week">Past 7 Days</option>
              <option value="month">Past 30 Days</option>
            </select>
          </div>

          {/* Damage Class Filter */}
          <div className="flex items-center gap-1.5 rounded-lg border border-line bg-canvas px-2.5 py-1 text-xs">
            <Filter size={13} className="text-primary" />
            <span className="font-semibold text-muted">Damage:</span>
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value as any)}
              className="bg-transparent font-medium text-ink outline-none cursor-pointer"
            >
              <option value="all">All Classes</option>
              <option value="D40">Contains Potholes (D40)</option>
              <option value="D20">Contains Alligator (D20)</option>
              <option value="D10">Contains Transverse (D10)</option>
              <option value="D00">Contains Longitudinal (D00)</option>
            </select>
          </div>
        </div>

        {/* Compare 2 Inspections Button */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCompareModalOpen(true)}
            disabled={selectedIds.length !== 2}
            className={`btn text-xs flex items-center gap-1.5 ${
              selectedIds.length === 2
                ? "btn-primary shadow-sm"
                : "btn-ghost border border-line text-muted opacity-50 cursor-not-allowed"
            }`}
          >
            <GitCompare size={14} />
            <span>Compare Two Inspections ({selectedIds.length}/2)</span>
          </button>
        </div>
      </div>

      {/* ── Table Container ── */}
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-line bg-canvas/60 text-[11px] font-mono font-bold uppercase tracking-wider text-muted">
                <th className="py-3 px-4 w-10 text-center">Select</th>
                <th className="py-3 px-4">Inspection ID</th>
                <th className="py-3 px-4">Image</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4 text-center">Detections</th>
                <th className="py-3 px-4 text-center">Potholes</th>
                <th className="py-3 px-4">Health (RHI)</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-xs">
              {filteredRecords.length > 0 ? (
                filteredRecords.map((r) => {
                  const isSelected = selectedIds.includes(r.id);
                  const code = r.inspection_code || `INS-${r.id}`;
                  const { color: rhiColor } = rhiLabel(r.rhi);

                  return (
                    <tr
                      key={r.id}
                      className={`transition-colors hover:bg-canvas/50 ${
                        isSelected ? "bg-primary-soft/30" : ""
                      }`}
                    >
                      {/* Checkbox for compare */}
                      <td className="py-3 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(r.id)}
                          className="size-4 rounded accent-primary cursor-pointer"
                          title="Select to compare (choose 2)"
                        />
                      </td>

                      {/* Inspection ID */}
                      <td className="py-3 px-4 font-mono font-bold text-primary">
                        {code}
                      </td>

                      {/* Image Thumbnail & Filename */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <img
                            src={r.thumbnail_url}
                            alt={r.image_id}
                            className="size-10 rounded-lg object-cover border border-line shrink-0"
                          />
                          <div>
                            <p className="font-mono font-semibold text-ink">{r.image_id}</p>
                            <p className="text-[11px] text-muted truncate max-w-[160px]">
                              {r.location_name || "Regional Roadway"}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Date */}
                      <td className="py-3 px-4 font-mono text-muted">
                        {r.date_formatted || r.timestamp}
                      </td>

                      {/* Total Detections */}
                      <td className="py-3 px-4 text-center font-mono font-bold text-ink">
                        {r.total_detections}
                      </td>

                      {/* Potholes (D40) */}
                      <td className="py-3 px-4 text-center">
                        {r.d40_count > 0 ? (
                          <span className="inline-flex items-center rounded-full bg-red-100 dark:bg-red-950/60 px-2.5 py-0.5 font-mono text-xs font-bold text-red-600">
                            {r.d40_count}
                          </span>
                        ) : (
                          <span className="font-mono text-muted">0</span>
                        )}
                      </td>

                      {/* RHI Meter */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span
                            className="font-mono font-bold text-xs"
                            style={{ color: rhiColor }}
                          >
                            {r.rhi}
                          </span>
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-line">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${r.rhi}%`, backgroundColor: rhiColor }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 px-2 py-0.5 text-[11px] font-semibold">
                          <CheckCircle2 size={12} />
                          {r.status || "Completed"}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Open Previous Results */}
                          <button
                            onClick={() => setViewingRecord(r)}
                            className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-ink transition-colors"
                            title="Open Previous Inspection Results"
                          >
                            <Eye size={15} />
                          </button>

                          {/* Re-download report */}
                          <button
                            onClick={() => downloadReportCSV(r)}
                            className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-primary transition-colors"
                            title="Re-download CSV Inspection Report"
                          >
                            <Download size={15} />
                          </button>

                          {/* Delete Record */}
                          <button
                            onClick={() => handleDelete(r.id, code)}
                            className="rounded-lg p-1.5 text-muted hover:bg-red-50 hover:text-red-600 transition-colors"
                            title="Delete Inspection Record"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-muted text-xs">
                    No inspection records found matching your query.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modal 1: Open Previous Inspection Result ── */}
      {viewingRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-line bg-surface p-6 shadow-2xl space-y-5 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <span className="font-mono text-xs font-bold text-primary">
                  {viewingRecord.inspection_code || `INS-${viewingRecord.id}`}
                </span>
                <h3 className="text-base font-bold text-ink">{viewingRecord.image_id}</h3>
                <p className="text-xs text-muted">{viewingRecord.location_name || "Regional Roadway"}</p>
              </div>
              <button
                onClick={() => setViewingRecord(null)}
                className="btn btn-ghost text-xs p-1"
              >
                <X size={16} />
              </button>
            </div>

            {/* Image Preview */}
            <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-line bg-black">
              <img
                src={viewingRecord.thumbnail_url}
                alt={viewingRecord.image_id}
                className="h-full w-full object-cover"
              />
              <div className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-0.5 font-mono text-[11px] text-white backdrop-blur-sm">
                Latency: {viewingRecord.latency_ms} ms · Status: {viewingRecord.status || "Completed"}
              </div>
            </div>

            {/* Metrics Breakdown Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
              <div className="rounded-xl border border-line bg-canvas p-3">
                <span className="text-muted text-[10px] uppercase">RHI Health</span>
                <p className="text-lg font-bold text-ink mt-0.5">{viewingRecord.rhi} / 100</p>
              </div>
              <div className="rounded-xl border border-line bg-canvas p-3">
                <span className="text-muted text-[10px] uppercase">Total Defects</span>
                <p className="text-lg font-bold text-ink mt-0.5">{viewingRecord.total_detections}</p>
              </div>
              <div className="rounded-xl border border-line bg-canvas p-3">
                <span className="text-muted text-[10px] uppercase">Potholes (D40)</span>
                <p className="text-lg font-bold text-red-600 mt-0.5">{viewingRecord.d40_count}</p>
              </div>
              <div className="rounded-xl border border-line bg-canvas p-3">
                <span className="text-muted text-[10px] uppercase">Cracks (D00-D20)</span>
                <p className="text-lg font-bold text-amber-600 mt-0.5">
                  {viewingRecord.d00_count + viewingRecord.d10_count + viewingRecord.d20_count}
                </p>
              </div>
            </div>

            {/* Damage Distribution Cards */}
            <div className="grid grid-cols-4 gap-2 text-xs font-mono">
              <div className="rounded-lg border border-line bg-surface p-2 text-center">
                <span className="text-muted text-[10px]">D00 Longit.</span>
                <p className="font-bold text-ink">{viewingRecord.d00_count}</p>
              </div>
              <div className="rounded-lg border border-line bg-surface p-2 text-center">
                <span className="text-muted text-[10px]">D10 Transv.</span>
                <p className="font-bold text-ink">{viewingRecord.d10_count}</p>
              </div>
              <div className="rounded-lg border border-line bg-surface p-2 text-center">
                <span className="text-muted text-[10px]">D20 Alligator</span>
                <p className="font-bold text-ink">{viewingRecord.d20_count}</p>
              </div>
              <div className="rounded-lg border border-line bg-surface p-2 text-center">
                <span className="text-muted text-[10px]">D40 Pothole</span>
                <p className="font-bold text-red-600">{viewingRecord.d40_count}</p>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-line pt-4">
              <span className="font-mono text-xs text-muted">
                Inspected: {viewingRecord.date_formatted || viewingRecord.timestamp}
              </span>
              <button
                onClick={() => downloadReportCSV(viewingRecord)}
                className="btn btn-primary text-xs flex items-center gap-1.5"
              >
                <Download size={14} /> Download Report CSV
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal 2: Compare Two Inspections ── */}
      {compareModalOpen && compareRecordA && compareRecordB && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-4xl rounded-2xl border border-line bg-surface p-6 shadow-2xl space-y-6 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <GitCompare size={20} className="text-primary" />
                <h3 className="text-base font-bold text-ink">Side-by-Side Inspection Comparison</h3>
              </div>
              <button
                onClick={() => setCompareModalOpen(false)}
                className="btn btn-ghost text-xs p-1"
              >
                <X size={16} />
              </button>
            </div>

            {/* Comparison Overview Cards */}
            <div className="grid grid-cols-3 gap-4 font-mono text-xs">
              <div className="rounded-xl border border-line bg-canvas p-4 text-center">
                <span className="text-muted text-[11px] uppercase">Delta Detections</span>
                <p className="text-2xl font-extrabold text-ink mt-1">
                  {compareRecordB.total_detections - compareRecordA.total_detections > 0
                    ? `+${compareRecordB.total_detections - compareRecordA.total_detections}`
                    : compareRecordB.total_detections - compareRecordA.total_detections}
                </p>
                <p className="text-[10px] text-muted mt-1">
                  {compareRecordA.total_detections} vs {compareRecordB.total_detections}
                </p>
              </div>

              <div className="rounded-xl border border-line bg-canvas p-4 text-center">
                <span className="text-muted text-[11px] uppercase">Delta Potholes</span>
                <p className="text-2xl font-extrabold text-red-600 mt-1">
                  {compareRecordB.d40_count - compareRecordA.d40_count > 0
                    ? `+${compareRecordB.d40_count - compareRecordA.d40_count}`
                    : compareRecordB.d40_count - compareRecordA.d40_count}
                </p>
                <p className="text-[10px] text-muted mt-1">
                  {compareRecordA.d40_count} vs {compareRecordB.d40_count}
                </p>
              </div>

              <div className="rounded-xl border border-line bg-canvas p-4 text-center">
                <span className="text-muted text-[11px] uppercase">Delta RHI Health</span>
                <p
                  className={`text-2xl font-extrabold mt-1 ${
                    compareRecordB.rhi - compareRecordA.rhi >= 0 ? "text-green-600" : "text-red-500"
                  }`}
                >
                  {compareRecordB.rhi - compareRecordA.rhi > 0
                    ? `+${compareRecordB.rhi - compareRecordA.rhi}`
                    : compareRecordB.rhi - compareRecordA.rhi}
                </p>
                <p className="text-[10px] text-muted mt-1">
                  {compareRecordA.rhi} vs {compareRecordB.rhi}
                </p>
              </div>
            </div>

            {/* Side-by-Side Columns */}
            <div className="grid gap-6 sm:grid-cols-2">
              {/* Inspection A */}
              <div className="rounded-xl border border-line bg-canvas p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-primary">
                    {compareRecordA.inspection_code || `INS-${compareRecordA.id}`} (Inspection A)
                  </span>
                  <span className="text-xs font-mono text-muted">{compareRecordA.date_formatted}</span>
                </div>
                <div className="aspect-video w-full overflow-hidden rounded-lg border border-line bg-black">
                  <img src={compareRecordA.thumbnail_url} alt="" className="h-full w-full object-cover" />
                </div>
                <p className="font-mono font-bold text-xs text-ink">{compareRecordA.image_id}</p>
                <div className="space-y-1 font-mono text-xs text-muted">
                  <div className="flex justify-between">
                    <span>Location:</span>
                    <span className="font-semibold text-ink">{compareRecordA.location_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Potholes (D40):</span>
                    <span className="font-bold text-red-600">{compareRecordA.d40_count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Alligator (D20):</span>
                    <span className="font-bold text-purple-600">{compareRecordA.d20_count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Transverse (D10):</span>
                    <span className="font-bold text-amber-600">{compareRecordA.d10_count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Longitudinal (D00):</span>
                    <span className="font-bold text-cyan-600">{compareRecordA.d00_count}</span>
                  </div>
                </div>
              </div>

              {/* Inspection B */}
              <div className="rounded-xl border border-line bg-canvas p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-primary">
                    {compareRecordB.inspection_code || `INS-${compareRecordB.id}`} (Inspection B)
                  </span>
                  <span className="text-xs font-mono text-muted">{compareRecordB.date_formatted}</span>
                </div>
                <div className="aspect-video w-full overflow-hidden rounded-lg border border-line bg-black">
                  <img src={compareRecordB.thumbnail_url} alt="" className="h-full w-full object-cover" />
                </div>
                <p className="font-mono font-bold text-xs text-ink">{compareRecordB.image_id}</p>
                <div className="space-y-1 font-mono text-xs text-muted">
                  <div className="flex justify-between">
                    <span>Location:</span>
                    <span className="font-semibold text-ink">{compareRecordB.location_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Potholes (D40):</span>
                    <span className="font-bold text-red-600">{compareRecordB.d40_count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Alligator (D20):</span>
                    <span className="font-bold text-purple-600">{compareRecordB.d20_count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Transverse (D10):</span>
                    <span className="font-bold text-amber-600">{compareRecordB.d10_count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Longitudinal (D00):</span>
                    <span className="font-bold text-cyan-600">{compareRecordB.d00_count}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end border-t border-line pt-4">
              <button
                onClick={() => setCompareModalOpen(false)}
                className="btn btn-primary text-xs"
              >
                Close Comparison Dossier
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
