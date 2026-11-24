import { Link, NavLink, useNavigate } from "react-router-dom";
import { Camera, FlaskConical, LayoutDashboard, LogOut, MapPinned, ShieldCheck, Files, type LucideIcon } from "lucide-react";
import ApiStatusPill from "./ApiStatusPill";
import { ROLE_HOME, ROLE_LABEL, logout, useSession, type Role } from "../lib/auth";

const LINKS: Record<Role, { to: string; label: string; icon: LucideIcon; end?: boolean }[]> = {
  citizen: [
    { to: "/citizen", label: "My reports", icon: LayoutDashboard, end: true },
    { to: "/citizen/new", label: "Report damage", icon: Camera },
  ],
  authority: [{ to: "/authority", label: "Command center", icon: MapPinned }],
  tester: [
    { to: "/lab", label: "Evaluation lab", icon: FlaskConical, end: true },
    { to: "/lab/batch", label: "Batch evaluation", icon: Files },
    { to: "/lab/robustness", label: "Robustness", icon: ShieldCheck },
  ],
};

export default function TopNav() {
  const session = useSession();
  const nav = useNavigate();
  const links = session ? LINKS[session.role] : [];

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center gap-6 px-6 lg:px-8">
        <Link to={session ? ROLE_HOME[session.role] : "/"} className="flex shrink-0 items-center gap-2 text-ink">
          <img src="/favicon.svg" alt="" className="size-8" />
          <span className="text-base font-bold tracking-tight">PAVEXA</span>
        </Link>

        <nav aria-label="Primary" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `inline-flex h-10 shrink-0 items-center gap-2 rounded-sm px-3 text-sm font-semibold transition-colors duration-200 ${
                  isActive ? "bg-primary-soft text-primary" : "text-muted hover:bg-canvas hover:text-ink"
                }`
              }
            >
              <Icon size={16} strokeWidth={1.5} aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>

        <ApiStatusPill />

        {session && (
          <div className="flex shrink-0 items-center gap-3">
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-xs font-semibold text-ink">{session.name}</p>
              <p className="font-mono text-[11px] text-muted">{ROLE_LABEL[session.role]} · demo</p>
            </div>
            <button
              onClick={() => {
                logout();
                nav("/login");
              }}
              className="btn btn-ghost h-9 px-3 text-xs"
              title="Sign out"
            >
              <LogOut size={14} strokeWidth={1.5} aria-hidden />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
