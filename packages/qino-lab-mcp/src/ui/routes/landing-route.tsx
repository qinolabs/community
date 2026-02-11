import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { AppWindowMac, Compass } from "lucide-react";

import { Input } from "@qinolabs/ui-core/components/input";
import { Tabs, TabsList, TabsTab } from "@qinolabs/ui-core/components/tabs";

import type { RecentNode } from "~/server/types";
import { ROOT_WORKSPACE } from "~/ui/lib/graph-path";
import { dottedBackgroundStyle } from "~/ui/features/_shared/dotted-background";
import { IndexTile } from "~/ui/features/_shared/index-tile";
import { groupByRecency } from "~/ui/features/_shared/recency";
import { getStatusStyle } from "~/ui/features/_shared/status-config";
import { getWorkspaceTextClass } from "~/ui/features/_shared/type-config";
import { ActionItemsList } from "~/ui/features/landing/action-items-list";
import { ArcTile } from "~/ui/features/landing/arc-tile";
import { landingQueryOptions } from "~/ui/query-options";
import { useDocumentTitle } from "~/ui/use-document-title";

const viewTabClassName =
  "h-auto grow-0 px-2.5 py-1 text-xs! flex items-center gap-2";

const COLUMN_MAX = 4;

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[10px] font-mono uppercase tracking-widest text-stone-500 dark:text-stone-500">
      {children}
    </h2>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-2 border-dashed border-stone-200/40 px-4 py-6 text-center font-mono text-[11px] text-stone-400 dark:border-stone-800/30 dark:text-stone-600">
      {children}
    </div>
  );
}

/** Group nodes by their workspace path. */
function groupByWorkspace(nodes: RecentNode[]): Map<string, RecentNode[]> {
  const grouped = new Map<string, RecentNode[]>();
  for (const node of nodes) {
    const key = node.graphPath ?? "";
    const list = grouped.get(key);
    if (list) {
      list.push(node);
    } else {
      grouped.set(key, [node]);
    }
  }
  return grouped;
}

/** Render a RecentNode as an IndexTile with workspace-colored subtitle. */
function RecentNodeTile({
  node,
  workspaces,
}: {
  node: RecentNode;
  workspaces: { path: string; name: string; repoType?: string }[];
}) {
  const isSubGraph = node.type === "subgraph";
  const status = getStatusStyle(node.status);

  // For subgraphs, show parent dir (app name); otherwise show leaf dir
  const dirParts = node.dir?.split("/") ?? [];
  const dirName =
    (isSubGraph && dirParts.length > 1
      ? dirParts.at(-2)
      : dirParts.at(-1)) ?? node.id;

  // Extract workspace and sub-path from graphPath (e.g., "qinolabs-repo/implementations/sound-lab")
  const pathParts = node.graphPath?.split("/") ?? [];
  const workspaceId = pathParts[0] ?? "";
  const subPath = pathParts.slice(1).join("/") || undefined;

  // Find workspace for name and color
  const workspace = workspaces.find((ws) => ws.path === workspaceId);
  const workspaceName = workspace?.name ?? workspaceId;
  const workspaceColor = getWorkspaceTextClass(workspace?.repoType);

  // Second part: directory name for subgraphs, node type otherwise
  const secondPart = isSubGraph ? dirParts.at(-1) : node.type;

  const subtitle = workspaceName ? (
    <>
      <span className={workspaceColor}>{workspaceName}</span>
      {secondPart && (
        <>
          <span className="mx-1">&middot;</span>
          <span>{secondPart}</span>
        </>
      )}
    </>
  ) : (
    secondPart
  );

  // Build link props based on node type
  const linkProps = isSubGraph
    ? {
        to: "/$workspace/graph" as const,
        params: { workspace: workspaceId },
        search: subPath ? { at: subPath } : {},
      }
    : {
        to: "/$workspace/node/$nodeId" as const,
        params: { workspace: workspaceId, nodeId: node.id },
        search: subPath ? { at: subPath } : {},
      };

  return (
    <IndexTile
      title={dirName}
      subtitle={subtitle}
      to={linkProps.to}
      params={linkProps.params}
      search={linkProps.search}
      borderClassName={status.border}
      titleClassName={status.label}
      opacityClassName={node.status === "dormant" ? "opacity-50" : undefined}
    />
  );
}

function WorkspacesSection({
  protocolWorkspaces,
  isSearching,
  nodesByWorkspace,
}: {
  protocolWorkspaces: { path: string; name: string; repoType?: string; nodeCount?: number }[];
  isSearching: boolean;
  nodesByWorkspace: Map<string, RecentNode[]>;
}) {
  if (protocolWorkspaces.length === 0) return null;

  return (
    <section>
      <div className="mb-3">
        <SectionHeader>Workspaces</SectionHeader>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {protocolWorkspaces.map((ws) => {
          const wsNodes = isSearching
            ? (nodesByWorkspace.get(ws.path) ?? [])
            : [];
          const visibleNodes = wsNodes.slice(0, COLUMN_MAX);
          const overflow = wsNodes.length - COLUMN_MAX;

          return (
            <div key={ws.path} className="min-w-0 space-y-2">
              <IndexTile
                title={ws.name}
                count={isSearching ? wsNodes.length : ws.nodeCount}
                subtitle={ws.repoType}
                to="/$workspace"
                params={{ workspace: ws.path }}
                titleClassName={
                  getWorkspaceTextClass(ws.repoType) ||
                  "text-stone-700 dark:text-stone-300"
                }
              />

              {isSearching && visibleNodes.length > 0 && (
                <div className="space-y-1.5">
                  {visibleNodes.map((node) => {
                    const isSubGraph = node.type === "subgraph";
                    const status = getStatusStyle(node.status);
                    const pathParts = node.graphPath?.split("/") ?? [];
                    const nodeWorkspace = pathParts[0] ?? ws.path;
                    const nodeSubPath =
                      pathParts.slice(1).join("/") || undefined;
                    return (
                      <IndexTile
                        key={node.id}
                        title={node.title}
                        count={node.nodeCount}
                        subtitle={
                          node.type !== "subgraph" ? node.type : undefined
                        }
                        to={
                          isSubGraph
                            ? "/$workspace/graph"
                            : "/$workspace/node/$nodeId"
                        }
                        params={
                          isSubGraph
                            ? { workspace: nodeWorkspace }
                            : { workspace: nodeWorkspace, nodeId: node.id }
                        }
                        search={
                          nodeSubPath ? { at: nodeSubPath } : undefined
                        }
                        borderClassName={status.border}
                        titleClassName={status.label}
                        opacityClassName={
                          node.status === "dormant" ? "opacity-50" : undefined
                        }
                      />
                    );
                  })}
                  {overflow > 0 && (
                    <Link
                      to="/$workspace/graph"
                      params={{ workspace: ws.path }}
                      className="block py-1 text-center font-mono text-[10px] text-stone-400 hover:text-stone-600 dark:text-stone-600 dark:hover:text-stone-400 transition-colors"
                    >
                      +{overflow} more
                    </Link>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RecencySections({
  isSearching,
  recencySections,
  workspaces,
}: {
  isSearching: boolean;
  recencySections: { key: string; label: string; nodes: RecentNode[] }[];
  workspaces: { path: string; name: string; repoType?: string }[];
}) {
  if (isSearching) return null;

  if (recencySections.length === 0) {
    return <EmptyHint>no nodes yet</EmptyHint>;
  }

  return (
    <>
      {recencySections.map((section) => (
        <section key={section.key}>
          <div className="mb-3 flex items-center justify-between">
            <SectionHeader>{section.label}</SectionHeader>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {section.nodes.map((node) => (
              <RecentNodeTile
                key={
                  node.graphPath
                    ? `${node.graphPath}/${node.id}`
                    : node.id
                }
                node={node}
                workspaces={workspaces}
              />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

function LandingView() {
  const { data: landing } = useQuery(landingQueryOptions());
  const navigate = useNavigate();

  const [search, setSearch] = useState("");

  // Landing page uses base title
  useDocumentTitle(null);

  if (!landing) return null;

  const { arcs, workspaces, navigators, views, recentNodes, actionItems } =
    landing;

  // Only show content workspaces (have graph.json, not container workspaces)
  const protocolWorkspaces = workspaces.filter(
    (ws) => ws.nodeCount != null && ws.repoType !== "workspace",
  );

  // Search filtering
  const query = search.toLowerCase().trim();
  const isSearching = query !== "";

  const filtered = isSearching
    ? recentNodes.filter((n) => n.title.toLowerCase().includes(query))
    : recentNodes;

  const nodesByWorkspace = groupByWorkspace(filtered);

  // Sort active arcs first
  const sortedArcs = [...arcs].sort((a, b) => {
    if (a.status === "active" && b.status !== "active") return -1;
    if (a.status !== "active" && b.status === "active") return 1;
    return 0;
  });

  // Group nodes by recency (already sorted by modified from server)
  const recencySections = groupByRecency(recentNodes);

  return (
    <div
      className="flex h-full flex-col overflow-y-auto"
      style={dottedBackgroundStyle}
    >
      <div className="mx-auto w-full max-w-5xl px-6 py-8 space-y-8">
        {/* Search + Navigators + Views */}
        <div className="flex items-center gap-6">
          <div className="w-64">
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search nodes..."
            />
          </div>
          {navigators.length > 0 && (
            <Tabs value="">
              <TabsList className="bg-transparent">
                {navigators.map((nav) => {
                  const navWorkspace = nav.graphPath ?? ROOT_WORKSPACE;
                  return (
                    <TabsTab
                      key={nav.graphPath ? `${nav.graphPath}/${nav.id}` : nav.id}
                      value={nav.id}
                      className={viewTabClassName}
                      onClick={() => {
                        void navigate({
                          to: "/$workspace/node/$nodeId",
                          params: { workspace: navWorkspace, nodeId: nav.id },
                        });
                      }}
                    >
                      <Compass className="size-4" />
                      {nav.title}
                    </TabsTab>
                  );
                })}
              </TabsList>
            </Tabs>
          )}
          {views.length > 0 && (
            <Tabs value="">
              <TabsList className="bg-transparent">
                {views.map((view) => {
                  // Extract workspace and sub-path from graphPath
                  const pathParts = view.graphPath?.split("/") ?? [];
                  const viewWorkspace = pathParts[0] ?? "";
                  const viewSubPath = pathParts.slice(1).join("/") || undefined;
                  return (
                    <TabsTab
                      key={
                        view.graphPath
                          ? `${view.graphPath}/${view.id}`
                          : view.id
                      }
                      value={view.id}
                      className={viewTabClassName}
                      onClick={() => {
                        void navigate({
                          to: "/$workspace/graph",
                          params: { workspace: viewWorkspace },
                          search: { at: viewSubPath, view: view.id },
                        });
                      }}
                    >
                      <AppWindowMac className="size-4" />
                      {view.title}
                    </TabsTab>
                  );
                })}
              </TabsList>
            </Tabs>
          )}
        </div>

        {/* Arcs */}
        {!isSearching && sortedArcs.length > 0 && (
          <section>
            <div className="mb-3">
              <SectionHeader>Arcs</SectionHeader>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {sortedArcs.map((arc) => (
                <ArcTile key={arc.id} arc={arc} />
              ))}
            </div>
          </section>
        )}

        {/* Main content + action items sidebar */}
        <div className="lg:flex lg:gap-8">
          <div className="min-w-0 flex-1 space-y-8">
            <WorkspacesSection
              protocolWorkspaces={protocolWorkspaces}
              isSearching={isSearching}
              nodesByWorkspace={nodesByWorkspace}
            />
            {/* Action items inline on mobile */}
            {!isSearching && (
              <div className="lg:hidden">
                <ActionItemsList items={actionItems} />
              </div>
            )}
            <RecencySections
              isSearching={isSearching}
              recencySections={recencySections}
              workspaces={workspaces}
            />
          </div>
          {/* Action items sidebar on desktop */}
          {!isSearching && (
            <aside className="hidden lg:block lg:w-72 lg:shrink-0">
              <div className="sticky top-8">
                <ActionItemsList items={actionItems} />
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}

export { LandingView };
