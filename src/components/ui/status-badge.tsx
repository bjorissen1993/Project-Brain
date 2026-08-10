import { cn } from "@/lib/utils";
import type { NodeStatus } from "@/types";

const styles: Record<NodeStatus, string> = {
  IDEA: "bg-[color-mix(in_oklab,var(--idea)_20%,transparent)] text-[var(--idea)]",
  DRAFT: "bg-[color-mix(in_oklab,var(--draft)_22%,transparent)] text-[var(--draft)]",
  IN_PROGRESS:
    "bg-[color-mix(in_oklab,var(--in-progress)_20%,transparent)] text-[var(--in-progress)]",
  REVIEW: "bg-[color-mix(in_oklab,var(--review)_20%,transparent)] text-[var(--review)]",
  READY: "bg-[color-mix(in_oklab,var(--ready)_20%,transparent)] text-[var(--ready)]",
};

const labels: Record<NodeStatus, string> = {
  IDEA: "Idea",
  DRAFT: "Draft",
  IN_PROGRESS: "In Progress",
  REVIEW: "Review",
  READY: "Ready",
};

export function StatusBadge({
  status,
  className,
}: {
  status: NodeStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[var(--radius)] px-2 py-0.5 text-[11px] font-semibold tracking-wide",
        styles[status],
        className,
      )}
    >
      {labels[status]}
    </span>
  );
}
