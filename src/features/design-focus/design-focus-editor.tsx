"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/field";
import {
  createDesignFocusAction,
  deleteDesignFocusAction,
  updateDesignFocusAction,
} from "@/features/design-focus/actions";
import {
  findGenreFocusDescription,
  getGenreTemplate,
  IMPORTANCE_SLIDER_FALLBACK,
} from "@/features/game-profile/genre-templates";
import type { DesignFocus } from "@/types";
import { cn } from "@/lib/utils";

function FocusRow({
  focus,
  depth,
  onChanged,
}: {
  focus: DesignFocus;
  depth: number;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [pending, startTransition] = useTransition();
  const [importance, setImportance] = useState(focus.targetImportance);
  const hasChildren = (focus.children?.length ?? 0) > 0;
  const pillarDescription = findGenreFocusDescription(
    focus.templateSource,
    focus.name,
  );

  return (
    <div>
      <div
        className="surface-card px-3 py-3"
        style={{ marginLeft: depth * 16 }}
      >
        <div className="flex items-start gap-2">
          <button
            type="button"
            className="mt-0.5 text-muted"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Collapse" : "Expand"}
          >
            {hasChildren ? (
              open ? <ChevronDown size={14} /> : <ChevronRight size={14} />
            ) : (
              <span className="inline-block h-1 w-1 rounded-full bg-border-strong" />
            )}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{focus.name}</span>
              {focus.isCustom ? (
                <span className="text-[10px] uppercase text-muted">Custom</span>
              ) : null}
            </div>
            {pillarDescription ? (
              <p className="mt-1 text-xs leading-snug text-muted">
                {pillarDescription}
              </p>
            ) : null}
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-xs text-muted">
                <span>Target importance</span>
                <span>{importance}</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={importance}
                onChange={(e) => setImportance(Number(e.target.value))}
                onMouseUp={() => {
                  startTransition(async () => {
                    await updateDesignFocusAction({
                      id: focus.id,
                      targetImportance: importance,
                    });
                    onChanged();
                  });
                }}
                onTouchEnd={() => {
                  startTransition(async () => {
                    await updateDesignFocusAction({
                      id: focus.id,
                      targetImportance: importance,
                    });
                    onChanged();
                  });
                }}
                className="w-full accent-[var(--accent)]"
              />
              <p className="mt-1 text-[11px] leading-snug text-muted">
                {IMPORTANCE_SLIDER_FALLBACK} Values are independent (0–100) and
                need not sum to 100.
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => {
              if (!confirm(`Delete “${focus.name}” and its children?`)) return;
              startTransition(async () => {
                await deleteDesignFocusAction(focus.id);
                onChanged();
              });
            }}
          >
            Delete
          </Button>
        </div>
      </div>
      {open && hasChildren
        ? focus.children!.map((child) => (
            <div key={child.id} className="mt-2">
              <FocusRow focus={child} depth={depth + 1} onChanged={onChanged} />
            </div>
          ))
        : null}
    </div>
  );
}

type GenreFocusGroup = {
  key: string;
  label: string;
  focuses: DesignFocus[];
};

function groupFocusesByGenre(tree: DesignFocus[]): GenreFocusGroup[] {
  const order: string[] = [];
  const map = new Map<string, DesignFocus[]>();

  for (const focus of tree) {
    const key =
      focus.templateSource?.trim() ||
      (focus.isCustom ? "custom" : "ungrouped");
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(focus);
  }

  return order.map((key) => {
    if (key === "custom") {
      return { key, label: "Custom", focuses: map.get(key)! };
    }
    if (key === "ungrouped") {
      return { key, label: "Other", focuses: map.get(key)! };
    }
    const template = getGenreTemplate(key);
    return {
      key,
      label: template?.name ?? key,
      focuses: map.get(key)!,
    };
  });
}

function GenreFocusGroupBlock({
  group,
  onChanged,
  defaultOpen = false,
}: {
  group: GenreFocusGroup;
  onChanged: () => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-[var(--radius)] border border-border/80">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
        aria-expanded={open}
      >
        <span className="text-muted" aria-hidden>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <span className="min-w-0 flex-1 font-medium">{group.label}</span>
        <span className="text-[11px] text-muted">
          {group.focuses.length} focus
          {group.focuses.length === 1 ? "" : "es"}
        </span>
      </button>
      {open ? (
        <div className="space-y-2 border-t border-border/80 px-2 py-2">
          {group.focuses.map((focus) => (
            <FocusRow
              key={focus.id}
              focus={focus}
              depth={0}
              onChanged={onChanged}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function DesignFocusEditor({
  projectId,
  tree,
  flatOptions,
  embedded = false,
}: {
  projectId: string;
  tree: DesignFocus[];
  flatOptions: { id: string; name: string }[];
  /** When true, omit page chrome for embedding in Project Profile. */
  embedded?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [targetImportance, setTargetImportance] = useState(50);

  const groups = useMemo(() => groupFocusesByGenre(tree), [tree]);
  const refresh = () => router.refresh();

  return (
    <div
      className={
        embedded ? "space-y-6" : "mx-auto w-full max-w-[1600px] space-y-8 px-6 py-8"
      }
    >
      {!embedded ? (
        <div>
          <h1 className="font-display text-3xl">Design Focus</h1>
          <p className="mt-2 text-sm text-muted">
            Hierarchical categories for what the project is optimizing. Balance is
            calculated independently at every level on the Balance tab.
          </p>
        </div>
      ) : null}

      <div className="space-y-2">
        {groups.length === 0 ? (
          <p className="text-sm text-muted">No design focuses yet.</p>
        ) : (
          groups.map((group, index) => (
            <GenreFocusGroupBlock
              key={group.key}
              group={group}
              onChanged={refresh}
              defaultOpen={index === 0}
            />
          ))
        )}
      </div>

      <form
        className={cn("surface-card space-y-3 p-4")}
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          startTransition(async () => {
            const result = await createDesignFocusAction({
              projectId,
              name,
              parentId: parentId || null,
              targetImportance,
              isCustom: true,
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setName("");
            setParentId("");
            setTargetImportance(50);
            refresh();
          });
        }}
      >
        <h2 className="font-display text-lg">Add focus category</h2>
        <div>
          <Label htmlFor="focusName">Name</Label>
          <Input
            id="focusName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="parentFocus">Parent (optional)</Label>
          <select
            id="parentFocus"
            className="w-full rounded-[var(--radius)] border border-border bg-panel-elevated px-3 py-2 text-sm outline-none transition focus:border-nav focus:ring-1 focus:ring-nav/40"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
          >
            <option value="">Root level</option>
            {flatOptions.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="mb-1 flex justify-between text-xs text-muted">
            <Label>Target importance</Label>
            <span>{targetImportance}</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={targetImportance}
            onChange={(e) => setTargetImportance(Number(e.target.value))}
            className="w-full accent-[var(--accent)]"
          />
          <p className="mt-1 text-[11px] leading-snug text-muted">
            {IMPORTANCE_SLIDER_FALLBACK}
          </p>
        </div>
        <FieldError>{error}</FieldError>
        <Button type="submit" disabled={pending || !name.trim()}>
          {pending ? "Adding…" : "Add focus"}
        </Button>
      </form>
    </div>
  );
}
