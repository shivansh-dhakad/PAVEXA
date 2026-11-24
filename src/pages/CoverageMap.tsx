import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MapPinned, FlaskConical, History } from "lucide-react";
import PageHeader from "../components/PageHeader";
import GisDamageMap from "../components/GisDamageMap";
import RobustnessLab from "../components/RobustnessLab";
import InspectionHistoryTable from "../components/InspectionHistoryTable";

type GisTab = "map" | "robustness" | "history";

export default function CoverageMap() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get("tab") as GisTab) || "map";
  const [activeTab, setActiveTab] = useState<GisTab>(initialTab);

  // Sync state if URL changes
  useEffect(() => {
    const tab = (searchParams.get("tab") as GisTab) || "map";
    if (["map", "robustness", "history"].includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const switchTab = (tab: GisTab) => {
    setActiveTab(tab);
    setSearchParams({ tab }, { replace: true });
  };

  return (
    <div className="space-y-8 pb-16">
      <PageHeader
        title="GIS & Inspection Operations"
        description="Comprehensive geospatial road intelligence — associate imagery with GPS coordinates, stress-test AI detection models in the Robustness Lab, and manage historical inspection records."
        actions={
          <div className="flex items-center gap-1.5 rounded-xl border border-line bg-canvas p-1 shadow-sm">
            <button
              onClick={() => switchTab("map")}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
                activeTab === "map"
                  ? "bg-surface text-primary shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              <MapPinned size={14} strokeWidth={1.8} />
              Interactive Damage Map
            </button>

            <button
              onClick={() => switchTab("robustness")}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
                activeTab === "robustness"
                  ? "bg-surface text-primary shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              <FlaskConical size={14} strokeWidth={1.8} />
              Robustness Testing Lab
            </button>

            <button
              onClick={() => switchTab("history")}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
                activeTab === "history"
                  ? "bg-surface text-primary shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              <History size={14} strokeWidth={1.8} />
              Inspection History
            </button>
          </div>
        }
      />

      {/* ── Active GIS Suite View ── */}
      {activeTab === "map" && <GisDamageMap />}
      {activeTab === "robustness" && <RobustnessLab />}
      {activeTab === "history" && <InspectionHistoryTable />}
    </div>
  );
}
