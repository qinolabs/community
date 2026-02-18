import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { Home } from "lucide-react";

import type { ImperativePanelHandle } from "@qinolabs/ui-core/components/resizable";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@qinolabs/ui-core/components/resizable";
import { Button } from "@qinolabs/ui-core/components/button";
import { ThemeToggle } from "@qinolabs/ui-core/components/theme-toggle";
import { useIsMobile } from "@qinolabs/ui-core/hooks/use-mobile";
import { cn } from "@qinolabs/ui-core/lib/utils";

import { Tabs, CompactTab, CompactTabsList } from "~/ui/features/_shared/compact-tabs";
import { JournalPanel } from "~/ui/features/workspace/journal-panel";
import { JournalTabs } from "~/ui/features/workspace/journal-tabs";
import { useJournalState } from "~/ui/features/workspace/use-journal-state";
import { WorkspaceContext } from "~/ui/features/workspace/workspace-context";
import { WorkspaceTabs } from "~/ui/features/workspace/workspace-tabs";
import { getWorkspaceBgClass } from "~/ui/features/_shared/type-config";
import { computeGraphPath, resolveWorkspace } from "~/ui/lib/graph-path";
import { configQueryOptions, graphQueryOptions } from "~/ui/query-options";
import { useDocumentTitle } from "~/ui/use-document-title";

/**
 * Workspace layout route component.
 *
 * Subscribes to route-loader-prefetched data via useQuery.
 * Child routes access graph + config via useWorkspaceData().
 */
function WorkspaceLayout() {
  const queryClient = useQueryClient();
  const params = useParams({ strict: false }) as { workspace?: string; nodeId?: string };
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const navigate = useNavigate();
  const workspace = params.workspace ?? "";
  const subPath = search.at as string | undefined;
  const graphPath = computeGraphPath(workspace, subPath);
  const isMobile = useIsMobile();
  const journalPanelRef = useRef<ImperativePanelHandle>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  // Subscribe to cache (instant hit — loader already prefetched)
  const { data: graph } = useQuery(graphQueryOptions(graphPath));
  const { data: config } = useQuery(configQueryOptions(resolveWorkspace(workspace)));

  // Journal state depends on graph data for scoped journal resolution
  const { journal, activeTab, scopedJournal } = useJournalState({ workspace, subPath, graph });

  // Ref to track search for auto-close navigation (avoids effect dep on search object)
  const searchRef = useRef(search);
  searchRef.current = search;

  // Workspace index detection — only true at /$workspace/ index route (no node, no sub-path)
  const isWorkspaceIndex = !subPath && !params.nodeId;

  // Sync journal state with panel collapse/expand (with temporary transition)
  useEffect(() => {
    const panel = journalPanelRef.current;
    if (!panel) return;

    // Enable transition only for programmatic changes
    setIsAnimating(true);

    if (journal) {
      panel.expand();
    } else {
      panel.collapse();
    }

    // Disable transition after animation completes
    const timeout = setTimeout(() => setIsAnimating(false), 300);
    return () => clearTimeout(timeout);
  }, [journal]);

  // Auto-close journal when navigating away from a page where the scoped tab was active
  const prevActiveTabRef = useRef(activeTab);
  useEffect(() => {
    const prevTab = prevActiveTabRef.current;
    prevActiveTabRef.current = activeTab;

    if (journal && prevTab === "scoped" && !scopedJournal) {
      const { journal: _j, journalTab: _jt, ...rest } = searchRef.current;
      void navigate({ to: ".", search: rest, replace: true });
    }
  }, [journal, activeTab, scopedJournal, navigate]);

  // Build document title: workspace name or graph title, with sub-path context
  const displayName = config?.name ?? graph?.title ?? workspace;
  const subPathLabel = subPath?.split("/").pop();
  const titleParts = subPathLabel ? [subPathLabel, displayName] : [displayName];
  useDocumentTitle(titleParts.join(" — "));

  // Loader guarantees graph is present — bail out if somehow missing
  if (!graph) return null;

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["graph"] });
    void queryClient.invalidateQueries({ queryKey: ["config"] });
  }

  return (
    <WorkspaceContext value={{ workspace, subPath, graph, config: config ?? {}, refresh }}>
      <div className={cn("flex h-full flex-col", getWorkspaceBgClass(config?.repoType))}>
        {/* Full-width navbar */}
        <header className="sticky top-0 z-20 w-full shrink-0">
          <div className="flex h-(--header-height) items-center justify-between px-4">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                render={(props) => (
                  <Link {...props} to="/" title="Home">
                    <Home className="size-3.5" />
                  </Link>
                )}
              />
              {isWorkspaceIndex ? (
                <WorkspaceTabs currentWorkspace={workspace} />
              ) : (
                <Tabs value={workspace}>
                  <CompactTabsList>
                    <CompactTab
                      value={workspace}
                      render={(props) => (
                        <Link
                          {...props}
                          to="/$workspace"
                          params={{ workspace }}
                        >
                          {displayName}
                        </Link>
                      )}
                    />
                  </CompactTabsList>
                </Tabs>
              )}
              {!isWorkspaceIndex && !params.nodeId && (
                <span className="text-[10px] font-mono text-stone-400 dark:text-stone-500">
                  {graph.nodes.length} nodes
                </span>
              )}
            </div>
            <div className="flex items-center gap-8">
              <div className="hidden md:block">
                <JournalTabs />
              </div>
              <ThemeToggle />
            </div>
          </div>
        </header>

        {/* Content area: main + journal */}
        <ResizablePanelGroup
          direction={isMobile ? "vertical" : "horizontal"}
          className="flex-1 overflow-hidden"
        >
          {/* Content card — frame (graph) or sheet (node detail) */}
          <ResizablePanel defaultSize={70} minSize={30}>
            <div className="h-full p-3 pt-2 min-h-0 min-w-0">
              <div className="flex h-full flex-col overflow-hidden rounded-xl bg-surface shadow-md">
                <Outlet />
              </div>
            </div>
          </ResizablePanel>

          {/* Journal panel — collapsible, full height of content area */}
          <ResizableHandle
            withHandle={false}
            className={cn(
              !journal && "pointer-events-none opacity-0 after:bg-none",
            )}
          />
          <ResizablePanel
            ref={journalPanelRef}
            defaultSize={30}
            minSize={15}
            maxSize={50}
            collapsible
            collapsedSize={0}
            className={cn(
              isAnimating && "transition-all duration-300 ease-in-out",
            )}
          >
            <div
              className={cn(
                "flex h-full flex-col overflow-hidden relative",
                isMobile && "px-2",
              )}
            >
              <div className="absolute md:hidden top-0 right-2">
                <JournalTabs />
              </div>
              <JournalPanel />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </WorkspaceContext>
  );
}

/**
 * Loading skeleton shown by the router while workspace data is being fetched.
 */
function WorkspaceLoadingSkeleton() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="animate-pulse space-y-3 w-64">
        <div className="h-4 w-24 rounded bg-neutral-200 dark:bg-neutral-800" />
        <div className="h-40 rounded bg-neutral-100 dark:bg-neutral-900" />
      </div>
    </div>
  );
}

export { WorkspaceLayout, WorkspaceLoadingSkeleton };
