import { useEffect, useState } from "react";
import { CircleAlert, Wifi } from "lucide-react";
import { checkApiHealth } from "../lib/api";

type Status = "checking" | "live" | "offline";

export default function ApiStatusPill() {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const current = await checkApiHealth();
      if (active) setStatus(current);
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const connected = status === "live";
  const label = status === "checking" ? "Checking model API" : connected ? "Model API connected" : "Model API offline";

  return (
    <span
      title={label}
      role="status"
      className="hidden shrink-0 items-center gap-2 text-xs text-muted sm:inline-flex"
    >
      {connected ? <Wifi size={14} aria-hidden /> : <CircleAlert size={14} aria-hidden />}
      {label}
      <span className={`size-2 rounded-full ${connected ? "bg-emerald-700" : status === "offline" ? "bg-red-700" : "bg-muted"}`} aria-hidden />
    </span>
  );
}
