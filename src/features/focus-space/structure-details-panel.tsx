"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type ReactNode,
} from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, Label, Textarea } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  blurbFromContent,
  imageUrlFromNodeContent,
  isImageNode,
  isNoteLikeNode,
} from "@/features/nodes/image-node";
import { updateNodeAction } from "@/features/nodes/actions";
import { useT } from "@/features/i18n";
import { PbIcon, iconKeyForNodeType, type IconKey } from "@/lib/icons";
import { NODE_TYPE_OPTIONS, type ProjectNode } from "@/types";
import { cn } from "@/lib/utils";
import { useFocusWorkspace } from "./focus-interaction-context";
import { structureFocusHref } from "./structure-href";
import {
  DETAILS_CONNECTOR_LIST_PAD,
  StructureDetailsRelationLayer,
} from "./structure-details-relations";
import { useVisibleRelations } from "./use-visible-relations";

/** Smooth height + opacity expand/collapse for the Children note accordion. */
function AccordionExpand({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(open);

  if (open && !mounted) {
    setMounted(true);
  }

  useEffect(() => {
    if (open) return;
    const id = window.setTimeout(() => setMounted(false), 280);
    return () => window.clearTimeout(id);
  }, [open]);

  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows] duration-[250ms] ease-out",
        open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
      )}
      aria-hidden={!open}
    >
      <div className="min-h-0 overflow-hidden">
        <div
          className={cn(
            "transition-opacity duration-[250ms] ease-out",
            open ? "opacity-100" : "opacity-0",
            !open && "pointer-events-none",
          )}
        >
          {mounted ? children : null}
        </div>
      </div>
    </div>
  );
}

function childTypeMeta(
  node: {
    type: (typeof NODE_TYPE_OPTIONS)[number]["value"];
    customTypeLabel?: string | null;
    content?: string | null;
    hasChildren?: boolean;
  },
  noteLabel: string,
  imageLabel: string,
): { label: string; icon: IconKey } {
  if (isImageNode(node)) return { label: imageLabel, icon: "image" };
  if (
    isNoteLikeNode({
      type: node.type,
      customTypeLabel: node.customTypeLabel,
      content: node.content,
      hasChildren: node.hasChildren,
    })
  ) {
    const label =
      node.type === "IDEA"
        ? noteLabel
        : node.type === "CUSTOM" && node.customTypeLabel
          ? node.customTypeLabel
          : (NODE_TYPE_OPTIONS.find((t) => t.value === node.type)?.label ??
            node.type);
    return { label, icon: "sticky-note" };
  }
  const label =
    node.type === "CUSTOM" && node.customTypeLabel
      ? node.customTypeLabel
      : (NODE_TYPE_OPTIONS.find((t) => t.value === node.type)?.label ??
        node.type);
  return { label, icon: iconKeyForNodeType(node.type) };
}

function InlineChildNoteEditor({
  node,
  onSaved,
}: {
  node: ProjectNode;
  onSaved?: () => void;
}) {
  const t = useT();
  const router = useRouter();
  const [draft, setDraft] = useState(node.content ?? "");
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [pending, startTransition] = useTransition();
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const editorKey = `${node.id}:${node.content ?? ""}`;
  const [syncedKey, setSyncedKey] = useState(editorKey);

  if (syncedKey !== editorKey) {
    setSyncedKey(editorKey);
    setDraft(node.content ?? "");
    setError(null);
    setSavedFlash(false);
  }

  useEffect(() => {
    const el = notesRef.current;
    if (!el) return;
    const t = window.setTimeout(() => {
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }, 0);
    return () => window.clearTimeout(t);
  }, [node.id]);

  const save = () => {
    const next = draft.trim() || null;
    const prev = node.content?.trim() || null;
    if (next === prev) return;
    setError(null);
    startTransition(async () => {
      const result = await updateNodeAction({
        id: node.id,
        content: next,
      });
      if (!result.ok) {
        setError(result.error ?? "Could not save notes");
        return;
      }
      setSavedFlash(true);
      router.refresh();
      onSaved?.();
      window.setTimeout(() => setSavedFlash(false), 1600);
    });
  };

  return (
    <div className="border-t border-border/70 px-3 pb-3 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={`structure-child-note-${node.id}`}>
          {t("structure.note")}
        </Label>
        <span className="text-[11px] text-muted">
          {pending
            ? t("structure.saving")
            : savedFlash
              ? t("structure.saved")
              : t("structure.autosaveHint")}
        </span>
      </div>
      <Textarea
        ref={notesRef}
        id={`structure-child-note-${node.id}`}
        value={draft}
        disabled={pending}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            save();
          }
        }}
        rows={8}
        placeholder={t("structure.writeNote")}
        className="mt-2 min-h-[10rem] text-sm leading-relaxed"
      />
      <FieldError>{error}</FieldError>
    </div>
  );
}

/** Details for the current Structure focus node — paired with the tree pane. */
export function StructureDetailsPanel({
  focusNodeId,
  onNodeContextMenu,
  onPaneContextMenu,
  linkToolActive = false,
  linkSourceId = null,
  onLinkPick,
}: {
  focusNodeId: string | null;
  onNodeContextMenu?: (nodeId: string, x: number, y: number) => void;
  onPaneContextMenu?: (x: number, y: number) => void;
  linkToolActive?: boolean;
  linkSourceId?: string | null;
  onLinkPick?: (id: string) => void;
}) {
  const t = useT();
  const router = useRouter();
  const {
    projectId,
    nodes,
    structureLevelFor,
    hoveredId,
    setHoveredId,
    relationFocusId,
    setRelationFocusId,
    relationMode,
    colorFor,
  } = useFocusWorkspace();
  const level = structureLevelFor(focusNodeId);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const currentNode = focusNodeId ? (byId.get(focusNodeId) ?? null) : null;

  /** Accordion: which child note is expanded inline in the Children list. */
  const [expandedChildNoteId, setExpandedChildNoteId] = useState<string | null>(
    null,
  );
  const [noteDraft, setNoteDraft] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [pendingNote, startNoteTransition] = useTransition();
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const childrenListRef = useRef<HTMLUListElement>(null);
  const [focusLevelId, setFocusLevelId] = useState(focusNodeId);

  if (focusLevelId !== focusNodeId) {
    setFocusLevelId(focusNodeId);
    setExpandedChildNoteId(null);
  }

  const childIds = useMemo(
    () => level.slices.map((s) => s.id),
    [level.slices],
  );
  const namesById = useMemo(
    () => new Map(level.slices.map((s) => [s.id, s.name])),
    [level.slices],
  );

  const relationsEnabled = relationMode !== "off";
  const focusForRelations =
    relationMode === "focused"
      ? hoveredId && childIds.includes(hoveredId)
        ? hoveredId
        : null
      : null;

  const drawnRelations = useVisibleRelations({
    visibleIds: childIds,
    namesById,
    mode: relationMode,
    focusId: focusForRelations,
    enabled: relationsEnabled && childIds.length >= 2,
  });

  const emphasisId =
    (hoveredId && childIds.includes(hoveredId) ? hoveredId : null) ??
    (relationFocusId && childIds.includes(relationFocusId)
      ? relationFocusId
      : null);

  const relatedToEmphasis = useMemo(() => {
    if (!emphasisId) return null;
    const ids = new Set<string>([emphasisId]);
    for (const rel of drawnRelations) {
      if (rel.sourceId === emphasisId || rel.targetId === emphasisId) {
        ids.add(rel.sourceId);
        ids.add(rel.targetId);
      }
    }
    return ids;
  }, [emphasisId, drawnRelations]);

  const onChildPointerEnter = (id: string) => {
    setHoveredId(id, "blob");
    if (relationsEnabled) setRelationFocusId(id);
  };

  const onChildPointerLeave = (id: string) => {
    setHoveredId(null);
    if (relationsEnabled && relationFocusId === id) {
      setRelationFocusId(null);
    }
  };

  const isFocusNote =
    currentNode != null &&
    isNoteLikeNode({
      type: currentNode.type,
      customTypeLabel: currentNode.customTypeLabel,
      content: currentNode.content,
      hasChildren: level.slices.length > 0,
    });

  const currentImageUrl =
    currentNode && isImageNode(currentNode)
      ? imageUrlFromNodeContent(currentNode.content)
      : null;
  const isCurrentImage = Boolean(currentImageUrl);
  const showFocusNoteEditor = currentNode != null && !isCurrentImage;

  const editorKey = `${currentNode?.id ?? "root"}:${currentNode?.content ?? ""}`;
  const [syncedEditorKey, setSyncedEditorKey] = useState(editorKey);

  if (syncedEditorKey !== editorKey) {
    setSyncedEditorKey(editorKey);
    setNoteDraft(currentNode?.content ?? "");
    setNoteError(null);
    setSavedFlash(false);
    setLightboxUrl(null);
  }

  // When the focused node itself is a note, focus its editor.
  useEffect(() => {
    if (!showFocusNoteEditor || !isFocusNote || isCurrentImage) return;
    if (expandedChildNoteId) return;
    const el = notesRef.current;
    if (!el) return;
    const t = window.setTimeout(() => {
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }, 0);
    return () => window.clearTimeout(t);
  }, [
    currentNode?.id,
    showFocusNoteEditor,
    isFocusNote,
    isCurrentImage,
    expandedChildNoteId,
  ]);

  const saveNotes = () => {
    if (!currentNode || isCurrentImage) return;
    const next = noteDraft.trim() || null;
    const prev = currentNode.content?.trim() || null;
    if (next === prev) return;
    setNoteError(null);
    startNoteTransition(async () => {
      const result = await updateNodeAction({
        id: currentNode.id,
        content: next,
      });
      if (!result.ok) {
        setNoteError(result.error ?? "Could not save notes");
        return;
      }
      setSavedFlash(true);
      router.refresh();
      window.setTimeout(() => setSavedFlash(false), 1600);
    });
  };

  const toggleChildNote = (id: string) => {
    setExpandedChildNoteId((prev) => (prev === id ? null : id));
  };

  const pickLinkTarget = (id: string) => {
    if (!linkToolActive || !onLinkPick) return false;
    onLinkPick(id);
    return true;
  };

  return (
    <div
      className="relative flex h-full min-h-[18rem] flex-col overflow-hidden"
      onContextMenu={(e) => {
        if (!onPaneContextMenu) return;
        // Let child rows / editors handle their own menus first.
        if ((e.target as HTMLElement).closest("[data-structure-node-menu]")) {
          return;
        }
        // Keep native edit menu on form fields.
        if (
          (e.target as HTMLElement).closest(
            "textarea, input, [contenteditable='true']",
          )
        ) {
          return;
        }
        e.preventDefault();
        onPaneContextMenu(e.clientX, e.clientY);
      }}
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4">
        {currentNode ? (
          <div
            data-structure-node-menu
            className="mb-1"
            onContextMenu={(e) => {
              if (!onNodeContextMenu) return;
              e.preventDefault();
              e.stopPropagation();
              onNodeContextMenu(currentNode.id, e.clientX, e.clientY);
            }}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              Current
            </p>
            <p className="mt-1 font-display text-lg font-semibold leading-snug text-foreground">
              {currentNode.name}
            </p>
          </div>
        ) : null}

        {currentNode && isCurrentImage && currentImageUrl ? (
          <section>
            <Label>{t("structure.image")}</Label>
            <button
              type="button"
              className="mt-2 block max-w-full overflow-hidden rounded-[var(--radius)] border border-border bg-muted-bg transition-colors hover:border-nav/45"
              onClick={() => setLightboxUrl(currentImageUrl)}
              aria-label={`View image for ${currentNode.name}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentImageUrl}
                alt={currentNode.name}
                className="max-h-64 w-auto max-w-full object-contain"
              />
            </button>
            <p className="mt-1.5 text-[11px] text-muted">
              Click to open full size
            </p>
          </section>
        ) : null}

        {showFocusNoteEditor ? (
          <section className={isCurrentImage ? "mt-5" : undefined}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="structure-details-notes">
                {isFocusNote ? t("structure.note") : t("structure.notes")}
              </Label>
              <span className="text-[11px] text-muted">
                {pendingNote
                  ? t("structure.saving")
                  : savedFlash
                    ? t("structure.saved")
                    : t("structure.autosaveHint")}
              </span>
            </div>
            <Textarea
              ref={notesRef}
              id="structure-details-notes"
              value={noteDraft}
              disabled={pendingNote}
              onChange={(e) => setNoteDraft(e.target.value)}
              onBlur={saveNotes}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  saveNotes();
                }
              }}
              rows={isFocusNote ? 10 : 6}
              placeholder={
                isFocusNote
                  ? t("structure.writeNote")
                  : t("structure.writeNotes")
              }
              className={
                isFocusNote
                  ? "mt-2 min-h-[14rem] text-sm leading-relaxed"
                  : "mt-2 min-h-[8rem]"
              }
            />
            <FieldError>{noteError}</FieldError>
          </section>
        ) : null}

        {!currentNode ? (
          <p className="mt-5 text-sm text-muted">
            {t("focusSpace.selectNode")}
          </p>
        ) : null}

        <section className="mt-6">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              {t("focusSpace.children")}
            </h3>
            <span className="text-[11px] tabular-nums text-muted">
              {level.slices.length}
            </span>
          </div>

          {level.slices.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              {isFocusNote
                ? t("structure.notesNoChildren")
                : t("structure.noChildren")}
            </p>
          ) : (
            <div
              className="relative mt-3 pr-0 sm:pr-[var(--details-connector-pad)]"
              style={
                {
                  "--details-connector-pad": `${DETAILS_CONNECTOR_LIST_PAD}px`,
                } as CSSProperties
              }
            >
              <ul ref={childrenListRef} className="relative space-y-2">
                {level.slices.map((slice) => {
                  const node = byId.get(slice.id);
                  const childImageUrl =
                    node && isImageNode(node)
                      ? imageUrlFromNodeContent(node.content)
                      : null;
                  const isChildNote =
                    node != null &&
                    !childImageUrl &&
                    isNoteLikeNode({
                      type: node.type,
                      customTypeLabel: node.customTypeLabel,
                      content: node.content,
                      hasChildren: slice.hasChildren,
                    });
                  const typeMeta = node
                    ? childTypeMeta(
                        {
                          type: node.type,
                          customTypeLabel: node.customTypeLabel,
                          content: node.content,
                          hasChildren: slice.hasChildren,
                        },
                        t("structure.note"),
                        t("structure.image"),
                      )
                    : null;
                  const summary =
                    node?.summary?.trim() ||
                    blurbFromContent(node?.content, 140) ||
                    (childImageUrl
                      ? t("structure.image")
                      : t("structure.noSummary"));
                  const expanded =
                    isChildNote && expandedChildNoteId === slice.id;
                  const rowActive = emphasisId === slice.id;
                  const rowLinked =
                    relatedToEmphasis != null &&
                    relatedToEmphasis.has(slice.id);
                  const rowDimmed =
                    relatedToEmphasis != null &&
                    relatedToEmphasis.size > 1 &&
                    !rowLinked;
                  const isLinkSource =
                    linkToolActive && linkSourceId === slice.id;
                  const linkHint = linkToolActive
                    ? linkSourceId
                      ? t("structure.linkPickTarget")
                      : t("structure.linkPickSource")
                    : undefined;

                  const rowMeta = (
                    <>
                      {node ? <StatusBadge status={node.status} /> : null}
                      {typeMeta ? (
                        <span className="inline-flex select-none items-center gap-1 rounded border border-border/60 bg-panel/50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                          <PbIcon
                            icon={typeMeta.icon}
                            size={10}
                            className="text-muted"
                          />
                          {typeMeta.label}
                        </span>
                      ) : null}
                    </>
                  );

                  return (
                    <li key={slice.id} className="relative">
                      <div
                        data-structure-node-menu
                        data-details-child={slice.id}
                        className={cn(
                          "structure-details-child relative overflow-hidden rounded-[var(--radius)] border border-border/80 bg-panel/80 transition-[border-color,box-shadow,background-color,opacity,transform] duration-200 ease-out",
                          "hover:z-10 hover:border-nav/45 hover:bg-panel hover:shadow-[0_0_0_1px_color-mix(in_srgb,var(--nav)_28%,transparent),0_0_22px_color-mix(in_srgb,var(--nav)_20%,transparent)]",
                          rowActive &&
                            "z-10 border-nav/55 bg-panel shadow-[0_0_0_1px_color-mix(in_srgb,var(--nav)_40%,transparent),0_0_26px_color-mix(in_srgb,var(--nav)_28%,transparent)]",
                          rowLinked &&
                            !rowActive &&
                            "border-nav/30 bg-panel/90",
                          rowDimmed && "opacity-45",
                          linkToolActive && "cursor-crosshair",
                          isLinkSource &&
                            "z-10 ring-2 ring-nav/70 ring-offset-2 ring-offset-transparent",
                        )}
                        title={linkHint}
                        onPointerEnter={() => onChildPointerEnter(slice.id)}
                        onPointerLeave={() => onChildPointerLeave(slice.id)}
                        onContextMenu={(e) => {
                          if (!onNodeContextMenu) return;
                          e.preventDefault();
                          e.stopPropagation();
                          onNodeContextMenu(slice.id, e.clientX, e.clientY);
                        }}
                      >
                        {isChildNote ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (pickLinkTarget(slice.id)) return;
                              toggleChildNote(slice.id);
                            }}
                            aria-expanded={linkToolActive ? undefined : expanded}
                            aria-label={
                              linkToolActive
                                ? `${slice.name}. ${linkHint}`
                                : undefined
                            }
                            className={cn(
                              "flex w-full flex-wrap items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted-bg/40",
                              linkToolActive
                                ? "cursor-crosshair"
                                : "cursor-pointer",
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-foreground">
                                  <ChevronDown
                                    size={14}
                                    className={cn(
                                      "shrink-0 text-muted transition-transform duration-[250ms] ease-out",
                                      expanded ? "rotate-0" : "-rotate-90",
                                    )}
                                    aria-hidden
                                  />
                                  <span className="truncate">{slice.name}</span>
                                </span>
                                {rowMeta}
                              </div>
                              <p
                                className={cn(
                                  "mt-1 text-xs leading-relaxed text-muted transition-opacity duration-[250ms] ease-out",
                                  expanded
                                    ? "pointer-events-none h-0 overflow-hidden opacity-0"
                                    : "opacity-100",
                                )}
                              >
                                {summary}
                              </p>
                            </div>
                          </button>
                        ) : (
                          <div
                            className={cn(
                              "flex flex-wrap items-start gap-3 px-3 py-2.5",
                              linkToolActive && "cursor-crosshair",
                            )}
                            onClick={() => {
                              if (!linkToolActive) return;
                              pickLinkTarget(slice.id);
                            }}
                          >
                            {childImageUrl ? (
                              <button
                                type="button"
                                className={cn(
                                  "h-14 w-14 shrink-0 overflow-hidden rounded-[var(--radius)] border border-border bg-muted-bg",
                                  linkToolActive
                                    ? "cursor-crosshair"
                                    : "cursor-pointer",
                                )}
                                onClick={(e) => {
                                  if (pickLinkTarget(slice.id)) {
                                    e.stopPropagation();
                                    return;
                                  }
                                  setLightboxUrl(childImageUrl);
                                }}
                                aria-label={
                                  linkToolActive
                                    ? `${slice.name}. ${linkHint}`
                                    : `View image ${slice.name}`
                                }
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={childImageUrl}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              </button>
                            ) : null}
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Link
                                  href={structureFocusHref(
                                    projectId,
                                    slice.id,
                                    "tree",
                                  )}
                                  className={cn(
                                    "font-medium text-foreground hover:text-nav",
                                    linkToolActive
                                      ? "cursor-crosshair"
                                      : "cursor-pointer",
                                  )}
                                  title={linkHint}
                                  aria-label={
                                    linkToolActive
                                      ? `${slice.name}. ${linkHint}`
                                      : undefined
                                  }
                                  onClick={(e) => {
                                    if (!pickLinkTarget(slice.id)) return;
                                    e.preventDefault();
                                    e.stopPropagation();
                                  }}
                                >
                                  {slice.name}
                                </Link>
                                {rowMeta}
                              </div>
                              <p className="mt-1 text-xs leading-relaxed text-muted">
                                {summary}
                              </p>
                            </div>
                          </div>
                        )}
                        {isChildNote && node ? (
                          <AccordionExpand open={expanded}>
                            <InlineChildNoteEditor node={node} />
                          </AccordionExpand>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {drawnRelations.length > 0 ? (
                <div className="max-sm:hidden">
                  <StructureDetailsRelationLayer
                    listRef={childrenListRef}
                    relations={drawnRelations}
                    childIds={childIds}
                    emphasizedId={emphasisId}
                    colorFor={colorFor}
                    layoutEpoch={expandedChildNoteId ?? "collapsed"}
                  />
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>

      {lightboxUrl ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setLightboxUrl(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("structure.imagePreview")}
            className="relative max-h-[90dvh] max-w-[min(48rem,100%)] overflow-hidden rounded-[var(--radius)] border border-border bg-panel p-2 shadow-xl"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxUrl}
              alt={t("structure.fullSize")}
              className="max-h-[80dvh] w-auto max-w-full object-contain"
            />
            <div className="mt-2 flex justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setLightboxUrl(null)}
              >
                {t("common.close")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
