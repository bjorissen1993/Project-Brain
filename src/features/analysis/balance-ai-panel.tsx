"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import {
  listPendingImprovements,
  resolveImprovementSuggestionAction,
  runImbalanceAnalysisAction,
  runImprovementSuggestionsAction,
} from "@/features/analysis/project-analysis-actions";

type ImbalanceView = {
  id: string;
  status: string;
  model: string | null;
  createdAt: string;
  result: unknown;
} | null;

type ImprovementRow = Awaited<
  ReturnType<typeof listPendingImprovements>
>[number];

export function BalanceAIPanel({
  projectId,
  imbalance,
  improvements,
}: {
  projectId: string;
  imbalance: ImbalanceView;
  improvements: ImprovementRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const findings =
    imbalance?.result &&
    typeof imbalance.result === "object" &&
    imbalance.result !== null &&
    "findings" in imbalance.result
      ? (
          imbalance.result as {
            findings: {
              title: string;
              description: string;
              severity: string;
              suggestedAction?: string;
            }[];
            summary?: string;
          }
        )
      : null;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-xl">AI design analysis</h2>
          <p className="text-xs text-muted">
            Narrates code-computed balance. Suggestions never auto-apply.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => {
              setError(null);
              setMessage(null);
              startTransition(async () => {
                const r = await runImbalanceAnalysisAction(projectId);
                if (!r.ok) {
                  setError(r.error);
                  return;
                }
                setMessage(r.message);
                router.refresh();
              });
            }}
          >
            Analyze imbalance
          </Button>
          <Button
            disabled={pending}
            onClick={() => {
              setError(null);
              setMessage(null);
              startTransition(async () => {
                const r = await runImprovementSuggestionsAction(projectId);
                if (!r.ok) {
                  setError(r.error);
                  return;
                }
                setMessage(r.message);
                router.refresh();
              });
            }}
          >
            Suggest improvements
          </Button>
        </div>
      </div>

      <FieldError>{error}</FieldError>
      {message ? <p className="text-xs text-accent">{message}</p> : null}

      {imbalance?.status === "deferred" ? (
        <div className="rounded-[var(--radius)] border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          Analysis pending — configure OPENAI_API_KEY
        </div>
      ) : null}

      {findings ? (
        <div className="surface-card space-y-3 px-4 py-4">
          {findings.summary ? (
            <p className="text-sm leading-relaxed">{findings.summary}</p>
          ) : null}
          <ul className="space-y-2">
            {findings.findings.map((f, i) => (
              <li key={i} className="border-t border-border pt-2 text-sm">
                <p className="font-semibold">
                  <span className="mr-2 text-xs uppercase text-muted">
                    {f.severity}
                  </span>
                  {f.title}
                </p>
                <p className="mt-1 text-muted">{f.description}</p>
                {f.suggestedAction ? (
                  <p className="mt-1 text-xs text-nav">{f.suggestedAction}</p>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-muted">
            {imbalance?.model} · {imbalance?.createdAt
              ? new Date(imbalance.createdAt).toLocaleString()
              : ""}
          </p>
        </div>
      ) : null}

      {improvements.length ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Improvement suggestions</h3>
          {improvements.map((s) => (
            <div key={s.id} className="surface-card px-3 py-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">
                    {s.category} · {s.priority} · {s.status}
                  </p>
                  <p className="mt-1 font-semibold">{s.title}</p>
                  <p className="mt-1 text-muted">{s.description}</p>
                  <p className="mt-1 text-xs text-muted">{s.rationale}</p>
                </div>
                {s.status === "pending" ? (
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      disabled={pending}
                      onClick={() => {
                        startTransition(async () => {
                          await resolveImprovementSuggestionAction({
                            suggestionId: s.id,
                            decision: "accept",
                          });
                          router.refresh();
                        });
                      }}
                    >
                      Accept
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={pending}
                      onClick={() => {
                        startTransition(async () => {
                          await resolveImprovementSuggestionAction({
                            suggestionId: s.id,
                            decision: "reject",
                          });
                          router.refresh();
                        });
                      }}
                    >
                      Reject
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
