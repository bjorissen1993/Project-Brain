"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, Label, Textarea } from "@/components/ui/field";
import { updateIntentAction } from "@/features/projects/actions";

type IntentVersion = {
  id: string;
  version: number;
  content: string;
  isOriginal: boolean;
  reason?: string | null;
  createdAt: string | Date;
};

const HISTORY_PAGE_SIZE = 3;

function composeEffectiveIntent(versions: IntentVersion[]): string {
  if (versions.length === 0) return "";
  // Latest version already stores stacked/composed content when saved as amendment.
  const latest = versions[versions.length - 1];
  return latest?.content ?? "";
}

export function IntentEditor({
  projectId,
  versions,
  embedded = false,
}: {
  projectId: string;
  versions: IntentVersion[];
  /** When true, omit page chrome for embedding in Project Profile. */
  embedded?: boolean;
}) {
  const router = useRouter();
  const effective = useMemo(() => composeEffectiveIntent(versions), [versions]);
  const [amendment, setAmendment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPage, setHistoryPage] = useState(0);

  const historyNewestFirst = useMemo(
    () => [...versions].reverse(),
    [versions],
  );
  const pageCount = Math.max(
    1,
    Math.ceil(historyNewestFirst.length / HISTORY_PAGE_SIZE),
  );
  const safePage = Math.min(historyPage, pageCount - 1);
  const pageItems = historyNewestFirst.slice(
    safePage * HISTORY_PAGE_SIZE,
    safePage * HISTORY_PAGE_SIZE + HISTORY_PAGE_SIZE,
  );

  return (
    <div
      className={
        embedded ? "space-y-6" : "mx-auto w-full max-w-[1600px] space-y-8 px-6 py-8"
      }
    >
      {!embedded ? (
        <div>
          <h1 className="font-display text-3xl">Project Intent</h1>
          <p className="mt-2 text-sm text-muted">
            The creator&apos;s stated intention is the source of truth. Amendments
            stack as new versions — history is never overwritten.
          </p>
        </div>
      ) : null}

      <section className="surface-card bg-panel-elevated p-4">
        <p className="text-xs uppercase tracking-wide text-muted">
          Effective intent
          {versions.length > 0
            ? ` · v${versions[versions.length - 1]!.version}`
            : ""}
        </p>
        {effective ? (
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
            {effective}
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted">
            No intent yet. Add an amendment below to create the first version.
          </p>
        )}
      </section>

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          setMessage(null);
          startTransition(async () => {
            const result = await updateIntentAction({
              projectId,
              content: amendment,
              reason: "amendment",
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setMessage("Amendment saved as a new intent version.");
            setAmendment("");
            router.refresh();
          });
        }}
      >
        <div>
          <Label htmlFor="intent-amendment">Current intent</Label>
          <p className="mt-1 text-xs text-muted">
            Enter text that amends the intent. It stacks on the existing wording
            unless you explicitly describe what should change or be removed.
          </p>
        </div>
        <Textarea
          id="intent-amendment"
          rows={6}
          value={amendment}
          onChange={(e) => setAmendment(e.target.value)}
          placeholder="Add or clarify intent…"
          className="min-h-[140px] leading-relaxed"
        />
        <FieldError>{error}</FieldError>
        {message ? <p className="text-xs text-accent">{message}</p> : null}
        <Button type="submit" disabled={pending || !amendment.trim()}>
          {pending ? "Saving…" : "Save amendment"}
        </Button>
      </form>

      {versions.length > 0 ? (
        <section className="space-y-3 border-t border-border pt-6">
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            className="flex w-full items-center gap-2 text-left"
            aria-expanded={historyOpen}
          >
            <span className="text-muted" aria-hidden>
              {historyOpen ? (
                <ChevronDown size={16} />
              ) : (
                <ChevronRight size={16} />
              )}
            </span>
            <span>
              <span className="font-display text-xl">Version history</span>
              <span className="ml-2 text-xs text-muted">
                {versions.length} version{versions.length === 1 ? "" : "s"}
              </span>
            </span>
          </button>

          {historyOpen ? (
            <div className="space-y-3">
              <ul className="max-h-[22rem] space-y-3 overflow-y-auto pr-1">
                {pageItems.map((version) => (
                  <li
                    key={version.id}
                    className="surface-card px-3 py-3 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs text-muted">
                      <span>
                        v{version.version}
                        {version.isOriginal ? " · original" : ""}
                        {version.reason ? ` · ${version.reason}` : ""}
                      </span>
                      <span>
                        {new Date(version.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                      {version.content}
                    </p>
                  </li>
                ))}
              </ul>
              {pageCount > 1 ? (
                <div className="flex items-center justify-between gap-3 text-xs text-muted">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={safePage <= 0}
                    onClick={() => setHistoryPage((p) => Math.max(0, p - 1))}
                  >
                    Newer
                  </Button>
                  <span>
                    Page {safePage + 1} of {pageCount}
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={safePage >= pageCount - 1}
                    onClick={() =>
                      setHistoryPage((p) => Math.min(pageCount - 1, p + 1))
                    }
                  >
                    Older
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
