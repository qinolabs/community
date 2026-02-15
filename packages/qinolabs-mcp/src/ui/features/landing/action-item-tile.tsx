import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AppWindowMac, Compass, X } from "lucide-react";

import { Button } from "@qinolabs/ui-core/components/button";

import type { ActionItem } from "~/server/types";
import { resolveAnnotation } from "~/ui/api-client";
import {
  AnnotationCard,
  borderBySignal,
  stripMarkdown,
} from "~/ui/features/_shared/annotation-card";
import { signalStyles } from "~/ui/features/_shared/signal-config";

interface ActionItemTileProps {
  item: ActionItem;
}

const DISMISSABLE_SIGNALS = new Set(["proposal", "tension"]);

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

/** Format epoch ms as relative time (e.g., "2h ago", "15m ago"). */
function formatRelativeTime(epochMs: number): string {
  const diffMs = Date.now() - epochMs;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Format graphPath as a readable breadcrumb trail.
 * Strips internal "nodes" segments and the "_root" prefix.
 * Example: "qinolabs-repo/implementations/nodes/qino-walk" → "qinolabs-repo · implementations · qino-walk"
 */
function formatGraphPath(graphPath: string | undefined): string | null {
  if (!graphPath || graphPath === "_root") return null;
  const segments = graphPath
    .split("/")
    .filter((s) => s !== "nodes");
  return segments.join(" · ");
}

function ActionItemTile({ item }: ActionItemTileProps) {
  const queryClient = useQueryClient();

  const expandable = item.content != null;
  const canDismiss = item.annotationFilename != null && DISMISSABLE_SIGNALS.has(item.signal);

  // Extract workspace and sub-path from graphPath
  const pathParts = item.graphPath?.split("/") ?? [];
  const workspace = pathParts[0] ?? "";
  const subPath = pathParts.slice(1).join("/") || undefined;

  const graphLabel = formatGraphPath(item.graphPath) ?? item.workspaceName ?? null;

  const nodeTypeIcon =
    item.nodeType === "navigator" ? <Compass className="inline size-2.5" /> :
    item.nodeType === "view" ? <AppWindowMac className="inline size-2.5" /> :
    null;

  const pathLabel = graphLabel ? (
    <span>
      {graphLabel}
      <span className="text-stone-300 dark:text-stone-600"> &middot; </span>
      {nodeTypeIcon}{nodeTypeIcon && " "}{item.nodeTitle}
    </span>
  ) : (
    <span>{nodeTypeIcon}{nodeTypeIcon && " "}{item.nodeTitle}</span>
  );

  function handleDismiss() {
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

  // Expandable card — uses shared AnnotationCard
  if (expandable) {
    const relativeTime = item.modified ? formatRelativeTime(item.modified) : null;

    return (
      <AnnotationCard
        signal={item.signal}
        content={item.content!}
        preview={stripMarkdown(item.preview)}
        title={item.nodeTitle}
        timestamp={relativeTime ?? undefined}
        onDismiss={canDismiss ? handleDismiss : undefined}
        footer={
          <Link
            to="/$workspace/node/$nodeId"
            params={{ workspace, nodeId: item.nodeId }}
            search={subPath ? { at: subPath } : {}}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            className="mt-1.5 block text-[9px] text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 transition-colors"
          >
            {pathLabel}
          </Link>
        }
      />
    );
  }

  // Non-expandable card — entire tile is a link (legacy action items)
  const border = borderBySignal[item.signal] ?? borderBySignal.proposed;
  const style =
    item.signal !== "proposed"
      ? signalStyles[item.signal]
      : null;

  const signalBadge = (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-medium ${
        style
          ? `${style.bg} ${style.text}`
          : "bg-stone-100/60 dark:bg-stone-800/40 text-stone-500 dark:text-stone-400"
      }`}
    >
      {item.signal}
    </span>
  );

  const strippedPreview = stripMarkdown(item.preview);

  return (
    <Link
      to="/$workspace/node/$nodeId"
      params={{ workspace, nodeId: item.nodeId }}
      search={subPath ? { at: subPath } : {}}
      className={`group relative block border-2 ${border} px-3 py-2.5 font-mono transition-colors hover:bg-stone-100/60 dark:hover:bg-stone-800/40`}
    >
      {/* Dismiss button — visible on hover */}
      {canDismiss && (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={(e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            handleDismiss();
          }}
          className="absolute right-1.5 top-1.5 hidden text-stone-400 dark:text-stone-500 group-hover:flex"
        >
          <X />
        </Button>
      )}

      {/* Signal badge */}
      <div className="mb-1.5">{signalBadge}</div>

      {/* Node title */}
      <div className="truncate text-[11px] font-medium leading-tight text-stone-800 dark:text-stone-200">
        {item.nodeTitle}
      </div>

      {/* Preview text */}
      {strippedPreview && (
        <div className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-stone-500 dark:text-stone-400">
          {strippedPreview}
        </div>
      )}

      {/* Metadata row */}
      <div className="mt-1.5 flex items-center gap-1.5 text-[9px] text-stone-400 dark:text-stone-500">
        {pathLabel}
        {(item.modified ?? item.created) && (
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
