import { prisma } from "@/db/client";
import { getGenreTemplate } from "@/features/game-profile/genre-templates";
import {
  buildHeuristicGenericSetupSuggestion,
  buildHeuristicSetupSuggestion,
  genreCatalogForPrompt,
  projectTypeCatalogForPrompt,
} from "./heuristic-setup-suggestions";
import {
  getProjectTypeAreas,
  getProjectTypeFocusTemplates,
} from "@/features/projects/type-templates";
import type { ProjectType } from "@/types";
import {
  buildProjectIntelligenceContext,
  buildReadyAnalysisContext,
} from "./context-builder";
import { normalizeDirectionCheckResult } from "./direction-check-schema";
import { normalizeFullProjectAnalysis } from "./full-analysis-schema";
import { normalizeImbalanceAnalysis } from "./imbalance-schema";
import { normalizeImprovementSuggestions } from "./improvement-schema";
import {
  normalizeNodeAIAnalysis,
  type NodeAIAnalysis,
} from "./node-analysis-schema";
import { hasOpenAIApiKey, openAIChatJson } from "./openai-client";
import {
  normalizeChildElementSuggestions,
  normalizeSuggestionName,
} from "./element-suggestion-schema";
import { buildHeuristicChildElementSuggestions } from "./heuristic-element-suggestions";
import {
  normalizeGenericSetupSuggestion,
  normalizeSetupSuggestion,
} from "./setup-suggestion-schema";
import type {
  AIServiceOptions,
  AIServiceResult,
  AnalyzeCustomGameProfileInput,
  AnalyzeImbalanceInput,
  AnalyzeReadyNodeInput,
  ChildElementSuggestionsData,
  ClassifyNodeInput,
  DirectionCheckResult,
  FullProjectAnalysis,
  FullProjectAnalysisInput,
  GenerateImprovementSuggestionsInput,
  ImbalanceAnalysis,
  ImprovementSuggestions,
  PerformDirectionCheckInput,
  QuickReanalysisInput,
  ReadyNodeAnalysisData,
  SetupSuggestionData,
  SuggestChildElementsInput,
  SuggestSetupFromIntentInput,
  SummarizeNodeInput,
  SummarizeParentInput,
} from "./types";

/**
 * AIService interface.
 * Results are advisory until the creator explicitly applies them.
 * Ready-node analysis may call OpenAI; AI never silently mutates project data
 * beyond persisting advisory AIAnalysis / classification rows (caller-controlled).
 */
export interface AIService {
  classifyNode(
    input: ClassifyNodeInput,
    options?: AIServiceOptions,
  ): Promise<
    AIServiceResult<{
      category: string;
      confidence: number;
      weight?: number;
      reasoning?: string;
    }>
  >;

  summarizeNode(
    input: SummarizeNodeInput,
    options?: AIServiceOptions,
  ): Promise<AIServiceResult<{ summary: string; projectImpact?: string }>>;

  summarizeParent(
    input: SummarizeParentInput,
    options?: AIServiceOptions,
  ): Promise<AIServiceResult<{ summary: string; projectImpact?: string }>>;

  /** Full Ready-node analysis (classify + summarize + suggestions). */
  analyzeReadyNode(
    input: AnalyzeReadyNodeInput,
    options?: AIServiceOptions,
  ): Promise<AIServiceResult<ReadyNodeAnalysisData>>;

  analyzeImbalance(
    input: AnalyzeImbalanceInput,
    options?: AIServiceOptions,
  ): Promise<AIServiceResult<ImbalanceAnalysis>>;

  generateImprovementSuggestions(
    input: GenerateImprovementSuggestionsInput,
    options?: AIServiceOptions,
  ): Promise<AIServiceResult<ImprovementSuggestions>>;

  performDirectionCheck(
    input: PerformDirectionCheckInput,
    options?: AIServiceOptions,
  ): Promise<AIServiceResult<DirectionCheckResult>>;

  analyzeCustomGameProfile(
    input: AnalyzeCustomGameProfileInput,
    options?: AIServiceOptions,
  ): Promise<AIServiceResult<{ suggestedFocuses: string[]; notes: string }>>;

  suggestSetupFromIntent(
    input: SuggestSetupFromIntentInput,
    options?: AIServiceOptions,
  ): Promise<AIServiceResult<SetupSuggestionData>>;

  /** Suggest child structure nodes from idea text — never auto-creates. */
  suggestChildElements(
    input: SuggestChildElementsInput,
    options?: AIServiceOptions,
  ): Promise<AIServiceResult<ChildElementSuggestionsData>>;

  quickReanalysis(
    input: QuickReanalysisInput,
    options?: AIServiceOptions,
  ): Promise<
    AIServiceResult<{
      refreshed: boolean;
      imbalance?: ImbalanceAnalysis;
      ranAiPass: boolean;
    }>
  >;

  /** Manual deep-model full project analysis (Phase 5). */
  analyzeFullProject(
    input: FullProjectAnalysisInput,
    options?: AIServiceOptions,
  ): Promise<AIServiceResult<FullProjectAnalysis>>;
}

function heuristicSetupResult(
  intentText: string,
  reason: string,
): AIServiceResult<SetupSuggestionData> {
  const data = buildHeuristicSetupSuggestion(intentText);
  return {
    ok: true,
    stubbed: true,
    data,
    message: `Heuristic suggestions (${reason}). Review and edit before confirming setup.`,
  };
}

function heuristicGenericSetupResult(
  intentText: string,
  projectType: Exclude<ProjectType, "GAME">,
  reason: string,
): AIServiceResult<SetupSuggestionData> {
  const data = buildHeuristicGenericSetupSuggestion(intentText, projectType);
  return {
    ok: true,
    stubbed: true,
    data,
    message: `Heuristic suggestions (${reason}). Review and edit before confirming setup.`,
  };
}

async function generateAiSetupSuggestion(
  intentText: string,
  options?: AIServiceOptions,
): Promise<AIServiceResult<SetupSuggestionData>> {
  const tier = options?.modelTier ?? "quick";
  const catalog = genreCatalogForPrompt();

  const system = `You are a game design setup assistant for Project Brain.
Given the creator's project intent narrative, suggest genres, structural Project Areas, and Design Focus importance values.
CRITICAL separation:
- Project Areas = where content is organized (Story, Mechanics, Characters, World…). NO targetImportance. These become structural folders.
- Design Focuses = what the game should emphasize (Narrative, Exploration, Combat Mastery…). HAVE targetImportance. Analysis criteria — NOT the same as Project Areas. Do NOT mirror areas into focuses or vice versa.
Rules:
- Use ONLY genre keys from the catalog.
- primaryGenreKey must be one catalog key that best matches the core fantasy.
- secondaryGenreKeys: 1-3 other catalog keys that also fit (subgenres / influences). Prefer at least one when the intent clearly mixes styles. Never repeat primary.
- suggestedProjectAreas: structural sections from the catalog's Project Areas lists (primary + secondary). Deduplicate by name. selected=true for areas that fit. No importance field.
- suggestedDesignFocuses MUST include focuses from the primary genre AND from EVERY secondary genre in secondaryGenreKeys — not primary alone.
- For each included genre, list its catalog Design Focuses (and parentName for nested children). Set templateKey to that genre key.
- Adjust targetImportance (0-100) for ALL design focuses based on the intent — raise what the intent emphasizes, lower what it de-emphasizes or avoids. Do this for secondary genres too, not only primary.
- Multi-genre high design focus is allowed: many focuses may have high targetImportance; values are independent and MUST NOT be forced to sum to 100.
- Prefer template focuses/areas over inventing custom ones; invent only if intent clearly needs a new category (then omit templateKey).
- selected=true for focuses/areas that should be pre-checked (include relevant secondary items, not only primary).
- Include short reasoning only when helpful (especially when boosting/lowering a slider).
- extractedIntentHints is optional display-only (primaryExperiences, supportingSystems, minorSystems, thingsToAvoid).
- Never claim these suggestions are final — the creator will accept/edit/reject.
Return a single JSON object matching:
{
  "primaryGenreKey": string,
  "secondaryGenreKeys": string[],
  "customGameType": string (optional),
  "suggestedProjectAreas": [{ "name", "templateKey?", "selected", "reasoning?" }],
  "suggestedDesignFocuses": [{ "name", "parentName?", "templateKey?", "selected", "targetImportance", "reasoning?" }],
  "extractedIntentHints": { "primaryExperiences"?: string[], "supportingSystems"?: string[], "minorSystems"?: string[], "thingsToAvoid"?: string[] }
}`;

  const user = `Genre catalog:\n\n${catalog}\n\n---\nCreator intent (source of truth):\n${intentText}`;

  const completion = await openAIChatJson({
    system,
    user,
    modelTier: tier,
    temperature: 0.35,
  });

  if (!completion.ok) {
    return heuristicSetupResult(intentText, completion.error);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(completion.content);
  } catch {
    return heuristicSetupResult(intentText, "invalid AI JSON");
  }

  const normalized = normalizeSetupSuggestion(parsedJson);
  if (!normalized) {
    return heuristicSetupResult(intentText, "AI output failed validation");
  }

  // Ensure every primary + secondary template focus/area is present so the
  // wizard covers all genres (AI may omit some; fill with template defaults).
  const genreKeys = [
    normalized.primaryGenreKey,
    ...normalized.secondaryGenreKeys,
  ];
  const existingKeys = new Set(
    normalized.suggestedDesignFocuses.map((f) =>
      f.parentName
        ? `${f.templateKey ?? ""}:${f.parentName}:${f.name}`
        : `${f.templateKey ?? ""}:${f.name}`,
    ),
  );
  const filledFocuses = [...normalized.suggestedDesignFocuses];
  const areaByName = new Map(
    normalized.suggestedProjectAreas.map((a) => [a.name.toLowerCase(), a]),
  );

  for (const genreKey of genreKeys) {
    const template = getGenreTemplate(genreKey);
    if (!template) continue;
    for (const areaName of template.areas ?? []) {
      const key = areaName.toLowerCase();
      if (!areaByName.has(key)) {
        areaByName.set(key, {
          name: areaName,
          templateKey: genreKey,
          selected: genreKey === normalized.primaryGenreKey,
          reasoning:
            genreKey === normalized.primaryGenreKey
              ? "Core area from the suggested primary genre"
              : "From a secondary genre influence",
        });
      }
    }
    for (const focus of template.focuses) {
      const key = `${genreKey}:${focus.name}`;
      if (!existingKeys.has(key)) {
        existingKeys.add(key);
        filledFocuses.push({
          name: focus.name,
          templateKey: genreKey,
          selected:
            genreKey === normalized.primaryGenreKey ||
            (focus.defaultImportance ?? 50) >= 65,
          targetImportance: focus.defaultImportance ?? 50,
          reasoning:
            genreKey === normalized.primaryGenreKey
              ? "Core focus from the suggested primary genre"
              : "From a secondary genre influence",
        });
      }
      for (const child of focus.children ?? []) {
        const childKey = `${genreKey}:${focus.name}:${child.name}`;
        if (!existingKeys.has(childKey)) {
          existingKeys.add(childKey);
          filledFocuses.push({
            name: child.name,
            parentName: focus.name,
            templateKey: genreKey,
            selected: false,
            targetImportance: child.defaultImportance ?? 50,
          });
        }
      }
    }
  }

  const data: SetupSuggestionData = {
    ...normalized,
    suggestedProjectAreas: [...areaByName.values()],
    suggestedDesignFocuses: filledFocuses,
    source: "ai",
  };

  return {
    ok: true,
    stubbed: false,
    model: completion.model,
    data,
    message: "AI suggestions ready. Review and edit before confirming setup.",
  };
}

async function generateAiGenericSetupSuggestion(
  intentText: string,
  projectType: Exclude<ProjectType, "GAME">,
  options?: AIServiceOptions,
): Promise<AIServiceResult<SetupSuggestionData>> {
  const tier = options?.modelTier ?? "quick";
  const catalog = projectTypeCatalogForPrompt(projectType);

  const system = `You are a project setup assistant for Project Brain (non-game project types).
Given the creator's project intent narrative, suggest structural Project Areas and Design Focus importance values.
CRITICAL separation:
- Project Areas = where content is organized (folders). NO targetImportance.
- Design Focuses = what the project should emphasize. HAVE targetImportance. Analysis criteria — NOT the same as Project Areas. Do NOT mirror areas into focuses or vice versa.
Rules:
- Prefer the catalog areas and focuses for project type ${projectType}; invent custom only when intent clearly needs a new category (then omit templateKey).
- Set templateKey to "${projectType}" when using a catalog item.
- Adjust targetImportance (0-100) from the intent — raise what it emphasizes, lower what it avoids.
- Values are independent and MUST NOT be forced to sum to 100.
- selected=true for focuses/areas that should be pre-checked.
- No genres — this is not a game project.
- extractedIntentHints is optional display-only.
- Never claim these suggestions are final — the creator will accept/edit/reject.
Return a single JSON object matching:
{
  "suggestedProjectAreas": [{ "name", "templateKey?", "selected", "reasoning?" }],
  "suggestedDesignFocuses": [{ "name", "parentName?", "templateKey?", "selected", "targetImportance", "reasoning?" }],
  "extractedIntentHints": { "primaryExperiences"?: string[], "supportingSystems"?: string[], "minorSystems"?: string[], "thingsToAvoid"?: string[] }
}`;

  const user = `Type catalog:\n\n${catalog}\n\n---\nCreator intent (source of truth):\n${intentText}`;

  const completion = await openAIChatJson({
    system,
    user,
    modelTier: tier,
    temperature: 0.35,
  });

  if (!completion.ok) {
    return heuristicGenericSetupResult(intentText, projectType, completion.error);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(completion.content);
  } catch {
    return heuristicGenericSetupResult(intentText, projectType, "invalid AI JSON");
  }

  const normalized = normalizeGenericSetupSuggestion(parsedJson, projectType);
  if (!normalized) {
    return heuristicGenericSetupResult(
      intentText,
      projectType,
      "AI output failed validation",
    );
  }

  // Ensure type template areas/focuses are present so the wizard has a full set.
  const existingFocusKeys = new Set(
    normalized.suggestedDesignFocuses.map((f) =>
      f.parentName ? `${f.parentName}:${f.name}` : f.name,
    ),
  );
  const filledFocuses = [...normalized.suggestedDesignFocuses];
  const areaByName = new Map(
    normalized.suggestedProjectAreas.map((a) => [a.name.toLowerCase(), a]),
  );

  for (const areaName of getProjectTypeAreas(projectType)) {
    const key = areaName.toLowerCase();
    if (!areaByName.has(key)) {
      areaByName.set(key, {
        name: areaName,
        templateKey: projectType,
        selected: true,
        reasoning: "Suggested structural area for this project type",
      });
    }
  }

  for (const focus of getProjectTypeFocusTemplates(projectType)) {
    const key = focus.name;
    if (!existingFocusKeys.has(key)) {
      existingFocusKeys.add(key);
      filledFocuses.push({
        name: focus.name,
        templateKey: projectType,
        selected: true,
        targetImportance: focus.defaultImportance ?? 50,
        reasoning: "Core emphasis pillar for this project type",
      });
    }
    for (const child of focus.children ?? []) {
      const childKey = `${focus.name}:${child.name}`;
      if (!existingFocusKeys.has(childKey)) {
        existingFocusKeys.add(childKey);
        filledFocuses.push({
          name: child.name,
          parentName: focus.name,
          templateKey: projectType,
          selected: false,
          targetImportance: child.defaultImportance ?? 50,
        });
      }
    }
  }

  const data: SetupSuggestionData = {
    suggestedProjectAreas: [...areaByName.values()],
    suggestedDesignFocuses: filledFocuses,
    extractedIntentHints: normalized.extractedIntentHints,
    source: "ai",
  };

  return {
    ok: true,
    stubbed: false,
    model: completion.model,
    data,
    message: "AI suggestions ready. Review and edit before confirming setup.",
  };
}

const READY_ANALYSIS_SYSTEM = `You are Project Brain's design analyst.
The creator's project intent is the source of truth. You analyze and advise — you never silently change project data.

Given selective context for ONE node marked Ready, return a single JSON object:
{
  "summary": string,
  "projectImpact": string,
  "classifications": [{ "designFocusId": string, "weight": number, "confidence": number, "reasoning": string }],
  "suggestedRelations": [{ "targetNodeId": string, "relationType": string, "reasoning": string, "confidence": number }],
  "observations": [{ "type": "overrepresented"|"underrepresented"|"repetitive"|"disconnected"|"none", "description": string }]
}

Rules:
- designFocusId MUST be one of the provided Design Focus ids. Do not invent ids.
- weight and confidence are percentages 0–100.
- A node may contribute to multiple design focuses; weights are independent (need NOT sum to 100).
- Prefer fewer high-quality classifications over many weak ones.
- Respect creator classification corrections if present — do not contradict them.
- suggestedRelations: only use provided candidate node ids; do not invent ids; never suggest self-relations. These are suggestions only.
- For parent/folder nodes, base summary and impact primarily on child summaries/impacts/classifications, not full child documents.
- observations are light-touch and advisory (Phase 3 will do balance math).
- Be concise and specific to this project's intent.`;

async function runReadyOpenAI(
  promptUser: string,
  opts: {
    validDesignFocusIds: Set<string>;
    validNodeIds: Set<string>;
    selfNodeId: string;
    modelTier: "quick" | "standard" | "deep";
  },
): Promise<AIServiceResult<NodeAIAnalysis>> {
  const completion = await openAIChatJson({
    system: READY_ANALYSIS_SYSTEM,
    user: promptUser,
    modelTier: opts.modelTier,
    temperature: 0.25,
  });

  if (!completion.ok) {
    return {
      ok: false,
      stubbed: false,
      model: completion.model,
      error: completion.error,
      message: completion.error,
    };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(completion.content);
  } catch {
    return {
      ok: false,
      stubbed: false,
      model: completion.model,
      error: "invalid AI JSON",
      message: "AI returned invalid JSON",
    };
  }

  const normalized = normalizeNodeAIAnalysis(parsedJson, {
    validDesignFocusIds: opts.validDesignFocusIds,
    validNodeIds: opts.validNodeIds,
    selfNodeId: opts.selfNodeId,
  });

  if (!normalized) {
    return {
      ok: false,
      stubbed: false,
      model: completion.model,
      error: "AI output failed Zod validation",
      message: "AI output failed validation",
    };
  }

  return {
    ok: true,
    stubbed: false,
    model: completion.model,
    data: normalized,
    message: "Ready analysis complete (advisory).",
  };
}

export class ProjectBrainAIService implements AIService {
  async classifyNode(
    input: ClassifyNodeInput,
    options?: AIServiceOptions,
  ): Promise<
    AIServiceResult<{
      category: string;
      confidence: number;
      weight?: number;
      reasoning?: string;
    }>
  > {
    const full = await this.analyzeReadyNode(
      { projectId: input.projectId, nodeId: input.nodeId },
      { modelTier: options?.modelTier ?? "quick" },
    );
    if (!full.ok || !full.data) {
      return {
        ok: full.ok,
        stubbed: full.stubbed,
        model: full.model,
        error: full.error,
        message: full.message,
      };
    }
    const top = [...full.data.classifications].sort(
      (a, b) => b.confidence - a.confidence,
    )[0];
    if (!top) {
      return {
        ok: false,
        stubbed: false,
        model: full.model,
        error: "No classifications returned",
        message: "No classifications returned",
      };
    }
    return {
      ok: true,
      stubbed: false,
      model: full.model,
      data: {
        category: top.designFocusId,
        confidence: top.confidence,
        weight: top.weight,
        reasoning: top.reasoning,
      },
      message: full.message,
      inputHash: full.inputHash,
    };
  }

  async summarizeNode(
    input: SummarizeNodeInput,
    options?: AIServiceOptions,
  ): Promise<AIServiceResult<{ summary: string; projectImpact?: string }>> {
    const full = await this.analyzeReadyNode(
      { projectId: input.projectId, nodeId: input.nodeId },
      { modelTier: options?.modelTier ?? "quick" },
    );
    if (!full.ok || !full.data) {
      return {
        ok: full.ok,
        stubbed: full.stubbed,
        model: full.model,
        error: full.error,
        message: full.message,
      };
    }
    return {
      ok: true,
      stubbed: false,
      model: full.model,
      data: {
        summary: full.data.summary,
        projectImpact: full.data.projectImpact,
      },
      message: full.message,
      inputHash: full.inputHash,
    };
  }

  async summarizeParent(
    input: SummarizeParentInput,
    options?: AIServiceOptions,
  ): Promise<AIServiceResult<{ summary: string; projectImpact?: string }>> {
    // Prefer the Ready pipeline (context builder already prefers child summaries).
    const full = await this.analyzeReadyNode(
      { projectId: input.projectId, nodeId: input.parentNodeId },
      { modelTier: options?.modelTier ?? "quick" },
    );
    if (full.ok && full.data) {
      return {
        ok: true,
        stubbed: false,
        model: full.model,
        data: {
          summary: full.data.summary,
          projectImpact: full.data.projectImpact,
        },
        message: full.message,
        inputHash: full.inputHash,
      };
    }

    // Lightweight fallback if Ready pipeline fails but we have child summaries.
    if (!hasOpenAIApiKey()) {
      return {
        ok: false,
        stubbed: true,
        error: "OPENAI_API_KEY is not set",
        message: "Analysis pending — configure OPENAI_API_KEY",
      };
    }

    const tier = options?.modelTier ?? "quick";
    const childBlock = input.childSummaries
      .map(
        (c) =>
          `- ${c.nodeId}: ${c.summary}${c.projectImpact ? ` | impact: ${c.projectImpact}` : ""}`,
      )
      .join("\n");

    const completion = await openAIChatJson({
      system: `Summarize a parent/folder node from child summaries only. Return JSON: { "summary": string, "projectImpact": string }. Intent is source of truth.`,
      user: `Intent:\n${input.intentText ?? "(none)"}\n\nChild summaries:\n${childBlock}`,
      modelTier: tier,
      temperature: 0.25,
    });

    if (!completion.ok) {
      return {
        ok: false,
        stubbed: false,
        model: completion.model,
        error: completion.error,
        message: completion.error,
      };
    }

    try {
      const json = JSON.parse(completion.content) as {
        summary?: string;
        projectImpact?: string;
      };
      if (!json.summary?.trim()) {
        return {
          ok: false,
          stubbed: false,
          model: completion.model,
          error: "Missing summary",
          message: "AI parent summary missing summary field",
        };
      }
      return {
        ok: true,
        stubbed: false,
        model: completion.model,
        data: {
          summary: json.summary.trim(),
          projectImpact: json.projectImpact?.trim(),
        },
        message: "Parent summary ready (advisory).",
      };
    } catch {
      return {
        ok: false,
        stubbed: false,
        model: completion.model,
        error: "invalid AI JSON",
        message: "AI returned invalid JSON",
      };
    }
  }

  async analyzeReadyNode(
    input: AnalyzeReadyNodeInput,
    options?: AIServiceOptions,
  ): Promise<AIServiceResult<ReadyNodeAnalysisData>> {
    const ctx = await buildReadyAnalysisContext(input.nodeId);
    if (!ctx || ctx.projectId !== input.projectId) {
      return {
        ok: false,
        stubbed: true,
        error: "Node not found",
        message: "Node not found for Ready analysis",
      };
    }

    if (!hasOpenAIApiKey()) {
      return {
        ok: false,
        stubbed: true,
        inputHash: ctx.inputHash,
        error: "OPENAI_API_KEY is not set",
        message: "Analysis pending — configure OPENAI_API_KEY",
        data: {
          summary: "",
          projectImpact: "",
          classifications: [],
          suggestedRelations: [],
          observations: [],
          isParent: ctx.isParent,
          deferred: true,
        },
      };
    }

    const tier = options?.modelTier ?? "quick";
    const result = await runReadyOpenAI(ctx.promptUser, {
      validDesignFocusIds: ctx.validDesignFocusIds,
      validNodeIds: ctx.validNodeIds,
      selfNodeId: ctx.nodeId,
      modelTier: tier,
    });

    if (!result.ok || !result.data) {
      return {
        ok: false,
        stubbed: false,
        model: result.model,
        inputHash: ctx.inputHash,
        error: result.error,
        message: result.message,
      };
    }

    return {
      ok: true,
      stubbed: false,
      model: result.model,
      inputHash: ctx.inputHash,
      data: {
        ...result.data,
        isParent: ctx.isParent,
      },
      message: ctx.isParent
        ? "Parent Ready analysis complete (from child summaries). Advisory only."
        : "Ready analysis complete. Advisory only — review classifications and suggestions.",
    };
  }

  async analyzeImbalance(
    input: AnalyzeImbalanceInput,
    options?: AIServiceOptions,
  ): Promise<AIServiceResult<ImbalanceAnalysis>> {
    const ctx = await buildProjectIntelligenceContext(input.projectId, {
      mode: "imbalance",
      focusIds: input.designFocusIds,
      balanceLines: input.balanceLines,
    });
    if (!ctx) {
      return {
        ok: false,
        stubbed: true,
        error: "Project not found",
        message: "Project not found",
      };
    }

    if (!hasOpenAIApiKey()) {
      return {
        ok: false,
        stubbed: true,
        inputHash: ctx.inputHash,
        error: "OPENAI_API_KEY is not set",
        message: "Analysis pending — configure OPENAI_API_KEY",
      };
    }

    const tier = options?.modelTier ?? "standard";
    const completion = await openAIChatJson({
      system: `You are Project Brain's balance narrator.
Balance numbers and GREEN/ORANGE/RED statuses are ALREADY computed in code from actual vs normalized target.
Your job: explain imbalances in light of creator intent. Never invent thresholds.
Do NOT complain that an intentionally high-importance focus is "too much" at the parent level — intent is source of truth.
Drill-down: a green parent can still have internally imbalanced children; call that out when data shows it.
Return JSON:
{
  "summary": string,
  "respectsIntent": boolean,
  "findings": [{ "designFocusId"?: string, "severity": "info"|"warning"|"critical", "title": string, "description": string, "suggestedAction"?: string }]
}`,
      user: ctx.promptUser,
      modelTier: tier,
      temperature: 0.3,
    });

    if (!completion.ok) {
      return {
        ok: false,
        stubbed: false,
        model: completion.model,
        inputHash: ctx.inputHash,
        error: completion.error,
        message: completion.error,
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(completion.content);
    } catch {
      return {
        ok: false,
        stubbed: false,
        model: completion.model,
        inputHash: ctx.inputHash,
        error: "invalid AI JSON",
        message: "AI returned invalid JSON",
      };
    }

    const data = normalizeImbalanceAnalysis(parsed, ctx.validDesignFocusIds);
    if (!data) {
      return {
        ok: false,
        stubbed: false,
        model: completion.model,
        inputHash: ctx.inputHash,
        error: "AI output failed Zod validation",
        message: "AI output failed validation",
      };
    }

    return {
      ok: true,
      stubbed: false,
      model: completion.model,
      inputHash: ctx.inputHash,
      data,
      message: "Imbalance analysis ready (advisory).",
    };
  }

  async generateImprovementSuggestions(
    input: GenerateImprovementSuggestionsInput,
    options?: AIServiceOptions,
  ): Promise<AIServiceResult<ImprovementSuggestions>> {
    const ctx = await buildProjectIntelligenceContext(input.projectId, {
      mode: "improvements",
      nodeId: input.nodeId,
      balanceLines: input.balanceLines,
      extraNotes: input.context,
    });
    if (!ctx) {
      return {
        ok: false,
        stubbed: true,
        error: "Project not found",
        message: "Project not found",
      };
    }

    if (!hasOpenAIApiKey()) {
      return {
        ok: false,
        stubbed: true,
        inputHash: ctx.inputHash,
        error: "OPENAI_API_KEY is not set",
        message: "Analysis pending — configure OPENAI_API_KEY",
      };
    }

    const tier = options?.modelTier ?? "standard";
    const completion = await openAIChatJson({
      system: `You are Project Brain's improvement advisor.
Suggest concrete design improvements. Categories MUST be one of:
ADD, REMOVE, MERGE, SIMPLIFY, AUTOMATE, REPOSITION, CONNECT, REPURPOSE.
Never auto-apply — suggestions are advisory for Accept/Reject by the creator.
Respect intent and classification rules. Prefer fewer high-quality suggestions.
Return JSON:
{
  "summary": string,
  "suggestions": [{
    "category": "ADD"|"REMOVE"|"MERGE"|"SIMPLIFY"|"AUTOMATE"|"REPOSITION"|"CONNECT"|"REPURPOSE",
    "title": string,
    "description": string,
    "rationale": string,
    "relatedNodeIds": string[],
    "relatedFocusIds": string[],
    "priority": "low"|"medium"|"high"
  }]
}`,
      user: ctx.promptUser,
      modelTier: tier,
      temperature: 0.4,
    });

    if (!completion.ok) {
      return {
        ok: false,
        stubbed: false,
        model: completion.model,
        inputHash: ctx.inputHash,
        error: completion.error,
        message: completion.error,
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(completion.content);
    } catch {
      return {
        ok: false,
        stubbed: false,
        model: completion.model,
        inputHash: ctx.inputHash,
        error: "invalid AI JSON",
        message: "AI returned invalid JSON",
      };
    }

    const data = normalizeImprovementSuggestions(parsed, {
      validNodeIds: ctx.validNodeIds,
      validDesignFocusIds: ctx.validDesignFocusIds,
    });
    if (!data) {
      return {
        ok: false,
        stubbed: false,
        model: completion.model,
        inputHash: ctx.inputHash,
        error: "AI output failed Zod validation",
        message: "AI output failed validation",
      };
    }

    return {
      ok: true,
      stubbed: false,
      model: completion.model,
      inputHash: ctx.inputHash,
      data,
      message: "Improvement suggestions ready (advisory — never auto-applied).",
    };
  }

  async performDirectionCheck(
    input: PerformDirectionCheckInput,
    options?: AIServiceOptions,
  ): Promise<AIServiceResult<DirectionCheckResult>> {
    const ctx = await buildProjectIntelligenceContext(input.projectId, {
      mode: "direction",
      nodeId: input.nodeId,
      extraNotes: [
        input.triggerReason ? `Trigger: ${input.triggerReason}` : "",
        input.intentText ? `Intent override: ${input.intentText}` : "",
        input.content ? `Content: ${input.content}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    });
    if (!ctx) {
      return {
        ok: false,
        stubbed: true,
        error: "Project not found",
        message: "Project not found",
      };
    }

    if (!hasOpenAIApiKey()) {
      return {
        ok: false,
        stubbed: true,
        inputHash: ctx.inputHash,
        error: "OPENAI_API_KEY is not set",
        message: "Analysis pending — configure OPENAI_API_KEY",
      };
    }

    const tier = options?.modelTier ?? "standard";
    const completion = await openAIChatJson({
      system: `You are Project Brain's direction check.
Occasional check: is the project drifting from creator intent?
Ask ONE clear reflective question the creator can answer in free text.
Return JSON:
{
  "aligned": boolean,
  "confidence": number,
  "question": string,
  "observations": string[],
  "driftSignals": [{ "type": "same_purpose_cluster"|"category_green_to_red"|"large_folder_ready"|"distribution_drift"|"milestone_complete"|"other", "description": string }],
  "notes": string[]
}`,
      user: ctx.promptUser,
      modelTier: tier,
      temperature: 0.35,
    });

    if (!completion.ok) {
      return {
        ok: false,
        stubbed: false,
        model: completion.model,
        inputHash: ctx.inputHash,
        error: completion.error,
        message: completion.error,
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(completion.content);
    } catch {
      return {
        ok: false,
        stubbed: false,
        model: completion.model,
        inputHash: ctx.inputHash,
        error: "invalid AI JSON",
        message: "AI returned invalid JSON",
      };
    }

    const data = normalizeDirectionCheckResult(parsed);
    if (!data) {
      return {
        ok: false,
        stubbed: false,
        model: completion.model,
        inputHash: ctx.inputHash,
        error: "AI output failed Zod validation",
        message: "AI output failed validation",
      };
    }

    return {
      ok: true,
      stubbed: false,
      model: completion.model,
      inputHash: ctx.inputHash,
      data,
      message: "Direction check ready (advisory).",
    };
  }

  async analyzeCustomGameProfile(
    input: AnalyzeCustomGameProfileInput,
    options?: AIServiceOptions,
  ): Promise<AIServiceResult<{ suggestedFocuses: string[]; notes: string }>> {
    const intent = input.intentText?.trim() || input.customGameType;
    const suggestion = await this.suggestSetupFromIntent(
      { projectId: input.projectId, intentText: intent },
      options,
    );

    if (!suggestion.ok || !suggestion.data) {
      return {
        ok: suggestion.ok,
        stubbed: suggestion.stubbed,
        model: suggestion.model,
        error: suggestion.error,
        message: suggestion.message,
      };
    }

    return {
      ok: true,
      stubbed: suggestion.stubbed,
      model: suggestion.model,
      data: {
        suggestedFocuses: suggestion.data.suggestedDesignFocuses
          .filter((f) => f.selected)
          .map((f) =>
            f.parentName ? `${f.parentName} → ${f.name}` : f.name,
          ),
        notes: `Derived via suggestSetupFromIntent (${suggestion.data.source}). Advisory only.`,
      },
      message: suggestion.message,
    };
  }

  async suggestSetupFromIntent(
    input: SuggestSetupFromIntentInput,
    options?: AIServiceOptions,
  ): Promise<AIServiceResult<SetupSuggestionData>> {
    const intentText = input.intentText.trim();
    if (!intentText) {
      return {
        ok: false,
        stubbed: true,
        error: "Intent text is required",
        message: "Describe the experience you want to create first.",
      };
    }

    const projectType = input.projectType;

    if (projectType && projectType !== "GAME") {
      if (!hasOpenAIApiKey()) {
        return heuristicGenericSetupResult(
          intentText,
          projectType,
          "no OPENAI_API_KEY",
        );
      }
      return generateAiGenericSetupSuggestion(
        intentText,
        projectType,
        options,
      );
    }

    if (!hasOpenAIApiKey()) {
      return heuristicSetupResult(intentText, "no OPENAI_API_KEY");
    }

    return generateAiSetupSuggestion(intentText, options);
  }

  async suggestChildElements(
    input: SuggestChildElementsInput,
    options?: AIServiceOptions,
  ): Promise<AIServiceResult<ChildElementSuggestionsData>> {
    const content = input.content.trim();
    if (content.length < 20) {
      return {
        ok: false,
        stubbed: true,
        error: "Idea text too short",
        message: "Write a bit more about the idea before suggesting elements.",
      };
    }

    const atRoot = input.nodeId == null;
    let promptUser: string;
    let inputHash: string;

    if (input.nodeId) {
      const ctx = await buildReadyAnalysisContext(input.nodeId);
      if (!ctx || ctx.projectId !== input.projectId) {
        return {
          ok: false,
          stubbed: true,
          error: "Node not found",
          message: "Node not found in this project",
        };
      }
      promptUser = ctx.promptUser;
      inputHash = ctx.inputHash;
    } else {
      const ctx = await buildProjectIntelligenceContext(input.projectId, {
        mode: "improvements",
      });
      if (!ctx) {
        return {
          ok: false,
          stubbed: true,
          error: "Project not found",
          message: "Project not found",
        };
      }
      promptUser = ctx.promptUser;
      inputHash = ctx.inputHash;
    }

    // Existing direct children (or top-level nodes at root).
    const existingChildren = await prisma.node.findMany({
      where: { projectId: input.projectId, parentId: input.nodeId ?? null },
      select: { name: true },
      take: 40,
    });
    const projectMeta = await prisma.project.findUnique({
      where: { id: input.projectId },
      select: {
        type: true,
        customTypeLabel: true,
        intents: {
          orderBy: { version: "desc" },
          take: 1,
          select: { content: true },
        },
        designFocuses: {
          select: { name: true, targetImportance: true, parentId: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          take: 24,
        },
      },
    });
    const existingNames = new Set(
      existingChildren.map((c) => normalizeSuggestionName(c.name)),
    );

    const heuristic = (): AIServiceResult<ChildElementSuggestionsData> => {
      const data = buildHeuristicChildElementSuggestions(content, existingNames, {
        projectType: projectMeta?.type,
      });
      return {
        ok: true,
        stubbed: true,
        inputHash,
        data: { ...data, source: "heuristic" },
        message:
          data.notes ??
          "Heuristic suggestions (no API key). Review before adding.",
      };
    };

    if (!hasOpenAIApiKey()) {
      return heuristic();
    }

    const tier = options?.modelTier ?? "quick";
    const projectTypeLabel =
      projectMeta?.type === "CUSTOM" && projectMeta.customTypeLabel
        ? `CUSTOM (${projectMeta.customTypeLabel})`
        : (projectMeta?.type ?? "UNKNOWN");
    const intentSnippet = projectMeta?.intents[0]?.content?.trim() ?? "";
    const focusLines =
      projectMeta?.designFocuses
        .filter((f) => !f.parentId)
        .map((f) => `- ${f.name} (target ${f.targetImportance})`)
        .join("\n") || "(none)";

    const scopeLine = atRoot
      ? "Given selective project context, suggest TOP-LEVEL structure sections (nodes under the project root) that organize the work."
      : "Given selective context for ONE idea/container node, suggest child elements (nodes) that would help organize or elaborate the idea.";

    const system = `You are Project Brain's structure assistant for ANY project type (Game, Software, App, Creative, Other, Custom).
${scopeLine}
CRITICAL:
- Suggest structural children only (Project Structure nodes). Do NOT suggest Design Focus criteria.
- Never claim items are created — the creator must accept each suggestion.
- Never auto-create nodes; return proposals only.
- Respect the project intent: if intent says minimal / chill / non-combat / simple, do NOT push combat, complexity, or unrelated pillars.
- Match NodeType to the project type (e.g. UI_SCREEN/SYSTEM for software/apps; CHARACTER/QUEST for games when relevant). Prefer IDEA/FOLDER/TASK/SYSTEM when unsure.
- Avoid duplicates and near-duplicates of existing child names.
- Suggest as many useful children as the idea warrants (typically 4–12, up to 24 for a character/NPC). Prefer high-value slots over filler.
- For one character/NPC parent: suggest a concise flat section list under that node only — never nest Stats/Backstory/Relationships/Quests/Dialogue/Appearance inside each other.
- Keep names short. Do NOT fill long content — optional content is a one-line seed only (UI may ignore it).
- Do NOT hardcode a character template or any single genre template.
Return JSON:
{
  "suggestions": [{ "name", "type", "content?", "reasoning?", "selected" }],
  "notes": string (optional)
}`;

    const user = `${promptUser}

## Project type
${projectTypeLabel}

## Latest intent (respect this; do not contradict)
${intentSnippet ? intentSnippet.slice(0, 2500) : "(no intent set)"}

## Design focuses (emphasis vocabulary — not structure to create)
${focusLines}

## ${atRoot ? "Project seed text (authoritative for this request)" : "Idea text to expand (authoritative for this request; keep on parent when accepted)"}
${content.slice(0, 6000)}

## Existing ${atRoot ? "top-level nodes" : "direct children"} (do not duplicate or near-duplicate)
${
  existingChildren.length
    ? existingChildren.map((c) => `- ${c.name}`).join("\n")
    : "(none yet)"
}

Suggest ${atRoot ? "top-level" : "child"} structure sections that would help develop this ${atRoot ? "project" : "idea"} for this project type.`;

    const completion = await openAIChatJson({
      system,
      user,
      modelTier: tier,
      temperature: 0.4,
    });

    if (!completion.ok) {
      const fallback = heuristic();
      return {
        ...fallback,
        message: `Heuristic suggestions (${completion.error}). Review before adding.`,
      };
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(completion.content);
    } catch {
      const fallback = heuristic();
      return {
        ...fallback,
        message: "Heuristic suggestions (invalid AI JSON). Review before adding.",
      };
    }

    const normalized = normalizeChildElementSuggestions(
      parsedJson,
      existingNames,
    );
    if (!normalized || normalized.suggestions.length === 0) {
      // Prefer a clear empty result when every AI suggestion was a sibling duplicate
      // rather than silently substituting unrelated heuristic names.
      if (existingChildren.length > 0 && normalized) {
        return {
          ok: true,
          stubbed: false,
          model: completion.model,
          inputHash,
          data: {
            suggestions: [],
            notes: atRoot
              ? "All suggestions matched existing top-level nodes (or near-duplicates). Nothing new to add at the project root."
              : "All suggestions matched existing children (or near-duplicates). Nothing new to add under this node.",
            source: "ai",
          },
          message: atRoot
            ? "All suggestions already exist at the project root (or are near-duplicates). Nothing new to accept."
            : "All suggestions already exist under this node (or are near-duplicates). Nothing new to accept.",
        };
      }
      const fallback = heuristic();
      if (fallback.data && fallback.data.suggestions.length === 0) {
        return {
          ok: true,
          stubbed: true,
          inputHash,
          data: {
            suggestions: [],
            notes: atRoot
              ? "No new top-level sections to suggest — existing root nodes already cover the usual starters."
              : "No new child sections to suggest — existing children already cover the usual starters.",
            source: "heuristic",
          },
          message:
            "No new structure suggestions — children with similar names already exist here.",
        };
      }
      return {
        ...fallback,
        message:
          "Heuristic suggestions (AI output empty/invalid). Review before adding.",
      };
    }

    return {
      ok: true,
      stubbed: false,
      model: completion.model,
      inputHash,
      data: { ...normalized, source: "ai" },
      message: "Element suggestions ready. Accept the ones you want to add.",
    };
  }

  async quickReanalysis(
    input: QuickReanalysisInput,
    options?: AIServiceOptions,
  ): Promise<
    AIServiceResult<{
      refreshed: boolean;
      imbalance?: ImbalanceAnalysis;
      ranAiPass: boolean;
    }>
  > {
    const tier = options?.modelTier ?? "quick";

    if (input.scope === "node" && input.targetId) {
      const result = await this.analyzeReadyNode(
        { projectId: input.projectId, nodeId: input.targetId },
        { modelTier: tier },
      );
      return {
        ok: result.ok,
        stubbed: result.stubbed,
        model: result.model,
        data: {
          refreshed: Boolean(result.ok && result.data && !result.data.deferred),
          ranAiPass: Boolean(result.ok && result.data && !result.data.deferred),
        },
        error: result.error,
        message: result.message,
        inputHash: result.inputHash,
      };
    }

    // Project/focus quick pass: only run small AI imbalance if significant shifts.
    const shifts = input.balanceShifts ?? [];
    if (!shifts.length) {
      return {
        ok: true,
        stubbed: true,
        data: { refreshed: true, ranAiPass: false },
        message:
          "Balance recalculated. No significant threshold shifts — skipped AI pass.",
      };
    }

    if (!hasOpenAIApiKey()) {
      return {
        ok: true,
        stubbed: true,
        data: { refreshed: true, ranAiPass: false },
        message: "Balance recalculated. AI pass deferred — configure OPENAI_API_KEY",
      };
    }

    const imbalance = await this.analyzeImbalance(
      {
        projectId: input.projectId,
        designFocusIds: shifts.map((s) => s.focusId),
      },
      { modelTier: tier },
    );

    return {
      ok: imbalance.ok,
      stubbed: imbalance.stubbed,
      model: imbalance.model,
      inputHash: imbalance.inputHash,
      data: {
        refreshed: true,
        ranAiPass: Boolean(imbalance.ok && imbalance.data),
        imbalance: imbalance.data,
      },
      error: imbalance.error,
      message: imbalance.ok
        ? "Quick reanalysis complete (balance + targeted AI)."
        : (imbalance.message ?? "Quick reanalysis AI pass failed"),
    };
  }

  async analyzeFullProject(
    input: FullProjectAnalysisInput,
    options?: AIServiceOptions,
  ): Promise<AIServiceResult<FullProjectAnalysis>> {
    const ctx = await buildProjectIntelligenceContext(input.projectId, {
      mode: "full",
      balanceLines: input.balanceLines,
    });
    if (!ctx) {
      return {
        ok: false,
        stubbed: true,
        error: "Project not found",
        message: "Project not found",
      };
    }

    if (!hasOpenAIApiKey()) {
      return {
        ok: false,
        stubbed: true,
        inputHash: ctx.inputHash,
        error: "OPENAI_API_KEY is not set",
        message: "Analysis pending — configure OPENAI_API_KEY",
      };
    }

    const tier = options?.modelTier ?? "deep";
    const completion = await openAIChatJson({
      system: `You are Project Brain's deep project analyst.
Manual full-project review using SELECTIVE summarized context (not full dumps).
Intent is source of truth. Be concrete and actionable. Advisory only.
Return JSON:
{
  "executiveSummary": string,
  "intentAlignment": { "score": number, "notes": string[] },
  "balanceNarrative": string,
  "strengths": string[],
  "risks": string[],
  "recommendedFocusAreas": string[],
  "gamePhaseNotes": string (optional)
}`,
      user: ctx.promptUser,
      modelTier: tier,
      temperature: 0.35,
    });

    if (!completion.ok) {
      return {
        ok: false,
        stubbed: false,
        model: completion.model,
        inputHash: ctx.inputHash,
        error: completion.error,
        message: completion.error,
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(completion.content);
    } catch {
      return {
        ok: false,
        stubbed: false,
        model: completion.model,
        inputHash: ctx.inputHash,
        error: "invalid AI JSON",
        message: "AI returned invalid JSON",
      };
    }

    const data = normalizeFullProjectAnalysis(parsed);
    if (!data) {
      return {
        ok: false,
        stubbed: false,
        model: completion.model,
        inputHash: ctx.inputHash,
        error: "AI output failed Zod validation",
        message: "AI output failed validation",
      };
    }

    return {
      ok: true,
      stubbed: false,
      model: completion.model,
      inputHash: ctx.inputHash,
      data,
      message: "Full project analysis ready (advisory, deep model).",
    };
  }
}

/** @deprecated Use ProjectBrainAIService — kept as alias for existing imports. */
export class StubAIService extends ProjectBrainAIService {}

let aiServiceSingleton: AIService | undefined;

export function getAIService(): AIService {
  if (!aiServiceSingleton) {
    aiServiceSingleton = new ProjectBrainAIService();
  }
  return aiServiceSingleton;
}
