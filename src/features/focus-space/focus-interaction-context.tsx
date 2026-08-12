"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { BalanceFocusNode } from "@/features/design-focus/balance-model";
import type { DesignFocus, ProjectNode } from "@/types";
import type { IconKey } from "@/lib/icons";
import {
  loadFocusColorOverrides,
  resolveFocusColor,
  saveFocusColorOverrides,
} from "./focus-blob-color";
import {
  loadFocusIconOverrides,
  resolveFocusIcon,
  saveFocusIconOverrides,
} from "./focus-blob-icon";
import {
  buildFocusLevelSummary,
  buildStructureLevelSummary,
  toFocusRows,
  toStructureRows,
  type FocusLevelSummary,
} from "./focus-pie-adapter";
import {
  loadRelationMode,
  saveRelationMode,
  type AiRelationEvidence,
  type ExplicitRelationInput,
  type RelationMode,
} from "./relation-strength";

/** Where hover originated — drives dimming policy on the canvas. */
export type FocusHoverSource = "blob" | "chart" | null;

export type FocusGenreInfo = {
  name: string;
  role: "PRIMARY" | "SECONDARY" | string;
};

export type NodeClassificationRow = {
  id: string;
  nodeId: string;
  category: string;
  confidence: number | null;
  source: string;
  metadata: unknown;
};

type FocusWorkspaceValue = {
  projectId: string;
  projectName: string;
  focuses: DesignFocus[];
  nodes: ProjectNode[];
  classifications: NodeClassificationRow[];
  relations: ExplicitRelationInput[];
  aiRelationEvidence: AiRelationEvidence[];
  balanceRoots: BalanceFocusNode[];
  observations: string[];
  intentText: string | null;
  genres: FocusGenreInfo[];
  hoveredId: string | null;
  hoverSource: FocusHoverSource;
  setHoveredId: (id: string | null, source?: Exclude<FocusHoverSource, null>) => void;
  /** Soft selection for CONNECTIONS sidebar (Focused curves follow live hover). */
  relationFocusId: string | null;
  setRelationFocusId: (id: string | null) => void;
  relationMode: RelationMode;
  setRelationMode: (mode: RelationMode) => void;
  /** Project Structure level (Node tree) — Focus Space default. */
  structureLevelFor: (nodeId: string | null) => FocusLevelSummary;
  /** Design Focus level (DesignFocus tree) — Design Focus view. */
  designFocusLevelFor: (focusId: string | null) => FocusLevelSummary;
  /** @deprecated Use structureLevelFor — kept as alias for structure. */
  levelFor: (focusId: string | null) => FocusLevelSummary;
  /** Stable (hash + optional custom) color for a focus/node id. */
  colorFor: (focusId: string) => string;
  setFocusColor: (focusId: string, color: string | null) => void;
  /** Custom or name/type-default Lucide icon key for a focus/node id. */
  iconFor: (focusId: string) => IconKey | null;
  setFocusIcon: (focusId: string, icon: IconKey | null) => void;
};

const FocusWorkspaceContext = createContext<FocusWorkspaceValue | null>(null);

export function FocusWorkspaceProvider({
  projectId,
  projectName,
  focuses,
  nodes,
  classifications = [],
  relations = [],
  aiRelationEvidence = [],
  balanceRoots,
  observations = [],
  intentText = null,
  genres = [],
  children,
}: {
  projectId: string;
  projectName: string;
  focuses: DesignFocus[];
  nodes: ProjectNode[];
  classifications?: NodeClassificationRow[];
  relations?: ExplicitRelationInput[];
  aiRelationEvidence?: AiRelationEvidence[];
  balanceRoots: BalanceFocusNode[];
  observations?: string[];
  intentText?: string | null;
  genres?: FocusGenreInfo[];
  children: ReactNode;
}) {
  const [hoveredId, setHoveredIdState] = useState<string | null>(null);
  const [hoverSource, setHoverSource] = useState<FocusHoverSource>(null);
  const [relationFocusId, setRelationFocusId] = useState<string | null>(null);
  const [relationMode, setRelationModeState] = useState<RelationMode>("strong");
  // Empty on SSR + first paint; restore localStorage after mount.
  const [colorOverrides, setColorOverrides] = useState<Record<string, string>>(
    {},
  );
  const [iconOverrides, setIconOverrides] = useState<Record<string, string>>(
    {},
  );

  // Restore after mount so SSR HTML matches the first client paint.
  useEffect(() => {
    const t = window.setTimeout(() => {
      setColorOverrides(loadFocusColorOverrides(projectId));
      setIconOverrides(loadFocusIconOverrides(projectId));
      setRelationModeState(loadRelationMode(projectId));
    }, 0);
    return () => window.clearTimeout(t);
  }, [projectId]);

  const setHoveredId = useCallback(
    (id: string | null, source: Exclude<FocusHoverSource, null> = "chart") => {
      setHoveredIdState(id);
      setHoverSource(id == null ? null : source);
    },
    [],
  );

  const setRelationMode = useCallback(
    (mode: RelationMode) => {
      setRelationModeState(mode);
      saveRelationMode(projectId, mode);
    },
    [projectId],
  );

  const colorFor = useCallback(
    (focusId: string) => resolveFocusColor(focusId, colorOverrides),
    [colorOverrides],
  );

  const setFocusColor = useCallback(
    (focusId: string, color: string | null) => {
      setColorOverrides((prev) => {
        const next = { ...prev };
        if (!color) delete next[focusId];
        else next[focusId] = color;
        saveFocusColorOverrides(projectId, next);
        return next;
      });
    },
    [projectId],
  );

  const nodesById = useMemo(() => {
    const map = new Map<string, ProjectNode>();
    const walk = (list: ProjectNode[]) => {
      for (const n of list) {
        map.set(n.id, n);
        if (n.children?.length) walk(n.children);
      }
    };
    walk(nodes);
    return map;
  }, [nodes]);

  const focusesById = useMemo(
    () => new Map(focuses.map((f) => [f.id, f])),
    [focuses],
  );

  const iconFor = useCallback(
    (focusId: string) => {
      const node = nodesById.get(focusId);
      const focus = focusesById.get(focusId);
      return resolveFocusIcon(focusId, iconOverrides, {
        name: node?.name ?? focus?.name ?? null,
        nodeType: node?.type ?? null,
        genreKey: focus?.templateSource ?? null,
      });
    },
    [focusesById, iconOverrides, nodesById],
  );

  const setFocusIcon = useCallback(
    (focusId: string, icon: IconKey | null) => {
      setIconOverrides((prev) => {
        const next = { ...prev };
        if (!icon) delete next[focusId];
        else next[focusId] = icon;
        saveFocusIconOverrides(projectId, next);
        return next;
      });
    },
    [projectId],
  );

  const focusRows = useMemo(() => toFocusRows(focuses), [focuses]);
  const structureRows = useMemo(() => toStructureRows(nodes), [nodes]);

  const structureLevelFor = useCallback(
    (nodeId: string | null) =>
      buildStructureLevelSummary({
        projectName,
        nodes: structureRows,
        nodeId,
      }),
    [projectName, structureRows],
  );

  const designFocusLevelFor = useCallback(
    (focusId: string | null) =>
      buildFocusLevelSummary({
        projectName,
        focuses: focusRows,
        nodes,
        balanceRoots,
        focusId,
      }),
    [projectName, focusRows, nodes, balanceRoots],
  );

  const value = useMemo(
    () => ({
      projectId,
      projectName,
      focuses,
      nodes,
      classifications,
      relations,
      aiRelationEvidence,
      balanceRoots,
      observations,
      intentText,
      genres,
      hoveredId,
      hoverSource,
      setHoveredId,
      relationFocusId,
      setRelationFocusId,
      relationMode,
      setRelationMode,
      structureLevelFor,
      designFocusLevelFor,
      levelFor: structureLevelFor,
      colorFor,
      setFocusColor,
      iconFor,
      setFocusIcon,
    }),
    [
      projectId,
      projectName,
      focuses,
      nodes,
      classifications,
      relations,
      aiRelationEvidence,
      balanceRoots,
      observations,
      intentText,
      genres,
      hoveredId,
      hoverSource,
      setHoveredId,
      relationFocusId,
      relationMode,
      setRelationMode,
      structureLevelFor,
      designFocusLevelFor,
      colorFor,
      setFocusColor,
      iconFor,
      setFocusIcon,
    ],
  );

  return (
    <FocusWorkspaceContext.Provider value={value}>
      {children}
    </FocusWorkspaceContext.Provider>
  );
}

export function useFocusWorkspace() {
  const ctx = useContext(FocusWorkspaceContext);
  if (!ctx) {
    throw new Error("useFocusWorkspace must be used within FocusWorkspaceProvider");
  }
  return ctx;
}

export function useOptionalFocusWorkspace() {
  return useContext(FocusWorkspaceContext);
}
