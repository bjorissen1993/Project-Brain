"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatusSelect } from "@/components/ui/status-select";
import { NodeAIPanel } from "@/features/analysis/node-ai-panel";
import type { NodeAnalysisView } from "@/features/analysis/actions";
import { CopyProfileDialog } from "@/features/chat/copy-profile-dialog";
import {
  parseStructureView,
  readStructureReturn,
  structureFocusHref,
  structureViewRespectingBlobCap,
  type StructureViewMode,
} from "@/features/focus-space/structure-href";
import {
  deleteNodeAction,
  updateNodeAction,
} from "@/features/nodes/actions";
import { AddChildSection } from "@/features/nodes/add-child-section";
import { blurbFromContent, isImageNode } from "@/features/nodes/image-node";
import {
  createRelationAction,
  deleteRelationAction,
} from "@/features/relations/actions";
import {
  GAME_PHASE_OPTIONS,
  type GamePhase,
  type NodeStatus,
  type NodeType,
} from "@/types";

type RelationSide = {
  id: string;
  type: string;
  label: string | null;
  other: { id: string; name: string; type: string };
};

type ChildRow = {
  id: string;
  name: string;
  type: string;
  status: NodeStatus;
};

export function NodeDetail({
  projectId,
  node,
  designFocusOptions,
  allNodes,
  outgoing,
  incoming,
  analysis,
  childNodes,
  classifications,
}: {
  projectId: string;
  node: {
    id: string;
    name: string;
    type: NodeType;
    customTypeLabel: string | null;
    status: NodeStatus;
    content: string | null;
    summary?: string | null;
    parentId: string | null;
    designFocusId: string | null;
    gamePhase: GamePhase | null;
    childCount?: number;
  };
  designFocusOptions: { id: string; name: string }[];
  allNodes: { id: string; name: string; parentId?: string | null }[];
  outgoing: RelationSide[];
  incoming: RelationSide[];
  analysis: NodeAnalysisView | null;
  childNodes: ChildRow[];
  classifications: {
    id: string;
    category: string;
    confidence: number | null;
    source: string;
  }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [name, setName] = useState(node.name);
  const [status, setStatus] = useState<NodeStatus>(node.status);
  const [gamePhase, setGamePhase] = useState<GamePhase | "">(
    node.gamePhase ?? "",
  );
  const [copyOpen, setCopyOpen] = useState(false);
  const fromQueryRaw = searchParams.get("fromView");
  const queryReturnView =
    fromQueryRaw === "tree" ||
    fromQueryRaw === "blobs" ||
    fromQueryRaw === "details"
      ? parseStructureView(fromQueryRaw)
      : null;
  // sessionStorage is client-only; restore after mount when ?fromView= is absent.
  const [rememberedView, setRememberedView] = useState<StructureViewMode | null>(
    null,
  );

  useEffect(() => {
    if (queryReturnView) return;
    const t = window.setTimeout(() => {
      const remembered = readStructureReturn(projectId);
      if (remembered) setRememberedView(remembered.view);
    }, 0);
    return () => window.clearTimeout(t);
  }, [projectId, queryReturnView]);

  const returnView: StructureViewMode =
    queryReturnView ?? rememberedView ?? "blobs";
  const structureView = structureViewRespectingBlobCap(
    returnView,
    childNodes.length,
  );
  const structureHref = structureFocusHref(projectId, node.id, structureView);
  const afterDeleteView = structureViewRespectingBlobCap(returnView, 0);
  const afterDeleteHref = node.parentId
    ? structureFocusHref(projectId, node.parentId, afterDeleteView)
    : structureFocusHref(projectId, null, afterDeleteView);
  const canCopyProfile = (node.childCount ?? 0) > 0;

  const parentPath = useMemo(() => {
    if (!node.parentId) return "Project root";
    const byId = new Map(allNodes.map((n) => [n.id, n]));
    const chain: string[] = [];
    let cur = byId.get(node.parentId);
    let guard = 0;
    while (cur && guard < 40) {
      chain.push(cur.name);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
      guard += 1;
    }
    chain.reverse();
    return chain.length > 0 ? chain.join(" / ") : "Unknown parent";
  }, [allNodes, node.parentId]);

  const aboutBlurb =
    node.summary?.trim() ||
    analysis?.summary?.trim() ||
    blurbFromContent(node.content, 280) ||
    (isImageNode(node) ? "Image reference at this Structure level." : "");

  const designFocusLabels = useMemo(() => {
    if (classifications.length > 0) {
      return classifications.map((c) => c.category);
    }
    if (node.designFocusId) {
      const match = designFocusOptions.find((f) => f.id === node.designFocusId);
      return match ? [match.name] : [];
    }
    return [];
  }, [classifications, designFocusOptions, node.designFocusId]);

  return (
    <div className="mx-auto max-w-3xl space-y-10 px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <Link
            href={structureHref}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-nav hover:text-nav-hover"
          >
            <ArrowLeft size={14} strokeWidth={2.25} aria-hidden />
            Back to Structure
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl">{node.name}</h1>
            <StatusSelect
              value={status}
              onChange={setStatus}
            />
          </div>
          <p className="mt-2 text-xs text-muted">
            Ready triggers selective AI analysis. Classifications update
            automatically — you can still correct them in AI analysis.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canCopyProfile ? (
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => setCopyOpen(true)}
            >
              Copy profile
            </Button>
          ) : null}
          <Button
            variant="danger"
            disabled={pending}
            onClick={() => {
              if (!confirm("Delete this node and its children?")) return;
              startTransition(async () => {
                const result = await deleteNodeAction(node.id);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                router.push(afterDeleteHref);
                router.refresh();
              });
            }}
          >
            Delete
          </Button>
        </div>
      </div>

      <CopyProfileDialog
        open={copyOpen}
        projectId={projectId}
        sourceNodeId={node.id}
        sourceName={node.name}
        onClose={() => setCopyOpen(false)}
        onCopied={() => router.refresh()}
      />

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          setMessage(null);
          startTransition(async () => {
            const result = await updateNodeAction({
              id: node.id,
              name: name.trim(),
              status,
              gamePhase: gamePhase || null,
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            if (result.analysis) {
              if (result.analysis.ok) {
                setMessage(
                  result.analysis.deferred
                    ? `Saved. ${result.analysis.message}`
                    : `Saved. ${result.analysis.message}`,
                );
              } else {
                setMessage(
                  `Saved. Analysis issue: ${"error" in result.analysis ? result.analysis.error : "failed"}`,
                );
              }
            } else {
              setMessage("Saved.");
            }
            router.refresh();
          });
        }}
      >
        <section className="space-y-4">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div>
            <Label>Parent</Label>
            <p className="mt-1 rounded-[var(--radius)] border border-border/70 bg-panel px-3 py-2 text-sm text-foreground">
              {parentPath}
            </p>
            <p className="mt-1 text-xs text-muted">
              Move this node on the Structure canvas (drag / nest), not here.
            </p>
          </div>

          <div>
            <Label>Design Focus</Label>
            {designFocusLabels.length > 0 ? (
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {designFocusLabels.map((label) => (
                  <li
                    key={label}
                    className="rounded-[var(--radius)] border border-border bg-panel px-2 py-1 text-xs font-medium"
                  >
                    {label}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-muted">
                Auto — set when status becomes Ready (or corrected in AI
                analysis).
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="gamePhase">Priority phase</Label>
            <Select
              id="gamePhase"
              value={gamePhase}
              onChange={(e) =>
                setGamePhase(e.target.value as GamePhase | "")
              }
            >
              <option value="">Untagged</option>
              {GAME_PHASE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-muted">
              Early / Mid / Late / End — delivery timing, not game-only.
            </p>
          </div>

          <div>
            <Label>What this element is about</Label>
            <p className="mt-1 rounded-[var(--radius)] border border-border/70 bg-panel px-3 py-3 text-sm leading-relaxed text-foreground">
              {aboutBlurb ||
                "No summary yet. Add notes from Structure or mark Ready for an AI blurb."}
            </p>
            <p className="mt-1 text-xs text-muted">
              Updates from content changes and Ready analysis. Full notes live
              on the Structure canvas / chat — not a heavy editor here.
            </p>
          </div>
        </section>

        <FieldError>{error}</FieldError>
        {message ? <p className="text-xs text-accent">{message}</p> : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </form>

      <section className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-display text-xl">Children</h2>
            <p className="mt-1 text-sm text-muted">
              Direct child sections under this node.
            </p>
          </div>
          <AddChildSection projectId={projectId} parentId={node.id} />
        </div>
        {childNodes.length === 0 ? (
          <p className="text-sm text-muted">No child sections yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {childNodes.map((child) => (
              <li key={child.id}>
                <Link
                  href={`/projects/${projectId}/nodes/${child.id}`}
                  className="flex items-center justify-between gap-2 rounded-[var(--radius)] border border-border/80 bg-panel px-3 py-2 text-sm transition-colors hover:border-nav/40 hover:bg-nav-muted/40"
                >
                  <span className="font-medium">{child.name}</span>
                  <StatusBadge status={child.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <NodeAIPanel
        projectId={projectId}
        nodeId={node.id}
        nodeStatus={status}
        analysis={analysis}
        designFocusOptions={designFocusOptions}
      />

      {(classifications.length > 0 ||
        outgoing.length > 0 ||
        incoming.length > 0) && (
        <section className="space-y-3 border-t border-border pt-8">
          <div>
            <h2 className="font-display text-xl">Connections / classifications</h2>
            <p className="mt-1 text-sm text-muted">
              How this node relates to others and Design Focuses.
            </p>
          </div>
          {classifications.length > 0 ? (
            <ul className="space-y-1.5 text-sm">
              {classifications.map((c) => (
                <li
                  key={c.id}
                  className="rounded-[var(--radius)] border border-border/70 bg-panel px-3 py-2"
                >
                  <span className="font-medium">{c.category}</span>
                  <span className="ml-2 text-xs text-muted">
                    {c.source}
                    {c.confidence != null
                      ? ` · ${Math.round(c.confidence * 100)}%`
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      )}

      <section className="space-y-3 border-t border-border pt-8">
        <div>
          <h2 className="font-display text-xl">Connections</h2>
          <p className="mt-1 text-sm text-muted">
            Accepted relations between unique nodes. Suggested links appear in AI
            analysis until you Accept or Reject them.
          </p>
        </div>

        <ul className="space-y-2">
          {outgoing.map((rel) => (
            <li
              key={rel.id}
              className="surface-card flex items-center justify-between gap-3 px-3 py-2 text-sm"
            >
              <span>
                <span className="text-muted">{rel.type}</span> → {rel.other.name}
              </span>
              <Button
                variant="ghost"
                onClick={() => {
                  startTransition(async () => {
                    await deleteRelationAction(rel.id);
                    router.refresh();
                  });
                }}
              >
                Remove
              </Button>
            </li>
          ))}
          {incoming.map((rel) => (
            <li
              key={rel.id}
              className="surface-card flex items-center justify-between gap-3 px-3 py-2 text-sm"
            >
              <span>
                {rel.other.name} → <span className="text-muted">{rel.type}</span>
              </span>
              <Button
                variant="ghost"
                onClick={() => {
                  startTransition(async () => {
                    await deleteRelationAction(rel.id);
                    router.refresh();
                  });
                }}
              >
                Remove
              </Button>
            </li>
          ))}
          {outgoing.length === 0 && incoming.length === 0 ? (
            <li className="text-sm text-muted">No relations yet.</li>
          ) : null}
        </ul>

        <form
          className="surface-card grid grid-cols-1 gap-3 p-3 sm:grid-cols-[1fr_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            const formEl = e.currentTarget;
            const form = new FormData(formEl);
            startTransition(async () => {
              const result = await createRelationAction({
                projectId,
                sourceNodeId: node.id,
                targetNodeId: String(form.get("targetNodeId") ?? ""),
                type: String(form.get("type") ?? ""),
                label: String(form.get("label") ?? "") || null,
              });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              formEl.reset();
              router.refresh();
            });
          }}
        >
          <div>
            <Label htmlFor="targetNodeId">Target node</Label>
            <Select id="targetNodeId" name="targetNodeId" required defaultValue="">
              <option value="" disabled>
                Select…
              </option>
              {allNodes
                .filter((n) => n.id !== node.id)
                .map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="relType">Relation type</Label>
            <Input
              id="relType"
              name="type"
              required
              placeholder="depends_on, supports, conflicts…"
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" variant="secondary" disabled={pending}>
              Add
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
