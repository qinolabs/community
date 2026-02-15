import { useState } from "react";

import type { Annotation } from "~/server/types";
import { MarkdownContent } from "~/ui/features/_shared/markdown-content";

interface ConnectionAnnotationProps {
  annotation: Annotation;
}

/**
 * Connection annotation — collapsible, with blue accent.
 * Connections trace relationships between nodes, making the target visible.
 */
function ConnectionAnnotation({ annotation }: ConnectionAnnotationProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Preview from content
  const firstLine = annotation.content.split("\n").find((line) => line.trim());
  const preview = firstLine
    ? firstLine.replace(/^#{1,6}\s+/, "").slice(0, 80)
    : "";
  const hasMore = annotation.content.length > (firstLine?.length ?? 0) + 10;

  return (
    <div className="rounded-lg border border-neutral-200/40 dark:border-neutral-800/40 bg-neutral-50/30 dark:bg-neutral-900/20 overflow-hidden">
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
        <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400">
          connection
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
          {annotation.meta.created}
        </span>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-neutral-200/30 dark:border-neutral-800/30 px-4 py-3">
          <div className="text-[13px] leading-relaxed text-neutral-700 dark:text-neutral-300">
            <MarkdownContent>{annotation.content}</MarkdownContent>
          </div>
        </div>
      )}
    </div>
  );
}

export { ConnectionAnnotation };
