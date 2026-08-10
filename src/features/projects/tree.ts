import type { DesignFocus, ProjectNode } from "@/types";

type FocusRow = {
  id: string;
  projectId: string;
  name: string;
  parentId: string | null;
  targetImportance: number;
  actualWeight: number;
  confidence: number;
  sortOrder: number;
  isCustom: boolean;
  templateSource: string | null;
};

type NodeRow = {
  id: string;
  projectId: string;
  parentId: string | null;
  name: string;
  type: ProjectNode["type"];
  customTypeLabel: string | null;
  status: ProjectNode["status"];
  content: string | null;
  designFocusId: string | null;
  sortOrder: number;
};

export function buildDesignFocusTree(rows: FocusRow[]): DesignFocus[] {
  const map = new Map<string, DesignFocus>();
  for (const row of rows) {
    map.set(row.id, { ...row, children: [] });
  }

  const roots: DesignFocus[] = [];
  for (const focus of map.values()) {
    if (focus.parentId && map.has(focus.parentId)) {
      map.get(focus.parentId)!.children!.push(focus);
    } else {
      roots.push(focus);
    }
  }

  const sortRecursive = (nodes: DesignFocus[]) => {
    nodes.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    for (const node of nodes) {
      if (node.children?.length) sortRecursive(node.children);
    }
  };
  sortRecursive(roots);
  return roots;
}

export function buildNodeTree(rows: NodeRow[]): ProjectNode[] {
  const map = new Map<string, ProjectNode>();
  for (const row of rows) {
    map.set(row.id, { ...row, children: [] });
  }

  const roots: ProjectNode[] = [];
  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortRecursive = (nodes: ProjectNode[]) => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder);
    for (const node of nodes) {
      if (node.children?.length) sortRecursive(node.children);
    }
  };
  sortRecursive(roots);
  return roots;
}
