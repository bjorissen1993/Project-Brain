"use client";

import { useSyncExternalStore } from "react";
import {
  loadFocusColorOverrides,
  resolveFocusColor,
} from "@/features/focus-space/focus-blob-color";
import { cn } from "@/lib/utils";
import type { RootStructurePreview } from "@/features/projects/actions";

const BASE_PX = { sm: 14, md: 20, lg: 32 } as const;

function sortBlobsByMass(blobs: RootStructurePreview[]): RootStructurePreview[] {
  return [...blobs].sort(
    (a, b) =>
      b.mass - a.mass ||
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

/** Scale marker diameter by mass vs largest sibling (floor keeps labels readable). */
function blobDiameterPx(
  mass: number,
  maxMass: number,
  size: keyof typeof BASE_PX,
): number {
  const base = BASE_PX[size];
  if (maxMass <= 0) return base;
  const ratio = Math.sqrt(Math.max(mass, 1) / maxMass);
  const scaled = base * (0.62 + 0.38 * ratio);
  return Math.round(scaled * 10) / 10;
}

function subscribeFocusColorOverrides(projectId: string, onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const key = `pb:focus-colors:${projectId}`;
  const onStorage = (e: StorageEvent) => {
    if (e.key === key || e.key === null) onStoreChange();
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

export function StructurePreview({
  blobs,
  projectId,
  limit,
  size = "md",
  showLabels = false,
  className,
}: {
  blobs: RootStructurePreview[];
  projectId: string;
  limit: number;
  size?: "sm" | "md" | "lg";
  showLabels?: boolean;
  className?: string;
}) {
  // SSR / first paint: empty overrides → deterministic defaultFocusColor.
  // Same localStorage path as Focus Space (stable JSON snapshot for sync).
  const overridesJson = useSyncExternalStore(
    (onChange) => subscribeFocusColorOverrides(projectId, onChange),
    () => JSON.stringify(loadFocusColorOverrides(projectId)),
    () => "{}",
  );
  const overrides = JSON.parse(overridesJson) as Record<string, string>;

  const visible = sortBlobsByMass(blobs).slice(0, limit);
  if (visible.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center text-[11px] text-muted",
          className,
        )}
      >
        No structure yet
      </div>
    );
  }

  const maxMass = Math.max(...visible.map((b) => b.mass), 1);

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {visible.map((blob) => {
        const diameter = blobDiameterPx(blob.mass, maxMass, size);
        return (
          <span
            key={blob.id}
            className={cn(
              "inline-flex items-center gap-1.5",
              showLabels ? "max-w-full" : null,
            )}
            title={`${blob.name} · mass ${blob.mass}`}
          >
            <span
              className="shrink-0 rounded-[40%_60%_55%_45%] shadow-[inset_0_-1px_2px_rgba(0,0,0,0.35)]"
              style={{
                width: diameter,
                height: diameter,
                backgroundColor: resolveFocusColor(blob.id, overrides),
              }}
              aria-hidden
            />
            {showLabels ? (
              <span className="truncate text-[11px] text-muted">{blob.name}</span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}
