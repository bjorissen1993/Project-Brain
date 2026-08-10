"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FieldError, Input, Label, Textarea } from "@/components/ui/field";
import {
  abandonProjectSetupAction,
  completeGenericSetupAction,
} from "@/features/projects/actions";
import { suggestSetupFromIntentAction } from "@/features/game-profile/actions";
import { IMPORTANCE_SLIDER_FALLBACK } from "@/features/game-profile/genre-templates";
import {
  getProjectTypeAreas,
  getProjectTypeFocusTemplates,
  projectTypeSetupLabel,
} from "@/features/projects/type-templates";
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
import { iconKeyForName, PbIcon } from "@/lib/icons";
import { PROJECT_TYPE_OPTIONS, type ProjectType } from "@/types";
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
Build a calm personal finance app that helps people feel in control of irregular income — clear cash-flow views, gentle reminders, and no shamey “you overspent” tone. Optimize for trust, clarity, and low cognitive load. Avoid dark patterns, aggressive upsells, and noisy dashboards.`;

function flattenTypeFocuses(projectType: ProjectType): FocusSelection[] {
  return getProjectTypeFocusTemplates(projectType).flatMap((focus) => {
    const parent: FocusSelection = {
      key: `${projectType}:${focus.name}`,
      name: focus.name,
      targetImportance: focus.defaultImportance ?? 50,
      templateSource: projectType,
      isCustom: false,
      description: focus.description,
    };
    const children = (focus.children ?? []).map((child) => ({
      key: `${projectType}:${focus.name}:${child.name}`,
      name: child.name,
      parentName: focus.name,
      targetImportance: child.defaultImportance ?? 50,
      templateSource: projectType,
      isCustom: false,
      description: child.description,
    }));
    return [parent, ...children];
  });
}

function flattenTypeAreas(projectType: ProjectType): AreaSelection[] {
  return getProjectTypeAreas(projectType).map((name) => ({
    key: `${projectType}:${name}`,
    name,
    templateSource: projectType,
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

export function GenericSetupWizard({
  projectId,
  projectName,
  projectType,
}: {
  projectId: string;
  projectName: string;
  projectType: Exclude<ProjectType, "GAME">;
}) {
  const router = useRouter();
  const typeLabel =
    PROJECT_TYPE_OPTIONS.find((o) => o.value === projectType)?.label ??
    projectTypeSetupLabel(projectType);

  const [step, setStep] = useState(0);
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
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [suggesting, startSuggestTransition] = useTransition();
  const [cancelling, startCancelTransition] = useTransition();

  const busy = pending || suggesting || cancelling;

  const templateFocuses = useMemo(
    () => flattenTypeFocuses(projectType),
    [projectType],
  );
  const templateAreas = useMemo(
    () => flattenTypeAreas(projectType),
    [projectType],
  );

  const allFocuses = useMemo(
    () => [...templateFocuses, ...customFocuses],
    [templateFocuses, customFocuses],
  );
  const allAreas = useMemo(
    () => [...templateAreas, ...customAreas],
    [templateAreas, customAreas],
  );

  const steps = ["Intent", "Project Areas", "Design Focus", "Review"];

  function hasProgressBeyondStart() {
    return (
      step > 0 ||
      intent.trim().length > 0 ||
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

  function clearSuggestionState() {
    // Restore type defaults (not empty) so the creator can continue without AI.
    const defaultAreas = new Set(templateAreas.map((a) => a.key));
    const defaultFocuses = new Set(templateFocuses.map((f) => f.key));
    const defaultImportance: Record<string, number> = {};
    for (const f of templateFocuses) {
      defaultImportance[f.key] = f.targetImportance;
    }
    setSelectedFocusKeys(defaultFocuses);
    setImportance(defaultImportance);
    setFocusReasoning({});
    setCustomFocuses([]);
    setSelectedAreaKeys(defaultAreas);
    setAreaReasoning({});
    setCustomAreas([]);
    setSuggestionMeta(null);
  }

  function applySuggestion(data: SetupSuggestionData) {
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

    for (const focus of templateFocuses) {
      if (nextImportance[focus.key] === undefined) {
        nextImportance[focus.key] = focus.targetImportance;
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
      const templateMatch = templateAreas.find(
        (a) => a.name.toLowerCase() === area.name.toLowerCase(),
      );
      const resolvedKey = templateMatch?.key ?? key;
      if (area.selected) nextAreaSelected.add(resolvedKey);
      if (area.reasoning) nextAreaReasoning[resolvedKey] = area.reasoning;
    });

    // Default: select all type areas if AI omitted selections
    if (nextAreaSelected.size === 0) {
      for (const area of templateAreas) nextAreaSelected.add(area.key);
    }

    setCustomFocuses(nextCustomFocuses);
    setSelectedFocusKeys(nextFocusSelected);
    setImportance(nextImportance);
    setFocusReasoning(nextFocusReasoning);
    setCustomAreas(nextCustomAreas);
    setSelectedAreaKeys(nextAreaSelected);
    setAreaReasoning(nextAreaReasoning);
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
      setError("Describe what this project should become first.");
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
      const result = await completeGenericSetupAction({
        projectId,
        selectedProjectAreas,
        selectedFocuses,
        intent,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
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
          {projectName} · {typeLabel} configuration
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
      <h1 className="mt-3 font-display text-3xl">Configure your project</h1>
      <p className="mt-2 max-w-prose text-sm text-muted">
        Intent first, then Project Areas and Design Focus. Suggestions are
        advisory — accept, edit, or reject before anything is saved. Genre
        templates stay on Game projects.
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
            <Button type="button" variant="ghost" onClick={clearSuggestionState}>
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
              Your wording is the source of truth. We&apos;ll suggest Project Areas
              and Design Focus sliders from it; you decide what to keep.
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
            <p className="max-w-prose text-sm text-muted">
              What sections do you want to organize this project around? These
              become top-level folders in Project Structure (Focus Space). No
              importance sliders — areas are where ideas live, not what the
              project emphasizes.
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

        {step === 2 ? (
          <>
            <p className="max-w-prose text-sm text-muted">
              What should this project emphasize? Design Focuses are analysis
              criteria with target importance — not Project Structure folders.
              Adjust freely; values are independent and need not sum to 100.
            </p>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {allFocuses.map((focus) => {
                const checked = selectedFocusKeys.has(focus.key);
                const reasoning = focusReasoning[focus.key] ?? focus.reasoning;
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
                            icon={iconKeyForName(focus.name) ?? "target"}
                            size={24}
                            className="h-4 w-4 text-muted md:h-6 md:w-6"
                          />
                          <span className="font-medium">
                            {focus.parentName ? `${focus.parentName} → ` : ""}
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
                          <p className="mt-1 text-xs text-muted/80">{reasoning}</p>
                        ) : null}
                        {checked ? (
                          <div className="mt-3">
                            <div className="mb-1 flex justify-between text-xs text-muted">
                              <span>Target importance</span>
                              <span>
                                {importance[focus.key] ?? focus.targetImportance}
                              </span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              value={
                                importance[focus.key] ?? focus.targetImportance
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

        {step === 3 ? (
          <div className="space-y-4 text-sm">
            <div className="surface-card p-4">
              <p className="text-xs uppercase tracking-wide text-muted">Intent</p>
              <p className="mt-2 whitespace-pre-wrap leading-relaxed">
                {intent || "—"}
              </p>
            </div>
            <div className="surface-card p-4">
              <p className="text-xs uppercase tracking-wide text-muted">Type</p>
              <p className="mt-1 font-medium">{typeLabel}</p>
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
          <Button
            type="button"
            variant="ghost"
            disabled={step === 0 || busy}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            Back
          </Button>
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
              disabled={busy || (step === 1 && selectedAreaKeys.size === 0)}
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
