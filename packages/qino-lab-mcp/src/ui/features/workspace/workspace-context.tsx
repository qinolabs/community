import { createContext, use } from "react";
import type { GraphWithJournal, WorkspaceConfig } from "~/server/types";

interface WorkspaceContextValue {
  /** Workspace identifier from URL path (e.g., "qinolabs-repo", "qino-concepts"). */
  workspace: string;
  /** Optional sub-path within the workspace (from `at` query param). */
  subPath?: string;
  graph: GraphWithJournal;
  config: WorkspaceConfig;
  /** Call after mutations to refetch graph data. */
  refresh: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function useWorkspaceData(): WorkspaceContextValue {
  const ctx = use(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspaceData must be used within a WorkspaceProvider");
  }
  return ctx;
}

export { WorkspaceContext, useWorkspaceData };
