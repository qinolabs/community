import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChartNoAxesColumn, Eye, Workflow } from "lucide-react";

import { Tabs, CompactTab, CompactTabsList } from "~/ui/features/_shared/compact-tabs";
import { dottedBackgroundStyle } from "~/ui/features/_shared/dotted-background";
import { ShellActionButtons } from "~/ui/features/_shared/shell-actions";
import { WorkspaceGraph } from "~/ui/features/graph/workspace-graph";
import { DataVisualizationView } from "~/ui/features/node/data-visualization-view";
import { NodeDetailView, StatusBadge } from "~/ui/features/node/node-detail";
import { useWorkspaceData } from "~/ui/features/workspace/workspace-context";
import { computeGraphPath } from "~/ui/lib/graph-path";
import { graphQueryOptions, nodeQueryOptions } from "~/ui/query-options";
import { useDocumentTitle } from "~/ui/use-document-title";

type NodeViewTab = "details" | "graph" | "view" | "viz";
type NavigationTab = "workspace" | "parent";


function NodeView() {
  const { nodeId } = useParams({ strict: false }) as { nodeId: string };
  const search = useSearch({ strict: false }) as {
    section?: string;
    at?: string;
    view?: NodeViewTab;
  };
  const navigate = useNavigate();
  const { workspace, graph, config } = useWorkspaceData();

  // Determine active view — default to details
  const activeView: NodeViewTab =
    search.view === "graph" || search.view === "view" || search.view === "viz"
      ? search.view
      : "details";

  // Full graph path for API calls (workspace + subPath)
  const graphPath = computeGraphPath(workspace, search.at);

  // Subscribe to node data
  const { data: node } = useQuery(nodeQueryOptions(nodeId, graphPath));

  // Compute full sub-graph path for fetching (current path + node's subGraphPath)
  const subGraphFullPath = node?.subGraphPath
    ? search.at
      ? `${search.at}/${node.subGraphPath}`
      : node.subGraphPath
    : undefined;

  // Fetch sub-graph data only when graph view is active and node has sub-graph
  const { data: subGraph } = useQuery({
    ...graphQueryOptions(subGraphFullPath ? computeGraphPath(workspace, subGraphFullPath) : undefined),
    enabled: activeView === "graph" && !!subGraphFullPath,
  });

  // Set document title to node title
  const nodeTitle = node?.identity?.title ?? nodeId;
  useDocumentTitle(nodeTitle);

  const status = node?.identity?.status;
  const tags = Array.isArray(node?.identity?.["tags"])
    ? (node.identity["tags"] as string[])
    : [];

  // Derive sub-graph tab label — use title or fallback to a generic label
  const subGraphLabel = node?.subGraphTitle ?? "Explorations";

  // Check if node has a view (curated attention space)
  const hasView = node?.view !== null && node?.view !== undefined;

  // Check if node has data files with a schema (potential visualization)
  const canVisualize = (node?.dataFiles ?? []).some((f) => f.filename === "schema.json");

  // Breadcrumb provides full navigation ancestry from server
  // breadcrumb[0] is always workspace root (id: null)
  // breadcrumb[1+] are parent nodes if we're in a sub-graph
  const breadcrumb = node?.breadcrumb ?? [];
  const parentItem = breadcrumb.length > 1 ? breadcrumb[breadcrumb.length - 1] : null;
  const workspaceItem = breadcrumb[0];
  const isInSubGraph = parentItem !== null;

  function handleTabClick(tab: NodeViewTab | NavigationTab) {
    if (tab === "parent") {
      // Navigate to parent node with sub-graph tab active
      if (parentItem?.id) {
        void navigate({
          to: "/$workspace/node/$nodeId",
          params: { workspace, nodeId: parentItem.id },
          search: { at: parentItem.at, view: "graph" },
        });
      }
    } else {
      // Switch view on current node (tab is "details" | "graph" | "view")
      void navigate({
        to: ".",
        search: {
          ...search,
          view: tab === "details" ? undefined : tab,
        },
        replace: true,
      });
    }
  }

  return (
    <div
      className="relative h-full overflow-auto"
      style={dottedBackgroundStyle}
    >
      {/* Header bar with tabs and metadata */}
      <div className="sticky top-0 z-10 flex items-center justify-between bg-background/85 backdrop-blur-2xl px-4 py-2">
        {/* Left side: unified tabs for navigation */}
        <div className="flex min-w-0 items-center">
          <Tabs value={activeView} className="min-w-0">
            <CompactTabsList className="min-w-0 w-auto">
              {/* Parent sub-graph tab — shown when viewing a node within a sub-graph */}
              {isInSubGraph && (
                <CompactTab
                  value="parent"
                  className="gap-1.5 py-1 text-sm!"
                  onClick={() => handleTabClick("parent")}
                >
                  <Workflow className="size-3.5" />
                  <span className="max-w-40 truncate">{graph.title}</span>
                </CompactTab>
              )}
              {/* Current node overview tab — always shown */}
              <CompactTab
                value="details"
                className="min-w-0 shrink py-1 text-sm!"
                onClick={() => handleTabClick("details")}
              >
                <span className="truncate">{nodeTitle}</span>
              </CompactTab>
              {/* Current node's sub-graph tab */}
              {node?.hasSubGraph && (
                <CompactTab
                  value="graph"
                  className="gap-1.5 py-1 text-sm!"
                  onClick={() => handleTabClick("graph")}
                >
                  <Workflow className="size-3.5" />
                  <span>{subGraphLabel}</span>
                </CompactTab>
              )}
              {/* Current node's view tab */}
              {hasView && (
                <CompactTab
                  value="view"
                  className="gap-1.5 py-1 text-sm!"
                  onClick={() => handleTabClick("view")}
                >
                  <Eye className="size-3.5" />
                  <span>View</span>
                </CompactTab>
              )}
              {/* Data visualization tab */}
              {canVisualize && (
                <CompactTab
                  value="viz"
                  className="gap-1.5 py-1 text-sm!"
                  onClick={() => handleTabClick("viz")}
                >
                  <ChartNoAxesColumn className="size-3.5" />
                  <span>View</span>
                </CompactTab>
              )}
            </CompactTabsList>
          </Tabs>
        </div>

        {/* Right side: metadata + shell actions */}
        <div className="flex items-center gap-3">
          {tags.length > 0 && (
            <div className="flex gap-1">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded bg-neutral-200/50 px-1.5 py-0.5 text-[9px] font-mono text-neutral-500 dark:bg-neutral-800/50 dark:text-neutral-400"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          {status && <StatusBadge status={status} />}
          <ShellActionButtons graphPath={graphPath} nodeId={nodeId} />
        </div>
      </div>

      {/* Content area — switches between detail view, sub-graph, and view */}
      {activeView === "details" && node && (
        <NodeDetailView
          node={node}
          section={search.section}
          graphPath={graphPath}
          onNavigateToViz={canVisualize ? () => handleTabClick("viz") : undefined}
        />
      )}

      {activeView === "graph" && subGraph && subGraphFullPath && (
        <WorkspaceGraph
          graph={subGraph}
          workspace={workspace}
          subPath={subGraphFullPath}
          typeConfig={config.types}
          agentSignals={subGraph.agentSignals}
        />
      )}

      {activeView === "graph" && !subGraph && (
        <div className="flex h-full items-center justify-center">
          <div className="animate-pulse text-sm text-stone-400">
            Loading sub-graph...
          </div>
        </div>
      )}

      {activeView === "view" && node?.view && (
        <WorkspaceGraph
          graph={graph}
          workspace={workspace}
          subPath={search.at}
          typeConfig={config.types}
          highlightNodeIds={node.view.includes}
          focusNodeId={node.view.focal}
        />
      )}

      {activeView === "viz" && node && (
        <DataVisualizationView node={node} graphPath={graphPath} />
      )}
    </div>
  );
}

export { NodeView };
