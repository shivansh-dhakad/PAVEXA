import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  FlaskConical,
  MapPinned,
  Shield,
  type LucideIcon,
} from "lucide-react";
import {
  ROLE_HOME,
  DEMO_ACCOUNTS,
  loginAsDemo,
  useSession,
  type Role,
} from "../lib/auth";

interface RoleCardConfig {
  role: Role;
  title: string;
  badge: string;
  icon: LucideIcon;
  name: string;
  email: string;
  description: string;
}

const CARDS: RoleCardConfig[] = [
  {
    role: "citizen",
    title: "Citizen",
    badge: "Public Reporter",
    icon: Camera,
    name: DEMO_ACCOUNTS.citizen.name,
    email: DEMO_ACCOUNTS.citizen.email,
    description:
      "Report road hazards with camera or video. Automatic EXIF GPS geotagging and real-time status tracking.",
  },
  {
    role: "authority",
    title: "Road Authority",
    badge: "Official & Engineer",
    icon: MapPinned,
    name: DEMO_ACCOUNTS.authority.name,
    email: DEMO_ACCOUNTS.authority.email,
    description:
      "GIS damage map, ML bounding box overlays, confidence distribution, contractor assignment and work order dispatch.",
  },
  {
    role: "tester",
    title: "Model Tester",
    badge: "AI Engineer Lab",
    icon: FlaskConical,
    name: DEMO_ACCOUNTS.tester.name,
    email: DEMO_ACCOUNTS.tester.email,
    description:
      "Upload test frames, calibrate confidence threshold, inspect dual-scale inference latency and F1 analytics.",
  },
];

export default function Login() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const hint = params.get("role") as Role | null;
  const session = useSession();

  const handleCardClick = (role: Role) => {
    loginAsDemo(role);
    nav(ROLE_HOME[role]);
  };

  return (
    <div className="min-h-screen bg-canvas">
      {/* Header */}
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center justify-between px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2 text-ink">
            <img src="/favicon.svg" alt="" className="size-8" />
            <span className="text-lg font-extrabold tracking-tight">PAVEXA</span>
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted transition-colors hover:text-ink"
          >
            <ArrowLeft size={15} strokeWidth={1.5} aria-hidden /> Back to home
          </Link>
        </div>
        <div className="lane" aria-hidden />
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-[1100px] px-6 py-16 lg:py-20">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary mb-4">
            <Shield size={13} />
            Demo Accounts Enabled
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            Choose an account to sign in
          </h1>
          <p className="mt-3 text-base leading-relaxed text-muted">
            Click on any account card below to sign in instantly with that role.
          </p>

          {session && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary-soft p-3 text-xs text-ink">
              <CheckCircle2 size={16} className="text-primary shrink-0" />
              <span>
                Currently active as <b className="font-semibold">{session.name}</b> ({session.role}).
              </span>
              <button
                type="button"
                onClick={() => nav(ROLE_HOME[session.role])}
                className="ml-auto font-semibold text-primary hover:underline"
              >
                Go to Dashboard →
              </button>
            </div>
          )}
        </div>

        {/* 3 Interactive Role Cards */}
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {CARDS.map(({ role, title, badge, icon: Icon, name, email, description }) => {
            const isHighlighted = hint === role || session?.role === role;
            return (
              <div
                key={role}
                onClick={() => handleCardClick(role)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleCardClick(role);
                  }
                }}
                className={`group relative flex flex-col justify-between rounded-2xl border p-6 text-left cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary ${
                  isHighlighted
                    ? "border-primary bg-surface shadow-md ring-2 ring-primary/20"
                    : "border-line bg-surface hover:border-primary/50 hover:bg-surface"
                }`}
              >
                <div>
                  {/* Top Icon & Badge */}
                  <div className="flex items-center justify-between">
                    <span className="flex size-12 items-center justify-center rounded-xl border border-line bg-canvas text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                      <Icon size={22} strokeWidth={1.75} aria-hidden />
                    </span>
                    <span className="rounded-full bg-canvas px-2.5 py-0.5 text-[11px] font-mono font-medium text-muted border border-line">
                      {badge}
                    </span>
                  </div>

                  {/* Role Title */}
                  <h2 className="mt-5 text-lg font-bold text-ink group-hover:text-primary transition-colors">
                    {title}
                  </h2>

                  {/* Profile Info */}
                  <div className="mt-1 font-mono text-xs">
                    <p className="font-semibold text-ink">{name}</p>
                    <p className="text-muted">{email}</p>
                  </div>

                  {/* Description */}
                  <p className="mt-4 text-xs leading-relaxed text-muted">
                    {description}
                  </p>
                </div>

                {/* Card Action Button */}
                <div className="mt-6 pt-4 border-t border-line/60">
                  <div className="flex items-center justify-between text-xs font-semibold text-primary">
                    <span>Sign in as {title}</span>
                    <ArrowRight
                      size={15}
                      className="transition-transform group-hover:translate-x-1"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
