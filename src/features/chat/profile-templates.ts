import {
  nameConflictsExisting,
  normalizeSuggestionName,
} from "@/features/ai/element-suggestion-schema";
import type { NodeType } from "@/types";
import { chatParentKey, type ChatProposal } from "./schema";

/** Types that get domain-aware child-slot follow-ups after create (not NPC-only). */
const STRUCTURE_FOLLOW_UP_TYPES = new Set<NodeType>([
  "CHARACTER",
  "FACTION",
  "LOCATION",
  "ITEM",
  "SYSTEM",
  "UI_SCREEN",
  "MECHANIC",
]);

const CHARACTER_SIGNAL_RE =
  /\b(npc|npcs|character|characters|protagonist|antagonist|villain|companion|heroine?|party\s*member)\b/i;

const CONTAINER_TYPES = new Set<string>(["FOLDER", "IDEA", "CUSTOM", "ACT"]);

type Slot = {
  name: string;
  type: NodeType;
  content?: string;
  reasoning: string;
};

/** Types that must never get NPC profile slots via name/content heuristics. */
const NEVER_CHARACTER_TYPES = new Set<string>([
  "SYSTEM",
  "UI_SCREEN",
  "MECHANIC",
  "TASK",
  "QUEST",
  "STORY_BEAT",
]);

/**
 * Standard profile / structure slot titles across domains.
 * Used to block slot-under-slot recursion and cleanup nested duplicates.
 */
export const CHARACTER_PROFILE_SLOT_NAMES = [
  "Stats",
  "Backstory",
  "Relationships",
  "Quests",
  // Prefer "Dialogue notes" — bare "Dialogue" is a common game-systems folder
  // (e.g. Chimera) and must not be treated as an NPC profile slot.
  "Dialogue notes",
  "Appearance",
  "Personality",
] as const;

const DOMAIN_PROFILE_SLOT_NAMES = [
  ...CHARACTER_PROFILE_SLOT_NAMES,
  "Goals",
  "Members",
  "Territory",
  "Resources",
  "Atmosphere",
  "Points of interest",
  "Inhabitants",
  "Hooks",
  "Layout",
  "Components",
  "Interactions",
  "States",
  "Navigation",
  "Overview",
  "Rules",
  "Inputs & outputs",
  "Edge cases",
  "Tuning",
  "Properties",
  "Acquisition",
  "Uses",
  "Requirements",
  "Flows",
  "Open questions",
] as const;

const KNOWN_SLOT_KEYS = new Set(
  DOMAIN_PROFILE_SLOT_NAMES.map((n) => normalizeSuggestionName(n)),
);

/** Max auto profile-slot proposals in one follow-up / character accept batch. */
export const PROFILE_FOLLOW_UP_MAX = 24;
/** Auto profile slots nest at most one level under the character/domain root. */
export const PROFILE_SLOT_MAX_DEPTH = 1;

/** True when a title matches a known profile/structure slot (near-exact). */
export function isKnownProfileSlotName(name?: string | null): boolean {
  const key = normalizeSuggestionName(name ?? "");
  if (!key) return false;
  if (KNOWN_SLOT_KEYS.has(key)) return true;
  // Allow light variants: "Dialogue note", "Point of interest", etc.
  for (const slot of KNOWN_SLOT_KEYS) {
    if (key === slot || key === `${slot}s` || key === slot.replace(/s$/, "")) {
      return true;
    }
  }
  return false;
}

/** Strong character/NPC signal from type, name/content — never from slot titles. */
export function isCharacterProfileNode(
  type: NodeType | string,
  name?: string | null,
  content?: string | null,
  opts?: { userAskedCharacterProfile?: boolean },
): boolean {
  if (isKnownProfileSlotName(name)) return false;
  if (type === "CHARACTER") return true;
  // Process/UI/system nodes stay domain-specific even if the title mentions “character”.
  if (NEVER_CHARACTER_TYPES.has(String(type))) return false;
  const blob = `${name ?? ""}\n${content ?? ""}`;
  if (CHARACTER_SIGNAL_RE.test(blob)) return true;
  // Explicit ask alone must NOT mark every FOLDER/IDEA in the batch as a character
  // (previous bug: recursive Stats/Backstory/… under every section).
  // Only treat containers as character roots when the name/content itself signals NPC.
  if (
    opts?.userAskedCharacterProfile &&
    CONTAINER_TYPES.has(String(type)) &&
    CHARACTER_SIGNAL_RE.test(name ?? "")
  ) {
    return true;
  }
  return false;
}

/** @deprecated alias — prefer isCharacterProfileNode */
export const isCharacterNode = isCharacterProfileNode;

/**
 * Whether a newly created node should receive automatic domain structure follow-ups.
 * Never fires on known slot folders; NPC slots only on real character roots.
 */
export function hasDomainFollowUpTemplate(
  type: NodeType | string,
  name?: string | null,
  content?: string | null,
  opts?: { userAskedCharacterProfile?: boolean },
): boolean {
  // Slots are leaves of the template — never get the same template again.
  if (isKnownProfileSlotName(name)) return false;

  if (type === "CHARACTER") return true;

  if (
    isCharacterProfileNode(type, name, content, {
      userAskedCharacterProfile: opts?.userAskedCharacterProfile,
    })
  ) {
    return true;
  }

  // Domain roots (faction/location/…) — not arbitrary FOLDER children under a character.
  if (STRUCTURE_FOLLOW_UP_TYPES.has(type as NodeType)) {
    // SYSTEM/MECHANIC under a character are often "Stats"-like process nodes;
    // without a character signal they still get process slots — that's OK for
    // true system roots, but not for known slot names (handled above).
    return true;
  }

  return false;
}

/** @deprecated alias — prefer hasDomainFollowUpTemplate */
export const isProfileLikeNode = hasDomainFollowUpTemplate;

/** True when recent user text explicitly asks for character/NPC profile structure. */
export function userAskedCharacterProfile(
  text: string | null | undefined,
): boolean {
  if (!text?.trim()) return false;
  const t = text.toLowerCase();
  const mentionsCharacter = CHARACTER_SIGNAL_RE.test(t);
  const mentionsProfile =
    /\b(profile|profiles|slots?|template|backstory|relationships?|dialogue)\b/.test(
      t,
    );
  return mentionsCharacter && mentionsProfile;
}

/** Domain-aware default child slots for a newly created node. */
export function profileChildSlots(
  parentType: NodeType | string,
  parentName?: string | null,
  opts?: {
    content?: string | null;
    userAskedCharacterProfile?: boolean;
  },
): Slot[] {
  // Never nest the template under a slot folder.
  if (isKnownProfileSlotName(parentName)) {
    return [];
  }

  // Project intent must NOT force NPC slots onto non-character nodes
  // (previous bug: RPG intent + SYSTEM → Stats/Backstory/…).
  if (
    isCharacterProfileNode(parentType, parentName, opts?.content, {
      userAskedCharacterProfile: opts?.userAskedCharacterProfile,
    })
  ) {
    return [
      {
        name: "Stats",
        type: "SYSTEM",
        content: "Core attributes, levels, and combat/utility numbers.",
        reasoning: "Typical NPC/character profile slot",
      },
      {
        name: "Backstory",
        type: "STORY_BEAT",
        content: "Origin, motivation, and personal history.",
        reasoning: "Typical NPC/character profile slot",
      },
      {
        name: "Relationships",
        type: "FOLDER",
        content: "Links to other characters, factions, and allegiances.",
        reasoning: "Typical NPC/character profile slot",
      },
      {
        name: "Quests",
        type: "QUEST",
        content: "Quests this character gives, participates in, or blocks.",
        reasoning: "Typical NPC/character profile slot",
      },
      {
        name: "Dialogue notes",
        type: "IDEA",
        content: "Voice, catchphrases, and key conversation beats.",
        reasoning: "Typical NPC/character profile slot",
      },
      {
        name: "Appearance",
        type: "IDEA",
        content: "Visual description and distinctive traits.",
        reasoning: "Typical NPC/character profile slot",
      },
    ];
  }

  if (parentType === "FACTION") {
    return [
      { name: "Goals", type: "IDEA", reasoning: "Faction profile slot" },
      { name: "Members", type: "FOLDER", reasoning: "Faction profile slot" },
      {
        name: "Territory",
        type: "LOCATION",
        reasoning: "Faction profile slot",
      },
      {
        name: "Resources",
        type: "SYSTEM",
        reasoning: "Faction profile slot",
      },
    ];
  }

  if (parentType === "LOCATION") {
    return [
      {
        name: "Atmosphere",
        type: "IDEA",
        reasoning: "Location profile slot",
      },
      {
        name: "Points of interest",
        type: "FOLDER",
        reasoning: "Location profile slot",
      },
      {
        name: "Inhabitants",
        type: "FOLDER",
        reasoning: "Location profile slot",
      },
      { name: "Hooks", type: "QUEST", reasoning: "Location profile slot" },
    ];
  }

  if (parentType === "UI_SCREEN") {
    return [
      {
        name: "Layout",
        type: "IDEA",
        content: "Regions, hierarchy, and primary visual structure.",
        reasoning: "UI screen structure slot",
      },
      {
        name: "Components",
        type: "FOLDER",
        content: "Reusable controls and content blocks on this screen.",
        reasoning: "UI screen structure slot",
      },
      {
        name: "Interactions",
        type: "SYSTEM",
        content: "Primary actions, gestures, and feedback.",
        reasoning: "UI screen structure slot",
      },
      {
        name: "States",
        type: "FOLDER",
        content: "Empty, loading, error, and success variants.",
        reasoning: "UI screen structure slot",
      },
      {
        name: "Navigation",
        type: "SYSTEM",
        content: "Entry points, exits, and linked screens/flows.",
        reasoning: "UI screen structure slot",
      },
    ];
  }

  if (parentType === "SYSTEM" || parentType === "MECHANIC") {
    return [
      {
        name: "Overview",
        type: "IDEA",
        content: "What this system/process does and why it exists.",
        reasoning: "System / process structure slot",
      },
      {
        name: "Rules",
        type: "SYSTEM",
        content: "Core rules, steps, or invariants.",
        reasoning: "System / process structure slot",
      },
      {
        name: "Inputs & outputs",
        type: "FOLDER",
        content: "What enters the process and what it produces.",
        reasoning: "System / process structure slot",
      },
      {
        name: "Edge cases",
        type: "TASK",
        content: "Failure modes, limits, and special cases to design for.",
        reasoning: "System / process structure slot",
      },
      {
        name: "Tuning",
        type: "IDEA",
        content: "Knobs, balances, and iteration notes.",
        reasoning: "System / process structure slot",
      },
    ];
  }

  if (parentType === "ITEM") {
    return [
      {
        name: "Properties",
        type: "SYSTEM",
        reasoning: "Item profile slot",
      },
      {
        name: "Acquisition",
        type: "IDEA",
        reasoning: "Item profile slot",
      },
      {
        name: "Uses",
        type: "FOLDER",
        reasoning: "Item profile slot",
      },
    ];
  }

  // Software-style / generic feature containers — only when explicitly
  // structure-follow-up typed above; plain FOLDER/IDEA get nothing here.
  return [];
}

/**
 * Build advisory create_node proposals for domain child slots under a parent.
 * Flat list only (depth 1). Never nests slots under other slots.
 */
export function buildProfileFollowUpProposals(
  parents: {
    id: string;
    name: string;
    type: string;
    content?: string | null;
  }[],
  opts?: {
    intentSnippet?: string | null;
    userAskedCharacterProfile?: boolean;
    existingChildrenByParentId?: Map<string, string[]>;
    maxTotal?: number;
  },
): ChatProposal[] {
  const maxTotal = opts?.maxTotal ?? PROFILE_FOLLOW_UP_MAX;
  const proposals: ChatProposal[] = [];
  for (const parent of parents) {
    if (isKnownProfileSlotName(parent.name)) continue;
    if (
      !hasDomainFollowUpTemplate(parent.type, parent.name, parent.content, {
        userAskedCharacterProfile: opts?.userAskedCharacterProfile,
      })
    ) {
      continue;
    }
    const existing =
      opts?.existingChildrenByParentId?.get(chatParentKey(parent.id)) ??
      opts?.existingChildrenByParentId?.get(parent.id) ??
      [];
    const accepted: string[] = [];
    const slots = profileChildSlots(parent.type, parent.name, {
      content: parent.content,
      userAskedCharacterProfile: opts?.userAskedCharacterProfile,
    });
    for (const slot of slots) {
      if (proposals.length >= maxTotal) return proposals;
      if (nameConflictsExisting(slot.name, [...existing, ...accepted])) {
        continue;
      }
      accepted.push(slot.name);
      proposals.push({
        kind: "create_node",
        name: slot.name,
        type: slot.type,
        content: slot.content,
        parentNodeId: parent.id,
        reasoning: `${slot.reasoning} for “${parent.name}”`,
      });
    }
  }
  return proposals;
}

export function profileFollowUpMessage(
  parents: { name: string; type: string; content?: string | null }[],
  opts?: { userAskedCharacterProfile?: boolean },
): string {
  const names = parents.map((p) => p.name).join(", ");
  const allCharacters = parents.every((p) =>
    isCharacterProfileNode(p.type, p.name, p.content, {
      userAskedCharacterProfile: opts?.userAskedCharacterProfile,
    }),
  );
  if (allCharacters) {
    return `Suggested profile elements for ${names}. Accept the slots you want — nothing is added until you confirm. After the structure is in place, you can Copy profile onto more NPCs.`;
  }
  return `Suggested child elements for ${names}. Accept the slots you want — nothing is added until you confirm.`;
}

/** @deprecated alias */
export const followUpAssistantMessage = profileFollowUpMessage;

/**
 * Drop create_node proposals that would nest a known profile slot under another
 * known profile slot in a draft (clientKey) tree, or deeper than one level under
 * a CHARACTER draft.
 *
 * Important: do NOT wipe suggestions merely because an existing project folder
 * shares a slot-like name (e.g. top-level "Dialogue" / "Overview" in Chimera).
 * Name-only slot-under-slot applies to same-batch draft parents only.
 */
export function filterNestedProfileSlotProposals(
  proposals: ChatProposal[],
  opts?: {
    /** Resolved existing parent id → name (for parentNodeId checks). */
    parentNameById?: Map<string, string>;
  },
): { proposals: ChatProposal[]; removedCount: number } {
  const creates = proposals.filter(
    (p): p is Extract<ChatProposal, { kind: "create_node" }> =>
      p.kind === "create_node",
  );
  if (creates.length === 0) {
    return { proposals, removedCount: 0 };
  }

  const byClientKey = new Map<
    string,
    { name: string; type: string; parentClientKey?: string }
  >();
  for (const p of creates) {
    if (p.clientKey) {
      byClientKey.set(p.clientKey, {
        name: p.name,
        type: p.type,
        parentClientKey: p.parentClientKey,
      });
    }
  }

  /** Depth of this create under the nearest CHARACTER ancestor in the draft tree. */
  function depthUnderCharacterDraft(
    parentClientKey: string | undefined,
  ): number | null {
    let depth = 0;
    let key = parentClientKey;
    const seen = new Set<string>();
    while (key && byClientKey.has(key) && !seen.has(key)) {
      seen.add(key);
      depth += 1;
      const node = byClientKey.get(key)!;
      if (
        node.type === "CHARACTER" ||
        isCharacterProfileNode(node.type, node.name, null)
      ) {
        return depth;
      }
      key = node.parentClientKey;
    }
    return null;
  }

  const kept: ChatProposal[] = [];
  let removedCount = 0;
  for (const p of proposals) {
    if (p.kind !== "create_node") {
      kept.push(p);
      continue;
    }
    const childIsSlot = isKnownProfileSlotName(p.name);
    if (!childIsSlot) {
      kept.push(p);
      continue;
    }
    // Draft-only slot-under-slot: parentClientKey → another create in this batch.
    if (p.parentClientKey) {
      const parentDraft = byClientKey.get(p.parentClientKey);
      if (parentDraft && isKnownProfileSlotName(parentDraft.name)) {
        console.warn("[chat] drop nested profile slot under draft slot", {
          child: p.name,
          parent: parentDraft.name,
        });
        removedCount += 1;
        continue;
      }
    }
    const underChar = depthUnderCharacterDraft(p.parentClientKey);
    if (underChar !== null && underChar > PROFILE_SLOT_MAX_DEPTH) {
      console.warn("[chat] drop profile slot deeper than max under CHARACTER", {
        child: p.name,
        depth: underChar,
      });
      removedCount += 1;
      continue;
    }
    kept.push(p);
  }
  // parentNameById reserved for callers / future existing-parent checks
  void opts?.parentNameById;
  return { proposals: kept, removedCount };
}

/**
 * Whether a create batch looks character/NPC-profile heavy (for tighter caps).
 */
export function isCharacterProfileCreateBatch(
  proposals: ChatProposal[],
): boolean {
  let characterCreates = 0;
  let slotCreates = 0;
  for (const p of proposals) {
    if (p.kind !== "create_node") continue;
    if (p.type === "CHARACTER" || isCharacterProfileNode(p.type, p.name, p.content)) {
      characterCreates += 1;
    }
    if (isKnownProfileSlotName(p.name)) slotCreates += 1;
  }
  return characterCreates > 0 || slotCreates >= 3;
}
