import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Input } from "@qinolabs/ui-core/components/input";

import { dottedBackgroundStyle } from "~/ui/features/_shared/dotted-background";
import { FilterPill } from "~/ui/features/_shared/filter-pill";
import { IndexTile } from "~/ui/features/_shared/index-tile";
import { groupByRecency } from "~/ui/features/_shared/recency";
import { getStatusStyle } from "~/ui/features/_shared/status-config";
import { getNodeTypeTextClass } from "~/ui/features/_shared/type-config";
import { TodayNotes } from "~/ui/features/landing/today-notes";
import { useWorkspaceData } from "~/ui/features/workspace/workspace-context";
import { landingQueryOptions } from "~/ui/query-options";

/** Types excluded from the workspace index — they have dedicated UI elsewhere. */
const excludedTypes = new Set(["view", "arc", "navigator"]);

/**
 * Workspace index view — nodes grouped by recency with type filter pills.
 * Displays the root graph for the workspace, with action items sidebar.
 */
function WorkspaceIndexView() {
  const { workspace, graph } = useWorkspaceData();
  const { data: landing } = useQuery(landingQueryOptions());

  const [searchQuery, setSearchQuery] = useState("");
  const [activeType, setActiveType] = useState<string | null>(null);

  // Filter out excluded types
  const visibleNodes = graph.nodes.filter(
    (n) => !excludedTypes.has(n.type ?? ""),
  );

  // Collect unique types for pills
  const typeSet = new Set<string>();
  for (const node of visibleNodes) {
    if (node.type) typeSet.add(node.type);
  }
  const types = [...typeSet].sort();

  // Apply search + type filter
  const query = searchQuery.toLowerCase().trim();
  const isSearching = query !== "" || activeType !== null;
  const filtered = visibleNodes.filter((n) => {
    if (query && !n.title.toLowerCase().includes(query)) return false;
    if (activeType && n.type !== activeType) return false;
    return true;
  });

  // Sort by modified date (most recent first), then by title
  const sorted = [...filtered].sort((a, b) => {
    const ma = a.modified ?? 0;
    const mb = b.modified ?? 0;
    if (ma !== mb) return mb - ma;
    return a.title.localeCompare(b.title);
  });

  // Group into time sections
  const sections = groupByRecency(sorted);

  // Today's annotations scoped to this workspace
  const todayAnnotations = landing?.todayAnnotations.filter((item) => {
    if (!item.graphPath) return false;
    const itemWorkspace = item.graphPath.split("/")[0];
    return itemWorkspace === workspace;
  }) ?? [];

  return (
    <div
      className="flex h-full flex-col overflow-y-auto"
      style={dottedBackgroundStyle}
    >
      <div className="mx-auto w-full max-w-5xl px-6 py-8 space-y-6">
        {/* Search + filter pills */}
        <div className="space-y-3">
          <div className="max-w-sm">
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search nodes..."
            />
          </div>
          {types.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {types.map((type) => (
                <FilterPill
                  key={type}
                  label={type}
                  isActive={activeType === type}
                  onClick={() => setActiveType(activeType === type ? null : type)}
                  colorClass={getNodeTypeTextClass(type)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Main content + action items sidebar */}
        <div className="lg:flex lg:gap-8">
          <div className="min-w-0 flex-1 space-y-6">
            {/* Action items inline on mobile */}
            {!isSearching && (
              <div className="lg:hidden">
                <TodayNotes items={todayAnnotations} />
              </div>
            )}

            {/* Time-grouped node grid */}
            {sections.length > 0 ? (
              sections.map((section) => (
                <section key={section.key}>
                  <h2 className="mb-3 text-[10px] font-mono uppercase tracking-widest text-stone-500 dark:text-stone-500">
                    {section.label}
                  </h2>
                  <div className="grid max-w-3xl grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {section.nodes.map((node) => {
                      const status = getStatusStyle(node.status);
                      const nodeTypeColor = getNodeTypeTextClass(node.type);
                      return (
                        <IndexTile
                          key={node.id}
                          title={node.dir ?? node.id}
                          subtitle={
                            node.type ? (
                              <span className={nodeTypeColor}>{node.type}</span>
                            ) : undefined
                          }
                          to="/$workspace/node/$nodeId"
                          params={{ workspace, nodeId: node.id }}
                          search={{}}
                          borderClassName={status.border}
                          titleClassName={status.label}
                          opacityClassName={
                            node.status === "dormant" ? "opacity-50" : undefined
                          }
                        />
                      );
                    })}
                  </div>
                </section>
              ))
            ) : (
              <div className="border-2 border-dashed border-stone-200/40 px-4 py-6 text-center font-mono text-[11px] text-stone-400 dark:border-stone-800/30 dark:text-stone-600">
                {searchQuery || activeType
                  ? `No nodes match${searchQuery ? ` "${searchQuery}"` : ""}${activeType ? ` (${activeType})` : ""}`
                  : "No nodes yet"}
              </div>
            )}
          </div>

          {/* Action items sidebar on desktop */}
          {!isSearching && (
            <aside className="hidden lg:block lg:w-72 lg:shrink-0">
              <div className="sticky top-8">
                <TodayNotes items={todayAnnotations} />
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}

export { WorkspaceIndexView };
