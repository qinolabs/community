import { Link } from "@tanstack/react-router";

import type { GraphNodeEntry } from "~/server/types";

interface ArcTileProps {
  arc: GraphNodeEntry & { graphPath?: string };
}

function ArcTile({ arc }: ArcTileProps) {
  const isActive = arc.status === "active";

  // Extract workspace from graphPath (e.g., "qino-research" from "qino-research/arcs")
  const pathParts = arc.graphPath?.split("/") ?? [];
  const workspace = pathParts[0] ?? "";
  const subPath = pathParts.slice(1).join("/") || undefined;

  return (
    <Link
      to="/$workspace/node/$nodeId"
      params={{ workspace, nodeId: arc.id }}
      search={subPath ? { at: subPath } : {}}
      className={`
        block border-2 px-4 py-3 font-mono transition-colors
        hover:bg-stone-100/60 dark:hover:bg-stone-800/40
        ${
          isActive
            ? "border-amber-400/60 dark:border-amber-500/40 bg-stone-50/50 dark:bg-stone-900/40"
            : "border-stone-300/40 dark:border-stone-700/30 bg-stone-50/30 dark:bg-stone-900/20"
        }
      `}
    >
      <div className="flex items-start gap-2">
        <div
          className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
            isActive
              ? "bg-amber-400 dark:bg-amber-500 animate-pulse"
              : "bg-stone-400 dark:bg-stone-600"
          }`}
        />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium leading-tight text-stone-800 dark:text-stone-200">
            {arc.title}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[10px] text-stone-500 dark:text-stone-400">
            {arc.status && <span>{arc.status}</span>}
            {arc.created && (
              <>
                <span className="text-stone-300 dark:text-stone-600">&middot;</span>
                <span>{arc.created}</span>
              </>
            )}
            {arc.hasSubGraph && (
              <span className="text-stone-400 dark:text-stone-500">&oplus;</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

export { ArcTile };
