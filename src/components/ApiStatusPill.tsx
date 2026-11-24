import { isLiveMode, setLiveMode, checkApiHealth } from "../lib/api";
import { Cpu, Wifi } from "lucide-react";
import { useEffect, useState } from "react";

export default function ApiStatusPill() {
  const [mode, setMode] = useState<"live" | "mock">("mock");
  const [live, setLive] = useState(isLiveMode());

  useEffect(() => {
    checkApiHealth().then(setMode);
  }, [live]);

  const toggle = () => {
    const next = !live;
    setLiveMode(next);
    setLive(next);
  };

  const isConnected = mode === "live";

  return (
    <button
      onClick={toggle}
      title={live ? "Click to switch to Mock mode" : "Click to attempt Live backend connection"}
      className="hidden h-8 shrink-0 cursor-pointer items-center gap-2 rounded-sm border border-line px-3 font-mono text-xs text-muted transition-colors hover:border-primary hover:text-primary sm:inline-flex"
    >
      {isConnected ? <Wifi size={13} strokeWidth={1.5} aria-hidden /> : <Cpu size={13} strokeWidth={1.5} aria-hidden />}
      {isConnected ? "Live backend" : "Mock inference"}
      <span
        className="size-2 rounded-full"
        style={{ backgroundColor: isConnected ? "#16a34a" : "var(--color-primary)" }}
        aria-hidden
      />
    </button>
  );
}
