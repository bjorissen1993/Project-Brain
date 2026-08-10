"use client";

import { useTransition } from "react";
import { Star } from "lucide-react";
import { toggleProjectFavoriteAction } from "@/features/projects/actions";
import { cn } from "@/lib/utils";

export function FavoriteToggle({
  projectId,
  isFavorite,
  onOptimisticChange,
  className,
}: {
  projectId: string;
  isFavorite: boolean;
  /** Optional local sync before server round-trip. */
  onOptimisticChange?: (next: boolean) => void;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={isFavorite}
      disabled={pending}
      title={isFavorite ? "Unfavorite" : "Favorite"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const next = !isFavorite;
        onOptimisticChange?.(next);
        startTransition(async () => {
          const result = await toggleProjectFavoriteAction({
            projectId,
            isFavorite: next,
          });
          if (!result.ok) {
            onOptimisticChange?.(isFavorite);
          }
        });
      }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-[var(--radius)] text-muted transition hover:bg-muted-bg hover:text-warning disabled:opacity-50",
        isFavorite && "text-warning",
        className,
      )}
    >
      <Star
        className={cn("h-3.5 w-3.5", isFavorite && "fill-current")}
        strokeWidth={2}
      />
    </button>
  );
}
