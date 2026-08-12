"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/field";
import {
  correctClassificationAction,
  reanalyzeNodeAction,
  resolveSuggestedRelationAction,
  type NodeAnalysisView,
} from "@/features/analysis/actions";
import { LOW_CONFIDENCE_THRESHOLD } from "@/features/ai/node-analysis-schema";
import { useLocale, useT } from "@/features/i18n";
import { cn } from "@/lib/utils";

export function NodeAIPanel({
  nodeId,
  nodeStatus,
  analysis,
  designFocusOptions,
}: {
  projectId: string;
  nodeId: string;
  nodeStatus: string;
  analysis: NodeAnalysisView | null;
  designFocusOptions: { id: string; name: string }[];
}) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editWeight, setEditWeight] = useState(50);
  const [editConfidence, setEditConfidence] = useState(70);
  const [moveFocusId, setMoveFocusId] = useState("");
  const [saveAsRule, setSaveAsRule] = useState(false);

  if (nodeStatus !== "READY") {
    return (
      <section className="space-y-2 border-t border-border pt-8">
        <h2 className="font-display text-xl">{t("analysis.nodeTitle")}</h2>
        <p className="text-sm text-muted">{t("analysis.nodeReadyGate")}</p>
      </section>
    );
  }

  const runReanalyze = () => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await reanalyzeNodeAction(nodeId, { locale });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage(result.message);
      router.refresh();
    });
  };

  return (
    <section className="space-y-5 border-t border-border pt-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">{t("analysis.nodeTitle")}</h2>
          <p className="mt-1 text-sm text-muted">{t("analysis.nodeAdvisory")}</p>
        </div>
        <Button
          variant="secondary"
          disabled={pending}
          onClick={runReanalyze}
        >
          {pending ? t("analysis.analyzing") : t("analysis.reanalyse")}
        </Button>
      </div>

      <FieldError>{error}</FieldError>
      {message ? <p className="text-xs text-accent">{message}</p> : null}

      {!analysis || analysis.analysisStatus === "none" ? (
        <div className="surface-card border-dashed px-4 py-4 text-sm text-muted">
          {t("analysis.noAnalysis")}
        </div>
      ) : null}

      {analysis?.analysisStatus === "deferred" ? (
        <div className="rounded-[var(--radius)] border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          {analysis.analysisMessage ?? t("analysis.pendingKey")}
        </div>
      ) : null}

      {analysis?.analysisStatus === "failed" ? (
        <div className="rounded-[var(--radius)] border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {analysis.analysisMessage ?? t("analysis.failed")}
          <div className="mt-2">
            <Button variant="secondary" disabled={pending} onClick={runReanalyze}>
              {t("analysis.retry")}
            </Button>
          </div>
        </div>
      ) : null}

      {analysis?.isOutdated || analysis?.analysisStatus === "outdated" ? (
        <div className="rounded-[var(--radius)] border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <p className="font-semibold text-warning">{t("analysis.outdated")}</p>
          <p className="mt-1 text-muted">{t("analysis.outdatedBody")}</p>
          <div className="mt-2">
            <Button variant="secondary" disabled={pending} onClick={runReanalyze}>
              {t("analysis.reanalyse")}
            </Button>
          </div>
        </div>
      ) : null}

      {analysis?.summary ? (
        <div className="surface-card space-y-3 p-4">
          <div>
            <p className="text-xs uppercase tracking-[0.08em] text-muted">
              Summary
            </p>
            <p className="mt-1 text-sm leading-relaxed">{analysis.summary}</p>
          </div>
          {analysis.projectImpact ? (
            <div>
              <p className="text-xs uppercase tracking-[0.08em] text-muted">
                Project impact
              </p>
              <p className="mt-1 text-sm leading-relaxed">
                {analysis.projectImpact}
              </p>
            </div>
          ) : null}
          {analysis.model ? (
            <p className="text-xs text-muted">
              Model {analysis.model}
              {analysis.analyzedAt
                ? ` · ${new Date(analysis.analyzedAt).toLocaleString(locale)}`
                : ""}
            </p>
          ) : null}
        </div>
      ) : null}

      {analysis && analysis.classifications.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Classifications</h3>
          <ul className="space-y-3">
            {analysis.classifications.map((c) => {
              const low =
                c.confidence != null &&
                c.confidence < LOW_CONFIDENCE_THRESHOLD;
              return (
                <li
                  key={c.id}
                  className={cn(
                    "surface-card space-y-3 p-4",
                    low && "border-warning/50",
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{c.focusName}</p>
                      <p className="mt-1 text-xs text-muted">
                        Weight {Math.round(c.weight)}% · Confidence{" "}
                        {c.confidence != null
                          ? `${Math.round(c.confidence)}%`
                          : "—"}{" "}
                        · source={c.source}
                        {c.status !== "proposed" ? ` · ${c.status}` : ""}
                        {low ? " · low confidence" : ""}
                      </p>
                    </div>
                  </div>
                  {c.reasoning ? (
                    <p className="text-sm text-muted">{c.reasoning}</p>
                  ) : null}
                  {c.correctionReason ? (
                    <p className="text-xs text-accent">
                      Correction: {c.correctionReason}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      disabled={pending}
                      onClick={() => {
                        startTransition(async () => {
                          const result = await correctClassificationAction({
                            classificationId: c.id,
                            action: "accept",
                          });
                          if (!result.ok) setError(result.error);
                          else router.refresh();
                        });
                      }}
                    >
                      Correct
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={pending}
                      onClick={() => {
                        setEditingId(editingId === `reject-${c.id}` ? null : `reject-${c.id}`);
                        setSaveAsRule(false);
                      }}
                    >
                      Doesn&apos;t belong here
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={pending}
                      onClick={() => {
                        setEditingId(editingId === c.id ? null : c.id);
                        setEditWeight(c.weight || 50);
                        setEditConfidence(c.confidence ?? 70);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={pending}
                      onClick={() => {
                        setEditingId(editingId === `move-${c.id}` ? null : `move-${c.id}`);
                        setMoveFocusId(c.designFocusId);
                      }}
                    >
                      Move category
                    </Button>
                  </div>

                  {editingId === `reject-${c.id}` ? (
                    <div className="space-y-2 border-t border-border pt-3">
                      <Label htmlFor={`reject-${c.id}`}>
                        Why does this not belong here? (optional)
                      </Label>
                      <Textarea
                        id={`reject-${c.id}`}
                        rows={2}
                        value={rejectReason[c.id] ?? ""}
                        onChange={(e) =>
                          setRejectReason((prev) => ({
                            ...prev,
                            [c.id]: e.target.value,
                          }))
                        }
                      />
                      <label className="flex items-center gap-2 text-xs text-muted">
                        <input
                          type="checkbox"
                          checked={saveAsRule}
                          onChange={(e) => setSaveAsRule(e.target.checked)}
                        />
                        Save as project classification rule
                      </label>
                      <Button
                        variant="danger"
                        disabled={pending}
                        onClick={() => {
                          startTransition(async () => {
                            const result = await correctClassificationAction({
                              classificationId: c.id,
                              action: "reject",
                              reason: rejectReason[c.id],
                              saveAsRule,
                            });
                            if (!result.ok) setError(result.error);
                            else {
                              setEditingId(null);
                              router.refresh();
                            }
                          });
                        }}
                      >
                        Remove classification
                      </Button>
                    </div>
                  ) : null}

                  {editingId === c.id ? (
                    <div className="grid grid-cols-1 gap-3 border-t border-border pt-3 sm:grid-cols-2">
                      <div>
                        <Label htmlFor={`w-${c.id}`}>Weight %</Label>
                        <Input
                          id={`w-${c.id}`}
                          type="number"
                          min={0}
                          max={100}
                          value={editWeight}
                          onChange={(e) =>
                            setEditWeight(Number(e.target.value))
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor={`conf-${c.id}`}>Confidence %</Label>
                        <Input
                          id={`conf-${c.id}`}
                          type="number"
                          min={0}
                          max={100}
                          value={editConfidence}
                          onChange={(e) =>
                            setEditConfidence(Number(e.target.value))
                          }
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Button
                          disabled={pending}
                          onClick={() => {
                            startTransition(async () => {
                              const result = await correctClassificationAction({
                                classificationId: c.id,
                                action: "edit",
                                weight: editWeight,
                                confidence: editConfidence,
                              });
                              if (!result.ok) setError(result.error);
                              else {
                                setEditingId(null);
                                router.refresh();
                              }
                            });
                          }}
                        >
                          Save edit
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {editingId === `move-${c.id}` ? (
                    <div className="space-y-2 border-t border-border pt-3">
                      <Label htmlFor={`move-${c.id}`}>Move to design focus</Label>
                      <Select
                        id={`move-${c.id}`}
                        value={moveFocusId}
                        onChange={(e) => setMoveFocusId(e.target.value)}
                      >
                        {designFocusOptions.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </Select>
                      <Button
                        disabled={pending}
                        onClick={() => {
                          startTransition(async () => {
                            const result = await correctClassificationAction({
                              classificationId: c.id,
                              action: "move",
                              designFocusId: moveFocusId,
                            });
                            if (!result.ok) setError(result.error);
                            else {
                              setEditingId(null);
                              router.refresh();
                            }
                          });
                        }}
                      >
                        Move
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {analysis && analysis.suggestedRelations.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Suggested connections</h3>
          <ul className="space-y-2">
            {analysis.suggestedRelations.map((rel) => (
              <li
                key={`${rel.targetNodeId}-${rel.relationType}`}
                className="surface-card flex flex-col gap-2 px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p>
                    <span className="text-muted">{rel.relationType}</span> →{" "}
                    {rel.targetName}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {rel.reasoning} · confidence {Math.round(rel.confidence)}% ·{" "}
                    {rel.status}
                  </p>
                </div>
                {rel.status === "pending" && analysis.analysisId ? (
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      disabled={pending}
                      onClick={() => {
                        startTransition(async () => {
                          const result = await resolveSuggestedRelationAction({
                            analysisId: analysis.analysisId!,
                            targetNodeId: rel.targetNodeId,
                            relationType: rel.relationType,
                            decision: "accept",
                          });
                          if (!result.ok) setError(result.error);
                          else router.refresh();
                        });
                      }}
                    >
                      {t("balance.accept")}
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={pending}
                      onClick={() => {
                        startTransition(async () => {
                          const result = await resolveSuggestedRelationAction({
                            analysisId: analysis.analysisId!,
                            targetNodeId: rel.targetNodeId,
                            relationType: rel.relationType,
                            decision: "reject",
                          });
                          if (!result.ok) setError(result.error);
                          else router.refresh();
                        });
                      }}
                    >
                      {t("balance.reject")}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {analysis && analysis.observations.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Observations</h3>
          <ul className="space-y-1 text-sm text-muted">
            {analysis.observations.map((obs, i) => (
              <li key={`${obs.type}-${i}`}>
                <span className="text-foreground">{obs.type}</span> —{" "}
                {obs.description}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">
            Balance colors come from code on the Balance tab — not from these
            observations.
          </p>
        </div>
      ) : null}
    </section>
  );
}
