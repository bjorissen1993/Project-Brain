"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/field";
import {
  GENRE_TEMPLATES,
  getGenreTemplate,
} from "@/features/game-profile/genre-templates";
import { updateProjectGenresAction } from "@/features/projects/actions";
import type { GenreIntentAlignment } from "@/features/ai/genre-intent-alignment-schema";
import { cn } from "@/lib/utils";

type GenreRow = {
  role: string;
  genre: { name: string; slug?: string; templateKey?: string };
};

export function GenreEditor({
  projectId,
  genres,
  customGameType: initialCustomGameType,
}: {
  projectId: string;
  genres: GenreRow[];
  customGameType?: string | null;
}) {
  const router = useRouter();
  const initialPrimary =
    genres.find((g) => g.role === "PRIMARY")?.genre.slug ??
    genres.find((g) => g.role === "PRIMARY")?.genre.templateKey ??
    "";
  const initialSecondary = genres
    .filter((g) => g.role !== "PRIMARY")
    .map((g) => g.genre.slug ?? g.genre.templateKey ?? "")
    .filter(Boolean);

  const [primaryGenreKey, setPrimaryGenreKey] = useState(initialPrimary);
  const [secondaryGenreKeys, setSecondaryGenreKeys] =
    useState<string[]>(initialSecondary);
  const [customGameType, setCustomGameType] = useState(
    initialCustomGameType ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [mismatch, setMismatch] = useState<GenreIntentAlignment | null>(null);

  const dirty = useMemo(() => {
    const secA = [...secondaryGenreKeys].sort().join(",");
    const secB = [...initialSecondary].sort().join(",");
    return (
      primaryGenreKey !== initialPrimary ||
      secA !== secB ||
      (customGameType.trim() || "") !== (initialCustomGameType?.trim() || "")
    );
  }, [
    primaryGenreKey,
    secondaryGenreKeys,
    customGameType,
    initialPrimary,
    initialSecondary,
    initialCustomGameType,
  ]);

  const toggleSecondary = (key: string) => {
    setSecondaryGenreKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
    setMismatch(null);
  };

  const save = (confirmMismatch: boolean) => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await updateProjectGenresAction({
        projectId,
        primaryGenreKey,
        secondaryGenreKeys,
        customGameType: customGameType.trim() || undefined,
        confirmMismatch,
      });
      if (!result.ok) {
        if (result.needsConfirmation && result.alignment) {
          setMismatch(result.alignment);
          setError(null);
          return;
        }
        setError(result.error);
        return;
      }
      setMismatch(null);
      setMessage("Genres saved.");
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Primary genre</Label>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {GENRE_TEMPLATES.map((genre) => (
            <button
              key={genre.key}
              type="button"
              onClick={() => {
                setPrimaryGenreKey(genre.key);
                setSecondaryGenreKeys((prev) =>
                  prev.filter((k) => k !== genre.key),
                );
                setMismatch(null);
              }}
              className={cn(
                "rounded-[var(--radius)] border px-3 py-3 text-left text-sm transition",
                primaryGenreKey === genre.key
                  ? "border-nav bg-nav-muted"
                  : "border-border bg-panel hover:border-border-strong",
              )}
            >
              <div className="font-medium">{genre.name}</div>
              <p className="mt-1 text-xs text-muted">{genre.description}</p>
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label>Secondary genres / influences</Label>
        <div className="mt-2 flex flex-wrap gap-2">
          {GENRE_TEMPLATES.filter((g) => g.key !== primaryGenreKey).map(
            (genre) => {
              const active = secondaryGenreKeys.includes(genre.key);
              return (
                <button
                  key={genre.key}
                  type="button"
                  disabled={!primaryGenreKey}
                  onClick={() => toggleSecondary(genre.key)}
                  className={cn(
                    "rounded-[var(--radius)] border px-3 py-1 text-xs font-medium transition",
                    active
                      ? "border-nav bg-nav-muted text-nav"
                      : "border-border text-muted hover:text-foreground",
                  )}
                >
                  {genre.name}
                </button>
              );
            },
          )}
        </div>
      </div>

      {(primaryGenreKey === "custom" ||
        secondaryGenreKeys.includes("custom")) && (
        <div>
          <Label htmlFor="profile-custom-game-type">Custom game type</Label>
          <Input
            id="profile-custom-game-type"
            value={customGameType}
            onChange={(e) => {
              setCustomGameType(e.target.value);
              setMismatch(null);
            }}
            placeholder="Describe the experience in your own terms"
          />
        </div>
      )}

      {mismatch ? (
        <div className="rounded-[var(--radius)] border border-accent/40 bg-accent/5 px-4 py-3 text-sm">
          <p className="font-medium text-foreground">Genre / intent mismatch</p>
          <p className="mt-1 text-muted">{mismatch.message}</p>
          {mismatch.suggestedPrimaryGenreKey ? (
            <p className="mt-2 text-xs text-muted">
              Intent leans toward{" "}
              <span className="text-foreground">
                {getGenreTemplate(mismatch.suggestedPrimaryGenreKey)?.name ??
                  mismatch.suggestedPrimaryGenreKey}
              </span>
              {mismatch.suggestedSecondaryGenreKeys.length > 0
                ? ` (+ ${mismatch.suggestedSecondaryGenreKeys
                    .map((k) => getGenreTemplate(k)?.name ?? k)
                    .join(", ")})`
                : ""}
              . Source:{" "}
              {mismatch.source === "heuristic"
                ? "heuristic (no API key / fallback)"
                : "AI"}
              .
            </p>
          ) : null}
          {mismatch.reasons.length > 0 ? (
            <ul className="mt-2 list-inside list-disc text-xs text-muted">
              {mismatch.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={pending}
              onClick={() => save(true)}
            >
              {pending ? "Saving…" : "Accept — keep my genres"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => setMismatch(null)}
            >
              Adjust genres
            </Button>
          </div>
        </div>
      ) : null}

      <FieldError>{error}</FieldError>
      {message ? <p className="text-xs text-accent">{message}</p> : null}

      {!mismatch ? (
        <Button
          type="button"
          disabled={pending || !primaryGenreKey || !dirty}
          onClick={() => save(false)}
        >
          {pending ? "Checking…" : "Save genres"}
        </Button>
      ) : null}
    </div>
  );
}
