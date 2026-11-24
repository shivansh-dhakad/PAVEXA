import { type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
  icon: LucideIcon;
  code: string;
  title: string;
  body: string;
  actions?: ReactNode;
}

export default function ErrorView({ icon: Icon, code, title, body, actions }: Props) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 py-16 text-center">
      <div className="flex size-16 items-center justify-center rounded-lg border border-line bg-surface">
        <Icon size={28} strokeWidth={1.5} className="text-muted" aria-hidden />
      </div>
      <div>
        <p className="font-mono text-xs text-muted">{code}</p>
        <h1 className="mt-2 text-2xl font-bold text-ink">{title}</h1>
        <p className="mt-3 max-w-sm text-sm text-muted">{body}</p>
      </div>
      {actions && <div className="flex flex-wrap justify-center gap-3">{actions}</div>}
    </div>
  );
}
