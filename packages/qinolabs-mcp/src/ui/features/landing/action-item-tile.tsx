import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

import type { ActionItem } from "~/server/types";
import { resolveAnnotation } from "~/ui/api-client";
import { signalStyles } from "~/ui/features/_shared/signal-config";

interface ActionItemTileProps {
  item: ActionItem;
}

const borderBySignal: Record<string, string> = {
  proposal:
    "border-purple-300/50 dark:border-purple-700/40",
  tension:
    "border-amber-300/50 dark:border-amber-700/40",
  proposed:
    "border-dashed border-stone-300/60 dark:border-stone-600/40",
};

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Format epoch ms as "HH:MM · Mon DD" */
function formatTimestamp(epochMs: number): string {
  const d = new Date(epochMs);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const mon = SHORT_MONTHS[d.getMonth()];
  const day = d.getDate();
  return `${hh}:${mm} · ${mon} ${day}`;
}

function ActionItemTile({ item }: ActionItemTileProps) {
  const queryClient = useQueryClient();

  // Extract workspace and sub-path from graphPath
  const pathParts = item.graphPath?.split("/") ?? [];
  const workspace = pathParts[0] ?? "";
  const subPath = pathParts.slice(1).join("/") || undefined;

  const border = borderBySignal[item.signal] ?? borderBySignal.proposed;
  const style =
    item.signal !== "proposed"
      ? signalStyles[item.signal]
      : null;

  function handleDismiss(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (!item.annotationFilename) return;

    resolveAnnotation(item.nodeId, item.annotationFilename, "dismissed", item.graphPath).then(
      () => {
        void queryClient.invalidateQueries({ queryKey: ["landing"] });
        void queryClient.invalidateQueries({ queryKey: ["node", item.nodeId] });
      },
      () => {
        // Silently fail — user can retry
      },
    );
  }

  return (
    <Link
      to="/$workspace/node/$nodeId"
      params={{ workspace, nodeId: item.nodeId }}
      search={subPath ? { at: subPath } : {}}
      className={`group relative block border-2 ${border} px-3 py-2.5 font-mono transition-colors hover:bg-stone-100/60 dark:hover:bg-stone-800/40`}
    >
      {/* Dismiss button — visible on hover */}
      {item.annotationFilename && (
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute right-2 top-2 hidden rounded p-0.5 text-[10px] text-stone-400 hover:bg-stone-200/60 hover:text-stone-600 dark:text-stone-500 dark:hover:bg-stone-700/60 dark:hover:text-stone-300 group-hover:block transition-colors"
        >
          ✕
        </button>
      )}

      {/* Signal badge */}
      <div className="mb-1.5">
        <span
          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium ${
            style
              ? `${style.bg} ${style.text}`
              : "bg-stone-100/60 dark:bg-stone-800/40 text-stone-500 dark:text-stone-400"
          }`}
        >
          {style && (
            <span className={`inline-block h-1 w-1 rounded-full ${style.color}`} />
          )}
          {item.signal}
        </span>
      </div>

      {/* Node title */}
      <div className="truncate text-[11px] font-medium leading-tight text-stone-800 dark:text-stone-200">
        {item.nodeTitle}
      </div>

      {/* Preview text */}
      {item.preview && (
        <div className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-stone-500 dark:text-stone-400">
          {item.preview}
        </div>
      )}

      {/* Metadata row */}
      <div className="mt-1.5 flex items-center gap-1.5 text-[9px] text-stone-400 dark:text-stone-500">
        {item.workspaceName && <span>{item.workspaceName}</span>}
        {item.workspaceName && (item.modified ?? item.created) && (
          <span className="text-stone-300 dark:text-stone-600">&middot;</span>
        )}
        {item.modified ? (
          <span>{formatTimestamp(item.modified)}</span>
        ) : item.created ? (
          <span>{item.created}</span>
        ) : null}
      </div>
    </Link>
  );
}

export { ActionItemTile };
