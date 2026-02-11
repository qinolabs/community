import { cva, type VariantProps } from "class-variance-authority";

// ─── Workspace identity ─────────────────────────────────────

/**
 * Workspace repoType → text color classes.
 *
 * Colors derived from binomenav color schemes (homepage navigation):
 *   concepts → language section (lime)
 *   implementation → modalities section (indigo)
 *   research → research section (cyan)
 *   tool → practitioner section (violet)
 */
const workspaceTextVariants = cva("", {
  variants: {
    repoType: {
      concepts: "text-lime-600 dark:text-lime-400",
      implementation: "text-indigo-500 dark:text-indigo-400",
      research: "text-cyan-600 dark:text-cyan-400",
      tool: "text-violet-500 dark:text-violet-400",
    },
  },
});

type WorkspaceTextVariants = VariantProps<typeof workspaceTextVariants>;

const validRepoTypes = ["concepts", "implementation", "research", "tool"] as const;

type RepoType = (typeof validRepoTypes)[number];

const repoTypeSet: ReadonlySet<string> = new Set(validRepoTypes);

function isRepoType(value: string): value is RepoType {
  return repoTypeSet.has(value);
}

/** Safe wrapper accepting loose `string | undefined` from server data. */
function getWorkspaceTextClass(repoType: string | undefined): string {
  if (!repoType || !isRepoType(repoType)) return "";
  return workspaceTextVariants({ repoType });
}

// ─── Minimap colors ─────────────────────────────────────────

interface MinimapColor {
  light: string;
  dark: string;
}

const minimapColors: Record<string, MinimapColor> = {
  purple: { light: "rgba(168, 85, 247, 0.6)", dark: "rgba(168, 85, 247, 0.5)" },
  blue: { light: "rgba(59, 130, 246, 0.6)", dark: "rgba(59, 130, 246, 0.5)" },
  teal: { light: "rgba(45, 212, 191, 0.6)", dark: "rgba(45, 212, 191, 0.5)" },
  amber: { light: "rgba(245, 158, 11, 0.6)", dark: "rgba(245, 158, 11, 0.5)" },
  rose: { light: "rgba(251, 113, 133, 0.6)", dark: "rgba(251, 113, 133, 0.5)" },
  emerald: { light: "rgba(52, 211, 153, 0.6)", dark: "rgba(52, 211, 153, 0.5)" },
};

const defaultMinimapColor: MinimapColor = {
  light: "rgba(168, 162, 158, 0.6)",
  dark: "rgba(120, 113, 108, 0.5)",
};

function getMinimapColor(colorName: string | undefined): MinimapColor {
  if (!colorName) return defaultMinimapColor;
  return minimapColors[colorName] ?? defaultMinimapColor;
}

// ─── Node type colors ───────────────────────────────────────

/**
 * Node type → text color classes.
 *
 * Implementation types (qinolabs-repo):
 *   app, package, infra, reference, research, view
 *
 * Concepts types (qino-concepts):
 *   app      — app concepts (e.g., qino-world, qino-journey)
 *   tool     — tool concepts (e.g., qino-scribe, qino-attune)
 *   tech     — technology concepts (e.g., discovery-grid)
 *   ecosystem — cross-cutting patterns (e.g., domain-language)
 */
const nodeTypeTextVariants = cva("", {
  variants: {
    nodeType: {
      // Implementation types (qinolabs-repo)
      app: "text-indigo-500 dark:text-indigo-400",
      package: "text-violet-500 dark:text-violet-400",
      infra: "text-amber-600 dark:text-amber-400",
      reference: "text-teal-600 dark:text-teal-400",
      research: "text-cyan-600 dark:text-cyan-400",
      view: "text-emerald-600 dark:text-emerald-400",
      // Concepts types (qino-concepts)
      tool: "text-sky-500 dark:text-sky-400",
      tech: "text-amber-600 dark:text-amber-400",
      ecosystem: "text-lime-600 dark:text-lime-400",
      // Subgraph (neutral)
      subgraph: "text-stone-500 dark:text-stone-500",
    },
  },
});

type NodeTypeTextVariants = VariantProps<typeof nodeTypeTextVariants>;

const validNodeTypes = [
  // Implementation
  "app", "package", "infra", "reference", "research", "view",
  // Concepts
  "tool", "tech", "ecosystem",
  // Synthetic
  "subgraph",
] as const;

type NodeType = (typeof validNodeTypes)[number];

const nodeTypeSet: ReadonlySet<string> = new Set(validNodeTypes);

function isNodeType(value: string): value is NodeType {
  return nodeTypeSet.has(value);
}

/** Safe wrapper accepting loose `string | undefined` from server data. */
function getNodeTypeTextClass(nodeType: string | undefined): string {
  if (!nodeType || !isNodeType(nodeType)) return "";
  return nodeTypeTextVariants({ nodeType });
}

// ─── Exports ────────────────────────────────────────────────

export {
  workspaceTextVariants,
  getWorkspaceTextClass,
  nodeTypeTextVariants,
  getNodeTypeTextClass,
  getMinimapColor,
};
export type { WorkspaceTextVariants, NodeTypeTextVariants, MinimapColor };
