import { useSearch, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import type { GraphWithJournal, JournalSection } from "~/server/types";
import { journalQueryOptions } from "~/ui/query-options";
import { computeGraphPath } from "~/ui/lib/graph-path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScopedJournal {
  label: string;
  sections: JournalSection[];
  graphPath: string;
}

type JournalTab = "workspace" | "scoped";

// ---------------------------------------------------------------------------
// Route context derivation
// ---------------------------------------------------------------------------

/**
 * Derive the journal context string from the current route match state.
 *
 * - `/`                            -> "landing"
 * - `/graph`                       -> "graph"
 * - `/node/$nodeId`                -> "node/$nodeId"
 * - `/node/$nodeId?section=x`      -> "node/$nodeId/x"
 */
function useCurrentContext(): string {
  return useRouterState({
    select: (state) => {
      for (const match of [...state.matches].reverse()) {
        const params = match.params as Record<string, string | undefined>;
        if (params["nodeId"]) {
          const nodeId = params["nodeId"];
          const search = match.search as Record<string, string | undefined>;
          const section = search["section"];
          return section
            ? `node/${nodeId}/${section}`
            : `node/${nodeId}`;
        }
      }
      if (state.location.pathname === "/graph") {
        const graphSearch = state.location.search as Record<string, string | undefined>;
        const viewId = graphSearch.view;
        return viewId ? `view/${viewId}` : "graph";
      }
      return "landing";
    },
  });
}

/**
 * Extract target node ID from the current context string.
 * Pure derivation — no side effects.
 */
function deriveTargetNodeId(currentContext: string): string | null {
  if (currentContext.startsWith("view/")) return currentContext.slice(5);
  if (currentContext.startsWith("node/")) {
    const match = currentContext.match(/^node\/([^/]+)/);
    return match?.[1] ?? null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface JournalState {
  /** Whether the journal panel body is visible */
  journal: boolean;
  /** Which journal tab is active */
  activeTab: JournalTab;
  /** Node-scoped journal (available when viewing a node) */
  scopedJournal: ScopedJournal | null;
  /** Current route context string */
  currentContext: string;
  /** Top-level workspace journal sections */
  workspaceSections: JournalSection[];
}

interface UseJournalStateParams {
  /** Workspace identifier (e.g., "qinolabs-repo") */
  workspace: string;
  /** Sub-path within workspace (the `at` query param) */
  subPath?: string;
  /** The graph data (already fetched by the layout). May be undefined during initial load. */
  graph?: GraphWithJournal;
}

/**
 * Shared hook for journal state derived from URL params and graph data.
 *
 * The layout provides the graph and workspace context — this hook derives
 * journal visibility and scoped journal data from that context.
 */
function useJournalState(params: UseJournalStateParams): JournalState {
  const { workspace, subPath, graph } = params;
  const search = useSearch({ strict: false }) as {
    journal?: boolean;
    journalTab?: string;
  };
  const currentContext = useCurrentContext();

  const journal = search.journal === true;

  // Compute the full graph path for API calls
  const graphPath = computeGraphPath(workspace, subPath);

  // Derive scoped journal target from route context
  const targetNodeId = deriveTargetNodeId(currentContext);
  const nodeEntry = targetNodeId && graph
    ? graph.nodes.find((n) => n.id === targetNodeId)
    : null;
  const nodesDir = graph?.nodesDir ?? "nodes";
  const nodeRelPath = nodeEntry ? `${nodesDir}/${nodeEntry.dir}` : null;
  // Full path for the journal API
  const nodePath = nodeRelPath ? `${graphPath}/${nodeRelPath}` : null;

  // Only fetch scoped journal if we have a valid node path
  const { data: journalResult } = useQuery({
    ...journalQueryOptions(nodePath),
    enabled: !!nodePath,
  });

  // Show local journal tab for any node we're viewing.
  // The journal.md file will be created on first save if it doesn't exist.
  // (hasJournal on the graph entry is used for badges/indicators, not tab visibility)
  const scopedJournal: ScopedJournal | null = nodeEntry && nodePath
    ? { label: nodeEntry.title, sections: journalResult?.sections ?? [], graphPath: nodePath }
    : null;

  // Default to scoped when available. journalTab encodes context
  // ("workspace:node/abc") so the override auto-invalidates on navigation.
  const workspaceOverride = search.journalTab === `workspace:${currentContext}`;
  const activeTab: JournalTab = workspaceOverride
    ? "workspace"
    : scopedJournal ? "scoped" : "workspace";

  return {
    journal,
    activeTab,
    scopedJournal,
    currentContext,
    workspaceSections: graph?.journalSections ?? [],
  };
}

export { useJournalState };
export type { UseJournalStateParams, ScopedJournal, JournalTab };
