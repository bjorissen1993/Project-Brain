"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FieldError, Label, Textarea } from "@/components/ui/field";
import {
  respondToDirectionCheckAction,
  runDirectionCheckAction,
  runFullProjectAnalysisAction,
  type getIntelligenceOverview,
} from "@/features/intelligence/actions";

type Overview = Awaited<ReturnType<typeof getIntelligenceOverview>>;

export function IntelligencePanel({
  projectId,
  overview,
}: {
  projectId: string;
  overview: Overview;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [response, setResponse] = useState("");

  const awaiting = overview.directionChecks.find(
    (d) => d.status === "awaiting_response",
  );
  const awaitingResult = awaiting?.result as
    | { question?: string; observations?: string[]; aligned?: boolean }
    | null
    | undefined;

  const full = overview.fullAnalysis?.result as
    | {
        executiveSummary?: string;
        intentAlignment?: { score?: number; notes?: string[] };
        balanceNarrative?: string;
        strengths?: string[];
        risks?: string[];
        recommendedFocusAreas?: string[];
        gamePhaseNotes?: string;
      }
    | null
    | undefined;

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-8">
      <div>
        <h1 className="font-display text-3xl">Project intelligence</h1>
        <p className="mt-2 text-sm text-muted">
          Direction checks, recent-idea skew, game-phase distribution, and
          optional deep analysis. Intent remains source of truth.
        </p>
        <p className="mt-2 text-xs text-muted">
          <Link
            href={`/projects/${projectId}/profile#intent`}
            className="text-accent underline"
          >
            Intent history
          </Link>
          {" · "}
          <Link
            href={`/projects/${projectId}/balance`}
            className="text-accent underline"
          >
            Balance
          </Link>
        </p>
      </div>

      <FieldError>{error}</FieldError>
      {message ? <p className="text-xs text-accent">{message}</p> : null}

      <section className="surface-card space-y-3 px-4 py-4">
        <h2 className="font-display text-xl">Recent idea analysis</h2>
        {overview.recentSkew.observation ? (
          <p className="text-sm leading-relaxed">
            {overview.recentSkew.observation}
          </p>
        ) : (
          <p className="text-sm text-muted">
            No strong skew detected in the last {overview.recentSkew.sampleSize}{" "}
            relevant nodes.
          </p>
        )}
        <ul className="space-y-1 text-xs text-muted">
          {overview.recentSkew.primaryFocusCounts.slice(0, 6).map((f) => (
            <li key={f.focusId}>
              {f.name}: {f.count} ({f.share}%)
            </li>
          ))}
        </ul>
      </section>

      <section className="surface-card space-y-3 px-4 py-4">
        <h2 className="font-display text-xl">Game phase analysis</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {overview.phaseAnalysis.counts.map((c) => (
            <div key={c.phase} className="rounded bg-panel-elevated px-2 py-2 text-center">
              <p className="text-lg font-semibold">{c.count}</p>
              <p className="text-[10px] uppercase text-muted">
                {c.phase} · {c.share}%
              </p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted">
          Untagged: {overview.phaseAnalysis.untagged}
        </p>
        {overview.phaseAnalysis.observation ? (
          <p className="text-sm">{overview.phaseAnalysis.observation}</p>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-xl">Direction check</h2>
            <p className="text-xs text-muted">
              Occasional — not constant.{" "}
              {overview.directionTrigger.shouldTrigger
                ? `Suggested now: ${overview.directionTrigger.reasons.join(", ")}`
                : "No strong trigger right now (you can still run manually)."}
            </p>
          </div>
          <Button
            disabled={pending}
            onClick={() => {
              setError(null);
              setMessage(null);
              startTransition(async () => {
                const r = await runDirectionCheckAction(projectId);
                if (!r.ok) {
                  setError(r.error);
                  return;
                }
                setMessage(r.message);
                router.refresh();
              });
            }}
          >
            Run direction check
          </Button>
        </div>

        {awaiting && awaitingResult?.question ? (
          <div className="surface-card space-y-3 px-4 py-4">
            <p className="text-sm font-semibold">{awaitingResult.question}</p>
            {awaitingResult.observations?.length ? (
              <ul className="list-disc space-y-1 pl-5 text-xs text-muted">
                {awaitingResult.observations.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            ) : null}
            <Label htmlFor="dir-response">Your response</Label>
            <Textarea
              id="dir-response"
              rows={4}
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              placeholder="Free-text — appended to Project Intent history"
            />
            <Button
              disabled={pending || !response.trim()}
              onClick={() => {
                startTransition(async () => {
                  const r = await respondToDirectionCheckAction({
                    directionCheckId: awaiting.id,
                    response,
                    updateIntent: true,
                  });
                  if (!r.ok) {
                    setError(r.error);
                    return;
                  }
                  setResponse("");
                  setMessage("Response saved to intent history.");
                  router.refresh();
                });
              }}
            >
              Save response
            </Button>
          </div>
        ) : null}

        {overview.directionChecks.length ? (
          <ul className="space-y-2 text-xs text-muted">
            {overview.directionChecks.slice(0, 5).map((d) => (
              <li key={d.id} className="surface-card px-3 py-2">
                {d.status} · {new Date(d.createdAt).toLocaleString()}
                {d.intentVersion != null ? ` · intent v${d.intentVersion}` : ""}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-xl">Full project analysis</h2>
            <p className="text-xs text-muted">
              Manual only · deep model · selective summarized context
            </p>
          </div>
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => {
              setError(null);
              setMessage(null);
              startTransition(async () => {
                const r = await runFullProjectAnalysisAction(projectId);
                if (!r.ok) {
                  setError(r.error);
                  return;
                }
                setMessage(r.message);
                router.refresh();
              });
            }}
          >
            Run full analysis
          </Button>
        </div>

        {overview.fullAnalysis?.status === "deferred" ? (
          <div className="rounded-[var(--radius)] border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
            Analysis pending — configure OPENAI_API_KEY
          </div>
        ) : null}

        {full?.executiveSummary ? (
          <div className="surface-card space-y-3 px-4 py-4 text-sm">
            <p className="leading-relaxed">{full.executiveSummary}</p>
            {full.intentAlignment ? (
              <p className="text-xs text-muted">
                Intent alignment: {full.intentAlignment.score}/100
              </p>
            ) : null}
            {full.balanceNarrative ? (
              <p className="text-muted">{full.balanceNarrative}</p>
            ) : null}
            {full.strengths?.length ? (
              <div>
                <p className="font-semibold">Strengths</p>
                <ul className="mt-1 list-disc pl-5 text-muted">
                  {full.strengths.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {full.risks?.length ? (
              <div>
                <p className="font-semibold">Risks</p>
                <ul className="mt-1 list-disc pl-5 text-muted">
                  {full.risks.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {full.recommendedFocusAreas?.length ? (
              <div>
                <p className="font-semibold">Recommended focus</p>
                <ul className="mt-1 list-disc pl-5 text-muted">
                  {full.recommendedFocusAreas.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {full.gamePhaseNotes ? (
              <p className="text-xs text-muted">{full.gamePhaseNotes}</p>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
