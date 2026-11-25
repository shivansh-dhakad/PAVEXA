import { Link, NavLink } from "react-router-dom";
import { ArrowUpRight, FileImage } from "lucide-react";
import ApiStatusPill from "./ApiStatusPill";

export default function TopNav() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center gap-5 px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex shrink-0 items-center gap-2 text-ink">
          <img src="/favicon.svg" alt="" className="size-8" />
          <span className="text-base font-medium tracking-tight">PAVEXA</span>
        </Link>

        <nav aria-label="Primary" className="flex min-w-0 flex-1 items-center gap-1">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `inline-flex h-9 items-center rounded-md px-3 text-sm transition-colors ${
                isActive ? "bg-canvas text-ink" : "text-muted hover:bg-canvas hover:text-ink"
              }`
            }
          >
            Dashboard
          </NavLink>
          <NavLink
            to="/predict"
            className={({ isActive }) =>
              `inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm transition-colors ${
                isActive ? "bg-canvas text-ink" : "text-muted hover:bg-canvas hover:text-ink"
              }`
            }
          >
            <FileImage size={15} strokeWidth={1.6} aria-hidden />
            Predict
          </NavLink>
        </nav>

        <ApiStatusPill />
        <a
          href="https://github.com/shivansh-dhakad/DataSprint-2.0-Road-Damage-Detection"
          target="_blank"
          rel="noreferrer"
          className="hidden items-center gap-1 text-xs text-muted transition-colors hover:text-ink sm:inline-flex"
        >
          Source <ArrowUpRight size={13} aria-hidden />
        </a>
      </div>
    </header>
  );
}
