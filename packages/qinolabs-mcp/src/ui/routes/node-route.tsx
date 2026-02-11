import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Eye, Workflow } from "lucide-react";

import { Tabs, TabsList, TabsTab } from "@qinolabs/ui-core/components/tabs";

import { dottedBackgroundStyle } from "~/ui/features/_shared/dotted-background";
import { WorkspaceGraph } from "~/ui/features/graph/workspace-graph";
import { NodeDetailView, StatusBadge } from "~/ui/features/node/node-detail";
import { useWorkspaceData } from "~/ui/features/workspace/workspace-context";
import { computeGraphPath } from "~/ui/lib/graph-path";
import { graphQueryOptions, nodeQueryOptions } from "~/ui/query-options";
import { useDocumentTitle } from "~/ui/use-document-title";

type NodeViewTab = "details" | "graph" | "view";
type NavigationTab = "workspace" | "parent";

const tabClassName = "h-auto grow-0 gap-1.5 px-2.5 py-1 text-xs!";

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
    search.view === "graph" || search.view === "view" ? search.view : "details";

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

  const modifiedLabel = node?.modified
    ? new Date(node.modified).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  // Derive sub-graph tab label — use title or fallback to a generic label
  const subGraphLabel = node?.subGraphTitle ?? "Explorations";

  // Check if node has a view (curated attention space)
  const hasView = node?.view !== null && node?.view !== undefined;

  // Breadcrumb provides full navigation ancestry from server
  // breadcrumb[0] is always workspace root (id: null)
  // breadcrumb[1+] are parent nodes if we're in a sub-graph
  const breadcrumb = node?.breadcrumb ?? [];
  const parentItem = breadcrumb.length > 1 ? breadcrumb[breadcrumb.length - 1] : null;
  const workspaceItem = breadcrumb[0];
  const isInSubGraph = parentItem !== null;

  function handleTabClick(tab: NodeViewTab | NavigationTab) {
    if (tab === "workspace") {
      if (parentItem?.id) {
        // When in sub-graph, navigate to parent node (details view)
        void navigate({
          to: "/$workspace/node/$nodeId",
          params: { workspace, nodeId: parentItem.id },
          search: { at: parentItem.at },
        });
      } else {
        // Navigate to workspace index
        void navigate({
          to: "/$workspace",
          params: { workspace },
        });
      }
    } else if (tab === "parent") {
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

  const hasMetadata = status || tags.length > 0 || modifiedLabel;

  return (
    <div
      className="relative flex h-full flex-col overflow-hidden"
      style={dottedBackgroundStyle}
    >
      {/* Header bar with tabs and metadata */}
      <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-stone-300/30 bg-stone-200/90 px-4 py-2 backdrop-blur-xl dark:border-stone-700/30 dark:bg-stone-950/90">
        {/* Left side: unified tabs for navigation */}
        <div className="flex items-center">
          <Tabs value={activeView}>
            <TabsList className="bg-transparent">
              {/* First tab: parent node when in sub-graph, workspace index otherwise */}
              <TabsTab
                value="workspace"
                className={tabClassName}
                onClick={() => handleTabClick("workspace")}
              >
                {parentItem?.title ?? config.name ?? workspaceItem?.title ?? "Workspace"}
              </TabsTab>
              {/* Parent sub-graph tab — shown when viewing a node within a sub-graph */}
              {isInSubGraph && (
                <TabsTab
                  value="parent"
                  className={tabClassName}
                  onClick={() => handleTabClick("parent")}
                >
                  <Workflow className="size-3.5" />
                  <span className="max-w-40 truncate">{graph.title}</span>
                </TabsTab>
              )}
              {/* Current node overview tab — always shown */}
              <TabsTab
                value="details"
                className={tabClassName}
                onClick={() => handleTabClick("details")}
              >
                {nodeTitle}
              </TabsTab>
              {/* Current node's sub-graph tab */}
              {node?.hasSubGraph && (
                <TabsTab
                  value="graph"
                  className={tabClassName}
                  onClick={() => handleTabClick("graph")}
                >
                  <Workflow className="size-3.5" />
                  <span>{subGraphLabel}</span>
                </TabsTab>
              )}
              {/* Current node's view tab */}
              {hasView && (
                <TabsTab
                  value="view"
                  className={tabClassName}
                  onClick={() => handleTabClick("view")}
                >
                  <Eye className="size-3.5" />
                  <span>View</span>
                </TabsTab>
              )}
            </TabsList>
          </Tabs>
        </div>

        {/* Right side: metadata */}
        {hasMetadata && (
          <div className="flex items-center gap-3">
            <StatusBadge status={status} />
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
            {modifiedLabel && (
              <span className="text-[10px] font-mono text-neutral-400 dark:text-neutral-600">
                {modifiedLabel}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Content area — switches between detail view, sub-graph, and view */}
      <div className="min-h-0 flex-1 overflow-auto">
        {activeView === "details" && node && (
          <NodeDetailView node={node} section={search.section} graphPath={graphPath} />
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
      </div>
    </div>
  );
}

export { NodeView };
