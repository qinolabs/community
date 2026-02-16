import { useNavigate, useSearch } from "@tanstack/react-router";

import { Tabs, CompactTab, CompactTabsList } from "~/ui/features/_shared/compact-tabs";
import type { JournalTab } from "~/ui/features/workspace/use-journal-state";
import { useJournalState } from "~/ui/features/workspace/use-journal-state";
import { useWorkspaceData } from "~/ui/features/workspace/workspace-context";

/**
 * Journal tabs — toggle panel visibility + switch between scoped and workspace journal.
 *
 * Re-clicking the active tab closes the panel.
 * Clicking an inactive tab opens or switches.
 * Always labels the workspace journal "journal" regardless of context.
 */
function JournalTabs() {
  const { workspace, subPath, graph } = useWorkspaceData();
  const { journal, activeTab, scopedJournal, currentContext } =
    useJournalState({ workspace, subPath, graph });
  const search = useSearch({ strict: false });
  const navigate = useNavigate();

  function handleTabClick(tab: JournalTab) {
    if (journal && activeTab === tab) {
      // Re-click active tab → close panel
      const { journal: _j, journalTab: _jt, ...rest } = search as Record<string, unknown>;
      void navigate({
        to: ".",
        search: rest,
        replace: true,
      });
    } else {
      // Open panel or switch tab
      const { journalTab: _jt, ...rest } = search as Record<string, unknown>;
      void navigate({
        to: ".",
        search: {
          ...rest,
          journal: true,
          journalTab:
            tab === "workspace" ? `workspace:${currentContext}` : undefined,
        },
        replace: true,
      });
    }
  }

  return (
    <div className="flex items-center gap-8">
      <Tabs value={journal ? activeTab : null}>
        <CompactTabsList>
          {scopedJournal && (
            <CompactTab
              value="scoped"
              onClick={() => handleTabClick("scoped")}
            >
              {/* {scopedJournal.label} */}
              Local notes
            </CompactTab>
          )}
          <CompactTab
            value="workspace"
            onClick={() => handleTabClick("workspace")}
          >
            Workspace notes
          </CompactTab>
        </CompactTabsList>
      </Tabs>
    </div>
  );
}

export { JournalTabs };
