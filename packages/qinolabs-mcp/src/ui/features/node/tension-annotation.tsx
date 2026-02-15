import { useState } from "react";

import type { Annotation, AnnotationStatus } from "~/server/types";
import { formatAnnotationDate } from "~/ui/features/_shared/format-date";
import { MarkdownContent } from "~/ui/features/_shared/markdown-content";

interface TensionAnnotationProps {
  annotation: Annotation;
  status?: AnnotationStatus;
  onResolve?: (filename: string, status: "accepted" | "resolved" | "dismissed") => void;
}

/**
 * Tension annotation — collapsible, with amber accent.
 * Tensions signal something unexpected or conflicting that needs attention.
 */
function TensionAnnotation({ annotation, status, onResolve }: TensionAnnotationProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const effectiveStatus = status ?? annotation.meta.status ?? "open";
  const isResolved = effectiveStatus === "resolved";
  const isDismissed = effectiveStatus === "dismissed";

  // Preview from content
  const firstLine = annotation.content.split("\n").find((line) => line.trim());
  const preview = firstLine
    ? firstLine.replace(/^#{1,6}\s+/, "").slice(0, 80)
    : "";
  const hasMore = annotation.content.length > (firstLine?.length ?? 0) + 10;

  return (
    <div
      className={`rounded-lg border border-neutral-200/40 dark:border-neutral-800/40 bg-neutral-50/30 dark:bg-neutral-900/20 overflow-hidden ${
        isResolved || isDismissed ? "opacity-60" : ""
      }`}
    >
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-neutral-100/50 dark:hover:bg-neutral-800/30"
      >
        <span
          className={`text-[9px] text-neutral-400 dark:text-neutral-600 transition-transform ${
            isExpanded ? "rotate-90" : ""
          }`}
        >
          {hasMore ? "▶" : "•"}
        </span>
        {effectiveStatus !== "open" && (
          <span className="rounded bg-neutral-200/60 dark:bg-neutral-800/60 px-1.5 py-0.5 text-[9px] font-medium text-neutral-400 dark:text-neutral-500">
            {effectiveStatus}
          </span>
        )}
        <span
          className={`text-[10px] font-medium ${
            effectiveStatus === "open"
              ? "rounded bg-amber-100/60 dark:bg-amber-950/40 px-1.5 py-0.5 text-[9px] text-amber-600 dark:text-amber-400"
              : "text-amber-600 dark:text-amber-400"
          }`}
        >
          tension
        </span>
        {annotation.meta.target && (
          <>
            <span className="text-neutral-300 dark:text-neutral-700">→</span>
            <span className="font-mono text-[10px] text-neutral-400 dark:text-neutral-600">
              {annotation.meta.target}
            </span>
          </>
        )}
        {!isExpanded && preview && (
          <span className="truncate text-[11px] text-neutral-700 dark:text-neutral-300">
            {preview}
            {hasMore && "..."}
          </span>
        )}
        <span className="ml-auto shrink-0 text-[10px] text-neutral-400 dark:text-neutral-600">
          {formatAnnotationDate(annotation.meta.created)}
        </span>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-neutral-200/30 dark:border-neutral-800/30 px-4 py-3 space-y-2">
          <div className="text-[13px] leading-relaxed text-neutral-700 dark:text-neutral-300">
            <MarkdownContent>{annotation.content}</MarkdownContent>
          </div>

          {/* Action footer */}
          {effectiveStatus === "open" && onResolve && (
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => onResolve(annotation.filename, "resolved")}
                className="rounded px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50/60 dark:hover:bg-amber-950/40 transition-colors"
              >
                resolve
              </button>
              <button
                type="button"
                onClick={() => onResolve(annotation.filename, "dismissed")}
                className="rounded px-2 py-0.5 text-[10px] font-medium text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100/60 dark:hover:bg-neutral-800/40 transition-colors"
              >
                dismiss
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export { TensionAnnotation };
