import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-white hover:bg-accent-hover disabled:opacity-50 shadow-sm",
  secondary:
    "bg-panel-elevated border border-border text-foreground hover:bg-muted-bg hover:border-border-strong disabled:opacity-50",
  ghost: "text-muted hover:text-foreground hover:bg-muted-bg disabled:opacity-50",
  danger:
    "bg-transparent border border-danger/40 text-danger hover:bg-danger/10 disabled:opacity-50",
};

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[var(--radius)] px-3.5 py-2 text-sm font-semibold transition-colors",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
