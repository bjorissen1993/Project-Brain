"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FieldError, Input, Label, Textarea } from "@/components/ui/field";
import {
  abandonProjectSetupAction,
  completeGameSetupAction,
} from "@/features/projects/actions";
import { suggestSetupFromIntentAction } from "@/features/game-profile/actions";
import {
  GENRE_TEMPLATES,
  getGenreProjectAreas,
  getGenreTemplate,
  IMPORTANCE_SLIDER_FALLBACK,
} from "@/features/game-profile/genre-templates";
import type {
  SetupSuggestionData,
  SuggestedFocus,
  SuggestedProjectArea,
} from "@/features/ai/types";
import {
  allocateUniqueFocusColors,
  loadFocusColorOverrides,
  saveFocusColorOverrides,
} from "@/features/focus-space/focus-blob-color";
import {
  iconKeyForGenre,
  iconKeyForName,
  PbIcon,
} from "@/lib/icons";
import { cn } from "@/lib/utils";

type FocusSelection = {
  key: string;
  name: string;
  parentName?: string;
  targetImportance: number;
  templateSource?: string;
  isCustom: boolean;
  description?: string;
  reasoning?: string;
};

type AreaSelection = {
  key: string;
  name: string;
  templateSource?: string;
  isCustom: boolean;
  reasoning?: string;
};

const INTENT_PLACEHOLDER = `Example:
Players should feel the quiet satisfaction of restoring a neglected village — tending gardens, repairing homes, and rebuilding community trust. The core fantasy is gentle progress and belonging, not conquest. We optimize for cozy daily loops, relationships, and soft seasonal goals. Avoid combat pressure, timer stress, and punitive failure.`;

function flattenTemplateFocuses(templateKey: string): FocusSelection[] {
  const template = getGenreTemplate(templateKey);
  if (!template) return [];

  const items: FocusSelection[] = [];
  for (const focus of template.focuses) {
    items.push({
      key: `${templateKey}:${focus.name}`,
      name: focus.name,
      targetImportance: focus.defaultImportance ?? 50,
      templateSource: templateKey,
      isCustom: false,
      description: focus.description,
    });
    for (const child of focus.children ?? []) {
      items.push({
        key: `${templateKey}:${focus.name}:${child.name}`,
        name: child.name,
        parentName: focus.name,
        targetImportance: child.defaultImportance ?? 50,
        templateSource: templateKey,
        isCustom: false,
        description: child.description,
      });
    }
  }
  return items;
}

function flattenTemplateAreas(templateKey: string): AreaSelection[] {
  return getGenreProjectAreas(templateKey).map((name) => ({
    key: `${templateKey}:${name}`,
    name,
    templateSource: templateKey,
    isCustom: false,
  }));
}

function focusKeyForSuggestion(focus: SuggestedFocus, index: number): string {
  if (focus.templateKey) {
    return focus.parentName
      ? `${focus.templateKey}:${focus.parentName}:${focus.name}`
      : `${focus.templateKey}:${focus.name}`;
  }
  return `custom:${focus.name}:${index}`;
}

function areaKeyForSuggestion(area: SuggestedProjectArea, index: number): string {
  if (area.templateKey) return `${area.templateKey}:${area.name}`;
  return `custom-area:${area.name}:${index}`;
}

export function GameSetupWizard({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [primaryGenreKey, setPrimaryGenreKey] = useState<string>("");
  const [secondaryGenreKeys, setSecondaryGenreKeys] = useState<string[]>([]);
  const [customGameType, setCustomGameType] = useState("");
  const [intent, setIntent] = useState("");

  const [selectedFocusKeys, setSelectedFocusKeys] = useState<Set<string>>(
    new Set(),
  );
  const [importance, setImportance] = useState<Record<string, number>>({});
  const [focusReasoning, setFocusReasoning] = useState<Record<string, string>>(
    {},
  );
  const [customFocuses, setCustomFocuses] = useState<FocusSelection[]>([]);
  const [customFocusName, setCustomFocusName] = useState("");

  const [selectedAreaKeys, setSelectedAreaKeys] = useState<Set<string>>(
    new Set(),
  );
  const [areaReasoning, setAreaReasoning] = useState<Record<string, string>>(
    {},
  );
  const [customAreas, setCustomAreas] = useState<AreaSelection[]>([]);
  const [customAreaName, setCustomAreaName] = useState("");

  const [suggestionMeta, setSuggestionMeta] = useState<{
    source: "ai" | "heuristic";
    message: string;
    hints?: SetupSuggestionData["extractedIntentHints"];
    suggestedSecondaryKeys: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [suggesting, startSuggestTransition] = useTransition();
  const [cancelling, startCancelTransition] = useTransition();

  const busy = pending || suggesting || cancelling;

  function hasProgressBeyondStart() {
    return (
      step > 0 ||
      intent.trim().length > 0 ||
      Boolean(primaryGenreKey) ||
      selectedFocusKeys.size > 0 ||
      selectedAreaKeys.size > 0
    );
  }

  function confirmLeaveSetup() {
    setError(null);
    startCancelTransition(async () => {
      const result = await abandonProjectSetupAction({ projectId });
      if (result && !result.ok) {
        setLeaveOpen(false);
        setError(result.error);
      }
    });
  }

  const templateFocuses = useMemo(() => {
    const keys = [primaryGenreKey, ...secondaryGenreKeys].filter(Boolean);
    const map = new Map<string, FocusSelection>();
    for (const key of keys) {
      for (const focus of flattenTemplateFocuses(key)) {
        if (!map.has(focus.key)) map.set(focus.key, focus);
      }
    }
    return [...map.values()];
  }, [primaryGenreKey, secondaryGenreKeys]);

  const templateAreas = useMemo(() => {
    const keys = [primaryGenreKey, ...secondaryGenreKeys].filter(Boolean);
    const map = new Map<string, AreaSelection>();
    for (const key of keys) {
      for (const area of flattenTemplateAreas(key)) {
        // Deduplicate by area name across genres — keep first (primary first).
        const byName = [...map.values()].find(
          (a) => a.name.toLowerCase() === area.name.toLowerCase(),
        );
        if (!byName) map.set(area.key, area);
      }
    }
    return [...map.values()];
  }, [primaryGenreKey, secondaryGenreKeys]);

  const allFocuses = useMemo(
    () => [...templateFocuses, ...customFocuses],
    [templateFocuses, customFocuses],
  );

  const allAreas = useMemo(
    () => [...templateAreas, ...customAreas],
    [templateAreas, customAreas],
  );

  const steps = [
    "Intent",
    "Genres",
    "Project Areas",
    "Design Focus",
    "Review",
  ];

  function clearSuggestionState() {
    setPrimaryGenreKey("");
    setSecondaryGenreKeys([]);
    setCustomGameType("");
    setSelectedFocusKeys(new Set());
    setImportance({});
    setFocusReasoning({});
    setCustomFocuses([]);
    setSelectedAreaKeys(new Set());
    setAreaReasoning({});
    setCustomAreas([]);
    setSuggestionMeta(null);
  }

  function applySuggestion(data: SetupSuggestionData) {
    setPrimaryGenreKey(data.primaryGenreKey ?? "");
    setSecondaryGenreKeys(data.secondaryGenreKeys ?? []);
    setCustomGameType(data.customGameType ?? "");

    const nextFocusSelected = new Set<string>();
    const nextImportance: Record<string, number> = {};
    const nextFocusReasoning: Record<string, string> = {};
    const nextCustomFocuses: FocusSelection[] = [];

    data.suggestedDesignFocuses.forEach((focus, index) => {
      const key = focusKeyForSuggestion(focus, index);
      const isCustom = !focus.templateKey;

      if (isCustom) {
        nextCustomFocuses.push({
          key,
          name: focus.name,
          parentName: focus.parentName,
          targetImportance: focus.targetImportance,
          isCustom: true,
          reasoning: focus.reasoning,
        });
      }

      if (focus.selected) nextFocusSelected.add(key);
      nextImportance[key] = focus.targetImportance;
      if (focus.reasoning) nextFocusReasoning[key] = focus.reasoning;
    });

    for (const genreKey of [
      data.primaryGenreKey,
      ...(data.secondaryGenreKeys ?? []),
    ].filter(Boolean) as string[]) {
      for (const focus of flattenTemplateFocuses(genreKey)) {
        if (nextImportance[focus.key] === undefined) {
          nextImportance[focus.key] = focus.targetImportance;
        }
      }
    }

    const nextAreaSelected = new Set<string>();
    const nextAreaReasoning: Record<string, string> = {};
    const nextCustomAreas: AreaSelection[] = [];

    data.suggestedProjectAreas.forEach((area, index) => {
      const key = areaKeyForSuggestion(area, index);
      const isCustom = !area.templateKey;
      if (isCustom) {
        nextCustomAreas.push({
          key,
          name: area.name,
          isCustom: true,
          reasoning: area.reasoning,
        });
      }
      // Match template area by name if template key pairing differs after dedupe
      const templateMatch = flattenTemplateAreas(
        area.templateKey ?? data.primaryGenreKey ?? "",
      ).find((a) => a.name.toLowerCase() === area.name.toLowerCase());
      const resolvedKey = templateMatch?.key ?? key;
      if (area.selected) nextAreaSelected.add(resolvedKey);
      if (area.reasoning) nextAreaReasoning[resolvedKey] = area.reasoning;
    });

    // Ensure primary genre areas are selectable even if AI omitted them
    for (const area of flattenTemplateAreas(data.primaryGenreKey ?? "")) {
      if (![...nextAreaSelected].some((k) => k.endsWith(`:${area.name}`))) {
        // leave unchecked unless already selected
      }
      if (!nextAreaReasoning[area.key] && nextAreaSelected.has(area.key)) {
        // keep
      }
    }

    setCustomFocuses(nextCustomFocuses);
    setSelectedFocusKeys(nextFocusSelected);
    setImportance(nextImportance);
    setFocusReasoning(nextFocusReasoning);
    setCustomAreas(nextCustomAreas);
    setSelectedAreaKeys(nextAreaSelected);
    setAreaReasoning(nextAreaReasoning);
  }

  function rejectSuggestions() {
    clearSuggestionState();
  }

  function syncAreasForGenre(genreKey: string, adding: boolean) {
    const areas = flattenTemplateAreas(genreKey);
    if (adding) {
      setSelectedAreaKeys((sel) => {
        const copy = new Set(sel);
        for (const a of areas) {
          const dup = [...copy].some((k) => {
            const name = k.split(":").slice(1).join(":");
            return name.toLowerCase() === a.name.toLowerCase();
          });
          if (!dup) copy.add(a.key);
        }
        return copy;
      });
    }
  }

  function toggleSecondary(key: string) {
    setSecondaryGenreKeys((prev) => {
      const removing = prev.includes(key);
      const next = removing ? prev.filter((k) => k !== key) : [...prev, key];

      const focuses = flattenTemplateFocuses(key);
      if (removing) {
        setSelectedFocusKeys((sel) => {
          const copy = new Set(sel);
          for (const f of focuses) copy.delete(f.key);
          return copy;
        });
      } else {
        setSelectedFocusKeys((sel) => {
          const copy = new Set(sel);
          for (const f of focuses) {
            if ((f.targetImportance ?? 50) >= 55) copy.add(f.key);
          }
          return copy;
        });
        setImportance((imp) => {
          const nextImp = { ...imp };
          for (const f of focuses) {
            if (nextImp[f.key] === undefined) {
              nextImp[f.key] = f.targetImportance;
            }
          }
          return nextImp;
        });
        syncAreasForGenre(key, true);
      }
      return next;
    });
  }

  function selectPrimaryGenre(genreKey: string) {
    setPrimaryGenreKey(genreKey);
    setSecondaryGenreKeys((prev) => prev.filter((k) => k !== genreKey));
    const focuses = flattenTemplateFocuses(genreKey);
    setSelectedFocusKeys(new Set(focuses.map((f) => f.key)));
    setImportance((prev) => {
      const next = { ...prev };
      for (const f of focuses) {
        next[f.key] = f.targetImportance;
      }
      return next;
    });
    const areas = flattenTemplateAreas(genreKey);
    setSelectedAreaKeys(new Set(areas.map((a) => a.key)));
  }

  function toggleFocus(key: string, focus: FocusSelection) {
    setSelectedFocusKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else {
        next.add(key);
        setImportance((imp) => ({
          ...imp,
          [key]: imp[key] ?? focus.targetImportance,
        }));
      }
      return next;
    });
  }

  function toggleArea(key: string) {
    setSelectedAreaKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function generateAndContinue() {
    setError(null);
    if (!intent.trim()) {
      setError("Describe the experience you want to create first.");
      return;
    }

    startSuggestTransition(async () => {
      const result = await suggestSetupFromIntentAction({
        projectId,
        intentText: intent,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      applySuggestion(result.data);
      setSuggestionMeta({
        source: result.source,
        message: result.message,
        hints: result.data.extractedIntentHints,
        suggestedSecondaryKeys: result.data.secondaryGenreKeys ?? [],
      });
      setStep(1);
    });
  }

  function submit() {
    setError(null);
    const selectedFocuses = allFocuses
      .filter((f) => selectedFocusKeys.has(f.key))
      .map((f) => ({
        name: f.name,
        parentName: f.parentName,
        targetImportance: importance[f.key] ?? f.targetImportance,
        templateSource: f.templateSource,
        isCustom: f.isCustom,
      }));

    selectedFocuses.sort((a, b) => {
      if (!a.parentName && b.parentName) return -1;
      if (a.parentName && !b.parentName) return 1;
      return 0;
    });

    // Deduplicate areas by name (case-insensitive)
    const seenAreas = new Set<string>();
    const selectedProjectAreas = allAreas
      .filter((a) => selectedAreaKeys.has(a.key))
      .filter((a) => {
        const k = a.name.toLowerCase();
        if (seenAreas.has(k)) return false;
        seenAreas.add(k);
        return true;
      })
      .map((a) => ({
        name: a.name,
        templateSource: a.templateSource,
        isCustom: a.isCustom,
      }));

    startTransition(async () => {
      const result = await completeGameSetupAction({
        projectId,
        primaryGenreKey,
        secondaryGenreKeys,
        customGameType: customGameType || undefined,
        selectedProjectAreas,
        selectedFocuses,
        intent,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Assign distinct blob colors before Focus Space mounts (no workspace yet).
      if (result.areaNodeIds.length > 0) {
        const colors = allocateUniqueFocusColors([], result.areaNodeIds.length);
        const overrides = loadFocusColorOverrides(projectId);
        result.areaNodeIds.forEach((id, i) => {
          const color = colors[i];
          if (color) overrides[id] = color;
        });
        saveFocusColorOverrides(projectId, overrides);
      }
      router.push(`/projects/${projectId}/focus`);
      router.refresh();
    });
  }

  const suggestionLabel =
    suggestionMeta?.source === "ai" ? "AI suggestions" : "Heuristic suggestions";

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
          {projectName} · Game configuration
        </p>
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => setLeaveOpen(true)}
          className="text-xs"
        >
          {cancelling ? "Discarding…" : "Cancel · Back to home"}
        </Button>
      </div>
      <h1 className="mt-3 font-display text-3xl">Configure your game project</h1>
      <p className="mt-2 max-w-prose text-sm text-muted">
        Intent first, then genres. Project Areas organize where ideas live;
        Design Focuses define what the game should emphasize. Suggestions are
        advisory — accept, edit, or reject before anything is saved.
      </p>

      <ol className="mt-8 flex flex-wrap gap-2">
        {steps.map((label, index) => (
          <li
            key={label}
            className={cn(
              "rounded-[var(--radius)] px-3 py-1 text-xs font-semibold",
              index === step
                ? "bg-nav-muted text-nav"
                : index < step
                  ? "bg-muted-bg text-foreground"
                  : "text-muted",
            )}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>

      {suggestionMeta && step > 0 ? (
        <div className="mt-6 rounded-[var(--radius)] border border-border bg-panel-elevated px-4 py-3 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-nav">
                {suggestionLabel}
              </p>
              <p className="mt-1 text-muted">{suggestionMeta.message}</p>
              <p className="mt-1 text-xs text-muted">
                Pre-filled below for edit — nothing is committed until Finish setup.
              </p>
            </div>
            <Button type="button" variant="ghost" onClick={rejectSuggestions}>
              Reject suggestions
            </Button>
          </div>
          {suggestionMeta.hints ? (
            <div className="mt-3 grid gap-2 text-xs text-muted sm:grid-cols-2">
              {suggestionMeta.hints.primaryExperiences?.length ? (
                <p>
                  <span className="text-foreground">Experiences: </span>
                  {suggestionMeta.hints.primaryExperiences.join(" · ")}
                </p>
              ) : null}
              {suggestionMeta.hints.supportingSystems?.length ? (
                <p>
                  <span className="text-foreground">Systems: </span>
                  {suggestionMeta.hints.supportingSystems.join(" · ")}
                </p>
              ) : null}
              {suggestionMeta.hints.thingsToAvoid?.length ? (
                <p className="sm:col-span-2">
                  <span className="text-foreground">Avoid: </span>
                  {suggestionMeta.hints.thingsToAvoid.join(" · ")}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-8 space-y-6">
        {step === 0 ? (
          <div className="max-w-3xl">
            <Label htmlFor="intent">Project intent</Label>
            <p className="mb-2 max-w-prose text-sm text-muted">
              Tell the story of what this project should become — the foundation.
              Your wording is the source of truth. We&apos;ll suggest genres,
              Project Areas, and Design Focus sliders from it; you decide what to keep.
            </p>
            <Textarea
              id="intent"
              rows={12}
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              placeholder={INTENT_PLACEHOLDER}
              className="min-h-[280px] leading-relaxed"
            />
          </div>
        ) : null}

        {step === 1 ? (
          <>
            <div>
              <Label>Primary genre</Label>
              <p className="mb-2 max-w-prose text-sm text-muted">
                Suggested from your intent — change freely. Genres suggest both
                Project Areas and Design Focuses on later steps (separately).
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {GENRE_TEMPLATES.map((genre) => (
                  <button
                    key={genre.key}
                    type="button"
                    onClick={() => selectPrimaryGenre(genre.key)}
                    className={cn(
                      "rounded-[var(--radius)] border px-3 py-3 text-left text-sm transition",
                      primaryGenreKey === genre.key
                        ? "border-nav bg-nav-muted"
                        : "border-border bg-panel hover:border-border-strong",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded border md:h-10 md:w-10",
                            primaryGenreKey === genre.key
                              ? "border-nav/40 bg-nav/10 text-nav"
                              : "border-border bg-panel-elevated text-muted",
                          )}
                        >
                          <PbIcon
                            icon={iconKeyForGenre(genre.key)}
                            size={24}
                            className="h-4 w-4 md:h-6 md:w-6"
                          />
                        </span>
                        <div className="font-medium">{genre.name}</div>
                      </div>
                      {suggestionMeta && primaryGenreKey === genre.key ? (
                        <span className="shrink-0 text-[10px] uppercase tracking-wide text-nav">
                          Suggested
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-muted">{genre.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label>Secondary genres / influences</Label>
              <p className="mb-2 text-sm text-muted">
                Subgenres and cross-influences. Their Project Areas and Design
                Focuses appear on the next steps as separate suggestions.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {GENRE_TEMPLATES.filter((g) => g.key !== primaryGenreKey).map(
                  (genre) => {
                    const active = secondaryGenreKeys.includes(genre.key);
                    const suggested =
                      suggestionMeta?.suggestedSecondaryKeys.includes(
                        genre.key,
                      ) ?? false;
                    return (
                      <button
                        key={genre.key}
                        type="button"
                        disabled={!primaryGenreKey}
                        onClick={() => toggleSecondary(genre.key)}
                        className={cn(
                          "inline-flex items-center gap-2 rounded-[var(--radius)] border px-3 py-1.5 text-xs font-medium transition",
                          active
                            ? "border-nav bg-nav-muted text-nav"
                            : "border-border text-muted hover:text-foreground",
                        )}
                      >
                        <PbIcon
                          icon={iconKeyForGenre(genre.key)}
                          size={16}
                          className={cn(
                            "h-3.5 w-3.5 md:h-4 md:w-4",
                            active ? "text-nav" : "opacity-70",
                          )}
                        />
                        {genre.name}
                        {suggested ? (
                          <span className="ml-0.5 text-[10px] uppercase opacity-80">
                            · suggested
                          </span>
                        ) : null}
                      </button>
                    );
                  },
                )}
              </div>
            </div>

            {(primaryGenreKey === "custom" ||
              secondaryGenreKeys.includes("custom")) && (
              <div>
                <Label htmlFor="customGameType">Custom game type</Label>
                <Input
                  id="customGameType"
                  value={customGameType}
                  onChange={(e) => setCustomGameType(e.target.value)}
                  placeholder="Describe the experience in your own terms"
                />
              </div>
            )}
          </>
        ) : null}

        {step === 2 ? (
          <>
            <p className="max-w-prose text-sm text-muted">
              What sections do you want to organize this project around? These
              become top-level folders in Project Structure (Focus Space). No
              importance sliders — areas are where ideas live, not what the game
              emphasizes.
            </p>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {allAreas.map((area) => {
                const checked = selectedAreaKeys.has(area.key);
                const reasoning = areaReasoning[area.key] ?? area.reasoning;
                return (
                  <label
                    key={area.key}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-[var(--radius)] border px-3 py-3",
                      checked
                        ? "border-nav/50 bg-panel"
                        : "border-border bg-panel-elevated",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checked}
                      onChange={() => toggleArea(area.key)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <PbIcon
                          icon={iconKeyForName(area.name) ?? "folder-tree"}
                          size={24}
                          className="h-4 w-4 text-muted md:h-6 md:w-6"
                        />
                        <span className="font-medium">{area.name}</span>
                        {area.isCustom ? (
                          <span className="text-[10px] uppercase text-muted">
                            Custom
                          </span>
                        ) : null}
                      </div>
                      {reasoning ? (
                        <p className="mt-1 text-xs text-muted/80">{reasoning}</p>
                      ) : null}
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="flex gap-2">
              <Input
                value={customAreaName}
                onChange={(e) => setCustomAreaName(e.target.value)}
                placeholder="Add custom project area"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  const name = customAreaName.trim();
                  if (!name) return;
                  const key = `custom-area:${name}:${customAreas.length}`;
                  const area: AreaSelection = {
                    key,
                    name,
                    isCustom: true,
                  };
                  setCustomAreas((prev) => [...prev, area]);
                  setSelectedAreaKeys((prev) => new Set(prev).add(key));
                  setCustomAreaName("");
                }}
              >
                Add
              </Button>
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <p className="max-w-prose text-sm text-muted">
              What should the game emphasize? Design Focuses are analysis
              criteria with target importance — not Project Structure folders.
              Adjust freely; values are independent and need not sum to 100.
            </p>
            <div className="space-y-5">
              {(
                [
                  ...[primaryGenreKey, ...secondaryGenreKeys]
                    .filter(Boolean)
                    .map((genreKey) => ({
                      genreKey,
                      label:
                        genreKey === primaryGenreKey
                          ? `Primary · ${getGenreTemplate(genreKey)?.name ?? genreKey}`
                          : `Secondary · ${getGenreTemplate(genreKey)?.name ?? genreKey}`,
                      focuses: allFocuses.filter(
                        (f) => f.templateSource === genreKey,
                      ),
                    })),
                  {
                    genreKey: "custom",
                    label: "Custom focuses",
                    focuses: allFocuses.filter((f) => f.isCustom),
                  },
                ] as const
              )
                .filter((group) => group.focuses.length > 0)
                .map((group) => (
                  <div key={group.genreKey} className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-nav">
                      {group.label}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {group.focuses.map((focus) => {
                        const checked = selectedFocusKeys.has(focus.key);
                        const reasoning =
                          focusReasoning[focus.key] ?? focus.reasoning;
                        return (
                          <div
                            key={focus.key}
                            className={cn(
                              "rounded-[var(--radius)] border px-3 py-3",
                              checked
                                ? "border-nav/50 bg-panel"
                                : "border-border bg-panel-elevated",
                            )}
                          >
                            <label className="flex cursor-pointer items-start gap-3">
                              <input
                                type="checkbox"
                                className="mt-1"
                                checked={checked}
                                onChange={() => toggleFocus(focus.key, focus)}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <PbIcon
                                    icon={
                                      iconKeyForName(focus.name) ??
                                      iconKeyForGenre(focus.templateSource) ??
                                      "target"
                                    }
                                    size={14}
                                    className="text-muted"
                                  />
                                  <span className="font-medium">
                                    {focus.parentName
                                      ? `${focus.parentName} → `
                                      : ""}
                                    {focus.name}
                                  </span>
                                  {focus.isCustom ? (
                                    <span className="text-[10px] uppercase text-muted">
                                      Custom
                                    </span>
                                  ) : null}
                                </div>
                                {focus.description ? (
                                  <p className="mt-1 text-xs leading-snug text-muted">
                                    {focus.description}
                                  </p>
                                ) : null}
                                {reasoning ? (
                                  <p className="mt-1 text-xs text-muted/80">
                                    {reasoning}
                                  </p>
                                ) : null}
                                {checked ? (
                                  <div className="mt-3">
                                    <div className="mb-1 flex justify-between text-xs text-muted">
                                      <span>Target importance</span>
                                      <span>
                                        {importance[focus.key] ??
                                          focus.targetImportance}
                                      </span>
                                    </div>
                                    <input
                                      type="range"
                                      min={0}
                                      max={100}
                                      value={
                                        importance[focus.key] ??
                                        focus.targetImportance
                                      }
                                      onChange={(e) =>
                                        setImportance((prev) => ({
                                          ...prev,
                                          [focus.key]: Number(e.target.value),
                                        }))
                                      }
                                      className="w-full accent-[var(--accent)]"
                                    />
                                    <p className="mt-1 text-[11px] leading-snug text-muted">
                                      {IMPORTANCE_SLIDER_FALLBACK}
                                    </p>
                                  </div>
                                ) : null}
                              </div>
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
            </div>

            <div className="flex gap-2">
              <Input
                value={customFocusName}
                onChange={(e) => setCustomFocusName(e.target.value)}
                placeholder="Add custom design focus"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  const name = customFocusName.trim();
                  if (!name) return;
                  const key = `custom:${name}:${customFocuses.length}`;
                  const focus: FocusSelection = {
                    key,
                    name,
                    targetImportance: 50,
                    isCustom: true,
                  };
                  setCustomFocuses((prev) => [...prev, focus]);
                  setSelectedFocusKeys((prev) => new Set(prev).add(key));
                  setImportance((prev) => ({ ...prev, [key]: 50 }));
                  setCustomFocusName("");
                }}
              >
                Add
              </Button>
            </div>
          </>
        ) : null}

        {step === 4 ? (
          <div className="space-y-4 text-sm">
            <div className="surface-card p-4">
              <p className="text-xs uppercase tracking-wide text-muted">Intent</p>
              <p className="mt-2 whitespace-pre-wrap leading-relaxed">
                {intent || "—"}
              </p>
            </div>
            <div className="surface-card p-4">
              <p className="text-xs uppercase tracking-wide text-muted">
                Primary genre
              </p>
              <p className="mt-1 font-medium">
                {getGenreTemplate(primaryGenreKey)?.name ?? "—"}
              </p>
              {secondaryGenreKeys.length > 0 ? (
                <>
                  <p className="mt-4 text-xs uppercase tracking-wide text-muted">
                    Secondary / influences
                  </p>
                  <p className="mt-1">
                    {secondaryGenreKeys
                      .map((k) => getGenreTemplate(k)?.name ?? k)
                      .join(", ")}
                  </p>
                </>
              ) : null}
              {customGameType ? (
                <>
                  <p className="mt-4 text-xs uppercase tracking-wide text-muted">
                    Custom game type
                  </p>
                  <p className="mt-1">{customGameType}</p>
                </>
              ) : null}
            </div>
            <div className="surface-card p-4">
              <p className="text-xs uppercase tracking-wide text-muted">
                Project Areas ({selectedAreaKeys.size})
              </p>
              <p className="mt-1 text-xs text-muted">
                Structural folders in Focus Space — no importance.
              </p>
              <ul className="mt-2 space-y-1">
                {allAreas
                  .filter((a) => selectedAreaKeys.has(a.key))
                  .map((a) => (
                    <li key={a.key}>{a.name}</li>
                  ))}
              </ul>
            </div>
            <div className="surface-card p-4">
              <p className="text-xs uppercase tracking-wide text-muted">
                Design Focuses ({selectedFocusKeys.size})
              </p>
              <p className="mt-1 text-xs text-muted">
                Emphasis criteria with target importance — separate from structure.
              </p>
              <ul className="mt-2 space-y-1">
                {allFocuses
                  .filter((f) => selectedFocusKeys.has(f.key))
                  .map((f) => (
                    <li key={f.key}>
                      {f.parentName ? `${f.parentName} → ` : ""}
                      {f.name}{" "}
                      <span className="text-muted">
                        · target {importance[f.key] ?? f.targetImportance}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        ) : null}

        <FieldError>{error}</FieldError>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={step === 0 || busy}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              Back
            </Button>
          </div>
          {step === 0 ? (
            <Button
              type="button"
              disabled={!intent.trim() || busy}
              onClick={generateAndContinue}
            >
              {suggesting ? "Generating suggestions…" : "Generate suggestions"}
            </Button>
          ) : step < steps.length - 1 ? (
            <Button
              type="button"
              disabled={
                busy ||
                (step === 1 && !primaryGenreKey) ||
                (step === 1 &&
                  primaryGenreKey === "custom" &&
                  !customGameType.trim()) ||
                (step === 2 && selectedAreaKeys.size === 0)
              }
              onClick={() => setStep((s) => s + 1)}
            >
              Continue
            </Button>
          ) : (
            <Button type="button" disabled={busy} onClick={submit}>
              {pending ? "Saving…" : "Finish setup"}
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={leaveOpen}
        title="Leave project setup?"
        message={
          hasProgressBeyondStart()
            ? `Discard draft project “${projectName}” and return home? Setup progress will be lost and the draft will be deleted.`
            : `Leave setup and delete draft project “${projectName}”?`
        }
        cancelLabel="Stay"
        confirmLabel={cancelling ? "Discarding…" : "Leave"}
        pending={cancelling}
        onCancel={() => setLeaveOpen(false)}
        onConfirm={confirmLeaveSetup}
      />
    </div>
  );
}
