interface Props {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export default function PageHeader({ title, description, actions }: Props) {
  return (
    <div className="flex flex-col gap-1 pb-6 border-b border-line sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-ink tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>
        )}
      </div>
      {actions && <div className="mt-3 flex shrink-0 items-center gap-2 sm:mt-0">{actions}</div>}
    </div>
  );
}
