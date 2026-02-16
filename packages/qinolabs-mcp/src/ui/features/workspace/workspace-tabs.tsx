import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { Tabs, CompactTab, CompactTabsList } from "~/ui/features/_shared/compact-tabs";
import { landingQueryOptions } from "~/ui/query-options";

interface WorkspaceTabsProps {
  currentWorkspace: string;
}

/**
 * Workspace switcher tabs — renders all protocol workspaces as tabs
 * matching the journal-tabs visual style.
 *
 * Uses cached landing data (prefetched in workspace route loader).
 */
function WorkspaceTabs({ currentWorkspace }: WorkspaceTabsProps) {
  const { data: landing } = useQuery(landingQueryOptions());
  const navigate = useNavigate();

  if (!landing) return null;

  // Same filter as landing page — only workspaces with graph.json, not container workspaces
  const workspaces = landing.workspaces.filter(
    (ws) => ws.nodeCount != null && ws.repoType !== "workspace",
  );

  if (workspaces.length === 0) return null;

  return (
    <Tabs value={currentWorkspace}>
      <CompactTabsList>
        {workspaces.map((ws) => (
          <CompactTab
            key={ws.path}
            value={ws.path}
            onClick={() => {
              if (ws.path !== currentWorkspace) {
                void navigate({
                  to: "/$workspace",
                  params: { workspace: ws.path },
                });
              }
            }}
          >
            {ws.name}
          </CompactTab>
        ))}
      </CompactTabsList>
    </Tabs>
  );
}

export { WorkspaceTabs };
