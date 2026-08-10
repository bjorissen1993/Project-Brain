import type { GenreTemplate } from "@/types";

/**
 * Genre focus templates live in code (not hard-coded balancing logic).
 * Selecting a genre surfaces suggested Design Focus categories; the creator decides.
 */
export const GENRE_TEMPLATES: GenreTemplate[] = [
  {
    key: "action-rpg",
    name: "Action RPG",
    description: "Real-time combat, progression, exploration, and character growth.",
    focuses: [
      {
        name: "Combat Feel",
        defaultImportance: 80,
        description:
          "How hits, timing, and feedback make fighting satisfying moment to moment.",
      },
      {
        name: "Character Progression",
        defaultImportance: 75,
        description:
          "Growth loops — levels, skills, and power fantasy over the long run.",
      },
      {
        name: "Exploration",
        defaultImportance: 65,
        description:
          "Discovering places, secrets, and routes that reward curiosity.",
      },
      {
        name: "Loot & Rewards",
        defaultImportance: 60,
        description:
          "Drops, gear, and payouts that make effort feel worthwhile.",
      },
      {
        name: "World Building",
        defaultImportance: 55,
        description:
          "Places, lore, and setting that make the world feel coherent.",
      },
      {
        name: "Quest Design",
        defaultImportance: 55,
        description:
          "Objectives and story beats that structure what the player pursues.",
      },
      {
        name: "Difficulty Curve",
        defaultImportance: 50,
        description:
          "How challenge ramps so mastery feels earned, not punishing.",
      },
    ],
  },
  {
    key: "soulslike",
    name: "Soulslike / Action RPG",
    description: "High-stakes combat, deliberate pacing, and mastery through failure.",
    focuses: [
      {
        name: "Combat Mastery",
        defaultImportance: 90,
        description:
          "Readable threat, precise timing, and skill that rewards practice.",
      },
      {
        name: "Boss Design",
        defaultImportance: 85,
        description:
          "Landmark fights that teach patterns and crown a mastery arc.",
      },
      {
        name: "Risk / Reward",
        defaultImportance: 80,
        description:
          "Tension between pushing forward and the cost of failure.",
      },
      {
        name: "Level Design & Shortcuts",
        defaultImportance: 75,
        description:
          "Connected spaces, loops, and shortcuts that reshape the journey.",
      },
      {
        name: "Atmosphere & Tone",
        defaultImportance: 70,
        description:
          "Mood, sound, and visual language that sell dread and wonder.",
      },
      {
        name: "Death / Recovery Loop",
        defaultImportance: 70,
        description:
          "What happens on failure — loss, return, and learning.",
      },
      {
        name: "Cryptic Narrative",
        defaultImportance: 55,
        description:
          "Story told through fragments, item text, and environmental clues.",
      },
      {
        name: "Build Variety",
        defaultImportance: 60,
        description:
          "Viable playstyles and loadouts that invite experimentation.",
      },
    ],
  },
  {
    key: "narrative-adventure",
    name: "Narrative Adventure",
    description: "Story-forward experiences driven by character, choice, and theme.",
    focuses: [
      {
        name: "Narrative Arc",
        defaultImportance: 90,
        description:
          "The overall story shape — setup, escalation, and payoff.",
      },
      {
        name: "Character Development",
        defaultImportance: 85,
        description:
          "How people change, deepen, and stay memorable across the story.",
      },
      {
        name: "Player Choice / Agency",
        defaultImportance: 75,
        description:
          "Moments where the player’s decisions meaningfully shape the path.",
      },
      {
        name: "Themes & Motifs",
        defaultImportance: 70,
        description:
          "Recurring ideas and symbols the experience keeps returning to.",
      },
      {
        name: "Pacing & Structure",
        defaultImportance: 70,
        description:
          "Rhythm of beats, scenes, and downtime so the journey feels intentional.",
      },
      {
        name: "Environmental Storytelling",
        defaultImportance: 60,
        description:
          "World details that imply story without explicit exposition.",
      },
      {
        name: "Dialogue Systems",
        defaultImportance: 55,
        description:
          "How conversations present options, voice, and character voice.",
      },
    ],
  },
  {
    key: "cozy",
    name: "Cozy",
    description: "Low-pressure loops focused on comfort, care, and gentle progress.",
    focuses: [
      {
        name: "Comfort & Tone",
        defaultImportance: 90,
        description:
          "Warmth, safety, and emotional ease as the default feeling.",
      },
      {
        name: "Daily / Seasonal Loops",
        defaultImportance: 75,
        description:
          "Gentle recurring rituals that make time feel lived-in.",
      },
      {
        name: "Relationships & Community",
        defaultImportance: 70,
        description:
          "Bonds with characters and places that grow through care.",
      },
      {
        name: "Collection & Crafting",
        defaultImportance: 65,
        description:
          "Gathering, making, and small creative goals without pressure.",
      },
      {
        name: "Aesthetic Identity",
        defaultImportance: 70,
        description:
          "Look, sound, and sensory style that define the cozy world.",
      },
      {
        name: "Soft Goals",
        defaultImportance: 60,
        description:
          "Optional aims that invite progress without failure stress.",
      },
    ],
  },
  {
    key: "survival",
    name: "Survival",
    description: "Resource scarcity, environmental threat, and long-term persistence.",
    focuses: [
      {
        name: "Resource Scarcity",
        defaultImportance: 85,
        description:
          "Limited materials that force prioritization and trade-offs.",
      },
      {
        name: "Threat Pressure",
        defaultImportance: 80,
        description:
          "Dangers that keep the player alert and planning ahead.",
      },
      {
        name: "Base / Shelter",
        defaultImportance: 70,
        description:
          "Safe ground to build, store, and recover between risks.",
      },
      {
        name: "Crafting Progression",
        defaultImportance: 70,
        description:
          "Recipes and tools that expand what survival makes possible.",
      },
      {
        name: "Exploration Risk",
        defaultImportance: 65,
        description:
          "Venturing out for reward while accepting danger and loss.",
      },
      {
        name: "Hunger / Stamina Systems",
        defaultImportance: 60,
        description:
          "Body needs that pace activity and force recovery choices.",
      },
    ],
  },
  {
    key: "resource-management",
    name: "Resource Management",
    description: "Allocation, efficiency, and trade-offs across constrained resources.",
    focuses: [
      {
        name: "Core Resources",
        defaultImportance: 90,
        description:
          "The primary currencies and materials the player stewards.",
      },
      {
        name: "Conversion Chains",
        defaultImportance: 75,
        description:
          "How inputs transform into outputs across linked systems.",
        children: [
          {
            name: "Inputs",
            defaultImportance: 60,
            description: "What feeds the chain — sources and intake rates.",
          },
          {
            name: "Outputs",
            defaultImportance: 60,
            description: "What the chain produces and where value lands.",
          },
          {
            name: "Bottlenecks",
            defaultImportance: 70,
            description:
              "Constraints that throttle flow and create decisions.",
          },
        ],
      },
      {
        name: "Economy Balance",
        defaultImportance: 80,
        description:
          "Sourcing, sinks, and prices that keep trade-offs meaningful.",
      },
      {
        name: "Decision Tension",
        defaultImportance: 75,
        description:
          "Hard choices when you cannot optimize everything at once.",
      },
      {
        name: "Scaling Over Time",
        defaultImportance: 65,
        description:
          "How capacity and demand grow without breaking the loop.",
      },
      {
        name: "UI Clarity for Resources",
        defaultImportance: 55,
        description:
          "Readable meters and flows so players can plan confidently.",
      },
    ],
  },
  {
    key: "management",
    name: "Management",
    description: "Systems of oversight: staffing, facilities, schedules, and throughput.",
    focuses: [
      {
        name: "Facility / Layout Design",
        defaultImportance: 75,
        description:
          "Spaces and placement that shape efficiency and fantasy.",
      },
      {
        name: "Staff / Agent Roles",
        defaultImportance: 70,
        description:
          "Who does what — roles, skills, and assignment choices.",
      },
      {
        name: "Throughput & Efficiency",
        defaultImportance: 80,
        description:
          "How much work moves through the system per unit time.",
      },
      {
        name: "Growth Goals",
        defaultImportance: 65,
        description:
          "Milestones that expand capacity, reach, or prestige.",
      },
      {
        name: "Crisis Events",
        defaultImportance: 55,
        description:
          "Disruptions that test plans and force reactive management.",
      },
      {
        name: "Player Fantasy of Control",
        defaultImportance: 70,
        description:
          "Feeling of competent oversight — seeing the system obey you.",
      },
    ],
  },
  {
    key: "simulation",
    name: "Simulation",
    description: "Emergent systems that reward observation, modeling, and intervention.",
    focuses: [
      {
        name: "System Fidelity",
        defaultImportance: 85,
        description:
          "How truthfully rules model the world the player is studying.",
      },
      {
        name: "Emergent Behavior",
        defaultImportance: 80,
        description:
          "Interesting outcomes that arise from interacting rules.",
      },
      {
        name: "Player Intervention Points",
        defaultImportance: 70,
        description:
          "Levers where the player can poke, tune, or redirect the sim.",
      },
      {
        name: "Feedback Visibility",
        defaultImportance: 75,
        description:
          "Clear signals so players can form and test mental models.",
      },
      {
        name: "Sandbox Goals",
        defaultImportance: 55,
        description:
          "Optional aims that give direction without a single script.",
      },
    ],
  },
  {
    key: "roguelike",
    name: "Roguelike",
    description: "Run-based structure, procedural variety, and meaningful failure.",
    focuses: [
      {
        name: "Run Structure",
        defaultImportance: 85,
        description:
          "The arc of a single attempt — start, peaks, and ending.",
      },
      {
        name: "Procedural Variety",
        defaultImportance: 80,
        description:
          "Fresh layouts, encounters, and surprises across runs.",
      },
      {
        name: "Meta Progression",
        defaultImportance: 70,
        description:
          "Between-run growth that makes failure still feel productive.",
      },
      {
        name: "Risk Decisions",
        defaultImportance: 75,
        description:
          "Gambles mid-run — greed, path choice, and survival odds.",
      },
      {
        name: "Build Synergies",
        defaultImportance: 75,
        description:
          "Item and ability combos that invent strong run identities.",
      },
      {
        name: "Death as Learning",
        defaultImportance: 65,
        description:
          "Failure that teaches and invites the next attempt.",
      },
    ],
  },
  {
    key: "metroidvania",
    name: "Metroidvania",
    description: "Interconnected maps gated by abilities and non-linear discovery.",
    focuses: [
      {
        name: "Map Connectivity",
        defaultImportance: 90,
        description:
          "How regions link, loop, and recontextualize as you grow.",
      },
      {
        name: "Ability Gating",
        defaultImportance: 85,
        description:
          "Powers that open paths and rewrite where you can go.",
      },
      {
        name: "Backtracking Rewards",
        defaultImportance: 75,
        description:
          "Returning with new tools to claim what you once couldn’t.",
      },
      {
        name: "Exploration Clarity",
        defaultImportance: 70,
        description:
          "Hints and landmarks so curiosity stays oriented, not lost.",
      },
      {
        name: "Combat / Traversal Feel",
        defaultImportance: 65,
        description:
          "Movement and fighting as a continuous, expressive verb set.",
      },
      {
        name: "Secret Density",
        defaultImportance: 60,
        description:
          "Hidden rooms and optional finds that reward thorough play.",
      },
    ],
  },
  {
    key: "strategy",
    name: "Strategy",
    description: "Planning, information, and competing objectives over time.",
    focuses: [
      {
        name: "Strategic Depth",
        defaultImportance: 90,
        description:
          "Meaningful long-term plans with layered, interacting choices.",
      },
      {
        name: "Information Asymmetry",
        defaultImportance: 70,
        description:
          "What you know vs. guess — fog, scouting, and uncertainty.",
      },
      {
        name: "Faction / Opponent Design",
        defaultImportance: 70,
        description:
          "Rivals with distinct goals, tools, and pressure patterns.",
      },
      {
        name: "Economy / Tech Trees",
        defaultImportance: 75,
        description:
          "Growth paths and unlocks that shape available strategies.",
      },
      {
        name: "Map / Theater Design",
        defaultImportance: 65,
        description:
          "Terrain and theaters that favor different approaches.",
      },
      {
        name: "Victory Conditions",
        defaultImportance: 70,
        description:
          "Win paths that define what the player is racing toward.",
      },
    ],
  },
  {
    key: "puzzle",
    name: "Puzzle",
    description: "Clear rules, satisfying solutions, and escalating challenge design.",
    focuses: [
      {
        name: "Core Puzzle Verb",
        defaultImportance: 90,
        description:
          "The central action or mechanic every puzzle revolves around.",
      },
      {
        name: "Rule Clarity",
        defaultImportance: 85,
        description:
          "Fair, learnable rules so struggle feels solvable, not opaque.",
      },
      {
        name: "Difficulty Escalation",
        defaultImportance: 80,
        description:
          "A climb of complexity that teaches before it demands mastery.",
      },
      {
        name: "Aha Moments",
        defaultImportance: 85,
        description:
          "Insight payoffs when the solution suddenly clicks.",
      },
      {
        name: "Hint / Assist Design",
        defaultImportance: 55,
        description:
          "Gentle help that unsticks players without spoiling delight.",
      },
      {
        name: "Theme Integration",
        defaultImportance: 50,
        description:
          "How setting and fiction make the puzzles feel of a piece.",
      },
    ],
  },
  {
    key: "shooter",
    name: "Shooter",
    description: "Aim, movement, encounter design, and weapon fantasy.",
    focuses: [
      {
        name: "Gunplay Feel",
        defaultImportance: 90,
        description:
          "Recoil, impact, and feedback that make shooting visceral.",
      },
      {
        name: "Movement",
        defaultImportance: 80,
        description:
          "Mobility verbs that let players dance around threats.",
      },
      {
        name: "Encounter Design",
        defaultImportance: 80,
        description:
          "Enemy setups and arenas that create interesting firefights.",
      },
      {
        name: "Weapon Variety",
        defaultImportance: 70,
        description:
          "Distinct tools that invite different approaches to fights.",
      },
      {
        name: "Map Flow",
        defaultImportance: 65,
        description:
          "Routes, cover, and sightlines that shape engagement pace.",
      },
      {
        name: "Feedback & Juice",
        defaultImportance: 60,
        description:
          "Hit confirm, VFX, and audio that sell every shot.",
      },
    ],
  },
  {
    key: "party-game",
    name: "Party Game",
    description: "Social play, readable rules, and short high-energy rounds.",
    focuses: [
      {
        name: "Social Fun",
        defaultImportance: 95,
        description:
          "Moments built for laughter, banter, and shared attention.",
      },
      {
        name: "Readable Rules",
        defaultImportance: 85,
        description:
          "Quick-to-grasp rules so everyone can jump in together.",
      },
      {
        name: "Round Length",
        defaultImportance: 80,
        description:
          "Short rounds that keep energy high and seating flexible.",
      },
      {
        name: "Spectator Enjoyment",
        defaultImportance: 70,
        description:
          "Drama that’s fun even when you’re waiting for your turn.",
      },
      {
        name: "Comeback Potential",
        defaultImportance: 65,
        description:
          "Ways trailing players can still spoil or steal the win.",
      },
      {
        name: "Minigame Variety",
        defaultImportance: 70,
        description:
          "A mix of modes so the night doesn’t feel repetitive.",
      },
    ],
  },
  {
    key: "sandbox",
    name: "Sandbox",
    description: "Player-authored goals inside a flexible toolset and world.",
    focuses: [
      {
        name: "Creative Tools",
        defaultImportance: 90,
        description:
          "Building, editing, and expressive systems players can misuse creatively.",
      },
      {
        name: "Player Goals",
        defaultImportance: 80,
        description:
          "Support for self-set aims instead of a single mandated path.",
      },
      {
        name: "World Reactivity",
        defaultImportance: 70,
        description:
          "A world that responds when players poke, build, or disrupt.",
      },
      {
        name: "Sharing / Persistence",
        defaultImportance: 60,
        description:
          "Saving, sharing, or returning to creations over time.",
      },
      {
        name: "Discovery Hooks",
        defaultImportance: 65,
        description:
          "Invitations that spark new experiments without railroading.",
      },
    ],
  },
  {
    key: "rpg",
    name: "RPG",
    description: "Character identity, systems of growth, and meaningful choice.",
    focuses: [
      {
        name: "Character Identity",
        defaultImportance: 85,
        description:
          "Who the player is — role, voice, and fantasy of self.",
      },
      {
        name: "Progression Systems",
        defaultImportance: 80,
        description:
          "Levels, skills, and unlocks that mark meaningful growth.",
      },
      {
        name: "Party / Build Fantasy",
        defaultImportance: 70,
        description:
          "Companions and builds that express a preferred playstyle.",
      },
      {
        name: "Quest & World Structure",
        defaultImportance: 70,
        description:
          "How adventures and places organize the RPG journey.",
      },
      {
        name: "Narrative Choice",
        defaultImportance: 65,
        description:
          "Story decisions that reflect values and change outcomes.",
      },
      {
        name: "Combat / Encounter Systems",
        defaultImportance: 60,
        description:
          "Fight or challenge rules that reinforce character fantasy.",
      },
    ],
  },
  {
    key: "custom",
    name: "Custom",
    description: "No preset focuses — define your own design language.",
    focuses: [],
  },
];

/** Default structural Project Areas when a genre has no specific list. */
export const DEFAULT_PROJECT_AREAS = [
  "Story",
  "Mechanics",
  "Characters",
  "World",
] as const;

/**
 * Genre → suggested Project Areas (structure only).
 * Independent from Design Focus pillars in `focuses`.
 */
const GENRE_PROJECT_AREAS: Record<string, string[]> = {
  "action-rpg": ["Story", "Combat", "Progression", "World", "Characters"],
  soulslike: ["World", "Combat", "Systems", "Lore", "Progression"],
  "narrative-adventure": ["Story", "Characters", "World", "Mechanics"],
  cozy: ["World", "Characters", "Activities", "Systems", "Story"],
  survival: ["World", "Systems", "Base", "Crafting", "Threats"],
  "resource-management": ["Systems", "Economy", "UI", "Content"],
  management: ["Facilities", "Staff", "Systems", "Economy", "Events"],
  simulation: ["Systems", "World", "Tools", "Scenarios"],
  roguelike: ["Runs", "Systems", "Content", "Meta", "Story"],
  metroidvania: ["World", "Abilities", "Combat", "Story", "Secrets"],
  strategy: ["Factions", "Systems", "Map", "Economy", "Story"],
  puzzle: ["Puzzles", "Rules", "Progression", "Presentation"],
  shooter: ["Combat", "Levels", "Weapons", "Progression", "Story"],
  "party-game": ["Minigames", "Modes", "Presentation", "Social"],
  sandbox: ["Tools", "World", "Systems", "Creation"],
  rpg: ["Story", "Characters", "World", "Systems", "Combat"],
  custom: [...DEFAULT_PROJECT_AREAS],
};

export function getGenreProjectAreas(key: string): string[] {
  return GENRE_PROJECT_AREAS[key] ?? [...DEFAULT_PROJECT_AREAS];
}

export function getGenreTemplate(key: string): GenreTemplate | undefined {
  const template = GENRE_TEMPLATES.find((t) => t.key === key);
  if (!template) return undefined;
  return {
    ...template,
    areas: getGenreProjectAreas(template.key),
  };
}

export function listGenreTemplateOptions() {
  return GENRE_TEMPLATES.map(({ key, name, description }) => ({
    key,
    name,
    description,
  }));
}

/** Look up a short pillar description from a genre template (by focus name). */
export function findGenreFocusDescription(
  templateKey: string | null | undefined,
  focusName: string,
): string | undefined {
  if (!templateKey) return undefined;
  const template = getGenreTemplate(templateKey);
  if (!template) return undefined;
  for (const focus of template.focuses) {
    if (focus.name === focusName && focus.description) return focus.description;
    for (const child of focus.children ?? []) {
      if (child.name === focusName && child.description) return child.description;
    }
  }
  return undefined;
}

/** Muted helper under importance sliders when no template description exists. */
export const IMPORTANCE_SLIDER_FALLBACK =
  "Higher means more of the experience should optimize for this design pillar.";
