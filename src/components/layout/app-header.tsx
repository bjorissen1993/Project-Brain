import { BrandMark } from "@/components/brand/brand-mark";

export function AppHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-border bg-panel px-6 py-4">
      <div className="min-w-0">
        <BrandMark variant="lockup" className="mb-1" />
        <h1 className="font-display text-2xl text-foreground">{title}</h1>
        {subtitle ? (
          <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
