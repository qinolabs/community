import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { AppWindowMac } from "lucide-react";
import { Tabs, CompactTab, CompactTabsList } from "~/ui/features/_shared/compact-tabs";

import type { GraphEdge, GraphWithJournal } from "~/server/types";
import { WorkspaceGraph } from "~/ui/features/graph/workspace-graph";
import { useWorkspaceData } from "~/ui/features/workspace/workspace-context";
import { computeGraphPath } from "~/ui/lib/graph-path";
import { graphQueryOptions } from "~/ui/query-options";

/**
 * Filter graph data to show only nodes included in a view.
 * Uses curates edges from the view node to determine which nodes to show.
 * Excludes curates edges themselves from the filtered result.
 */
function filterGraphByView(
  graph: GraphWithJournal,
  edges: GraphEdge[],
  activeViewId: string,
): GraphWithJournal {
  const viewEdges = edges.filter(
    (e) => e.source === activeViewId && e.type === "curates",
  );
  const includedIds = new Set(viewEdges.map((e) => e.target));
  // Also include the view node itself
  includedIds.add(activeViewId);

  return {
    ...graph,
    nodes: graph.nodes.filter((n) => includedIds.has(n.id)),
    edges: edges.filter(
      (e) =>
        e.type !== "curates" &&
        includedIds.has(e.source) &&
        includedIds.has(e.target),
    ),
  };
}

const viewTabExtraClassName = "gap-2";

function GraphView() {
  const params = useParams({ strict: false }) as { workspace: string };
  const search = useSearch({ strict: false }) as { at?: string; view?: string; highlight?: string; focus?: string };
  const navigate = useNavigate();

  const { workspace, graph: rootGraph, config } = useWorkspaceData();

  // Subscribe to the correct graph — root or sub-graph based on `at` param.
  // Root graph is already cached from workspace loader. Sub-graph is cached
  // from the graph route loader.
  const graphPath = computeGraphPath(workspace, search.at);
  const { data: activeGraph } = useQuery(graphQueryOptions(graphPath));
  const graph = activeGraph ?? rootGraph;

  const typeConfig = config.types ?? {};
  const agentSignals = graph.agentSignals ?? {};

  // Extract view nodes for the tab bar (needed before resolving active view)
  const viewNodes = graph.nodes.filter((n) => n.hasView);

  // If no view param and we have views and we're at root level (no sub-graph),
  // default to the first view instead of showing the full graph.
  const firstView = viewNodes[0];
  const activeViewId =
    search.view ?? (firstView && !search.at ? firstView.id : null);

  function navigateToView(viewId: string | null) {
    void navigate({
      to: "/$workspace/graph",
      params: { workspace },
      search: {
        ...search,
        view: viewId ?? undefined,
      },
      replace: true,
    });
  }

  const highlightNodeIds = search.highlight ? search.highlight.split(",") : [];

  // Apply view filter if a view tab is active
  const graphData = activeViewId
    ? filterGraphByView(graph, graph.edges, activeViewId)
    : graph;

  /** Toggle view: clicking active tab deselects it (returns to full graph). */
  function handleViewClick(viewId: string) {
    navigateToView(activeViewId === viewId ? null : viewId);
  }

  return (
    <div className="flex h-full flex-col">
      {/* View tabs header — only shown when views exist */}
      {viewNodes.length > 0 && (
        <div className="flex shrink-0 items-center justify-end border-b border-stone-200/60 px-3 py-1.5 dark:border-stone-800/60">
          <Tabs value={activeViewId ?? ""}>
            <CompactTabsList>
              {viewNodes.map((node) => (
                <CompactTab
                  key={node.id}
                  value={node.id}
                  className={viewTabExtraClassName}
                  onClick={() => handleViewClick(node.id)}
                >
                  <AppWindowMac className={"size-4"} />
                  {node.title}
                </CompactTab>
              ))}
            </CompactTabsList>
          </Tabs>
        </div>
      )}

      {/* Connected graph — ReactFlow */}
      <div className="relative min-h-0 flex-1">
        <WorkspaceGraph
          graph={graphData}
          highlightNodeIds={highlightNodeIds}
          focusNodeId={search.focus}
          agentSignals={agentSignals}
          typeConfig={typeConfig}
          workspace={workspace}
          subPath={search.at}
        />
      </div>
    </div>
  );
}

export { GraphView };
