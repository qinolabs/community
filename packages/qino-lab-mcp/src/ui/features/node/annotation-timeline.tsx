import { useState } from "react";

import type { Annotation, AnnotationStatus } from "~/server/types";
import { ConnectionAnnotation } from "~/ui/features/node/connection-annotation";
import {
  extractProposalConfig,
  ProposalCard,
} from "~/ui/features/node/proposal-card";
import { ReadingAnnotation } from "~/ui/features/node/reading-annotation";
import { TensionAnnotation } from "~/ui/features/node/tension-annotation";

type ResolveCallback = (filename: string, status: "accepted" | "resolved" | "dismissed") => void;

interface AnnotationTimelineProps {
  annotations: Annotation[];
  /** Collapse older dates when more than this many groups exist */
  collapseThreshold?: number;
  /** Callback when user resolves/accepts/dismisses an annotation */
  onResolve?: ResolveCallback;
  /** Override statuses (for optimistic updates before refetch) */
  statusOverrides?: Map<string, AnnotationStatus>;
}

interface DateGroup {
  date: string;
  displayDate: string;
  annotations: Annotation[];
}

/**
 * Format a date string for display.
 * Input: "2025-02-07" or ISO date
 * Output: "Feb 7, 2025"
 */
function formatDate(dateStr: string): string {
  // Handle both "2025-02-07" and full ISO dates
  const datePart = dateStr.split("T")[0];
  if (!datePart) return dateStr;

  const [year, month, day] = datePart.split("-");
  if (!year || !month || !day) return dateStr;

  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const monthIndex = parseInt(month, 10) - 1;
  const monthName = monthNames[monthIndex] ?? month;
  const dayNum = parseInt(day, 10);

  return `${monthName} ${dayNum}, ${year}`;
}

/**
 * Group annotations by their created date.
 * Returns groups sorted by date (most recent first).
 */
function groupByDate(annotations: Annotation[]): DateGroup[] {
  const groups = new Map<string, Annotation[]>();

  for (const annotation of annotations) {
    const date = annotation.meta.created?.split("T")[0] ?? "unknown";
    const existing = groups.get(date) ?? [];
    existing.push(annotation);
    groups.set(date, existing);
  }

  // Sort groups by date descending (most recent first)
  const sortedGroups = Array.from(groups.entries()).sort(([a], [b]) =>
    b.localeCompare(a),
  );

  return sortedGroups.map(([date, anns]) => ({
    date,
    displayDate: date === "unknown" ? "Unknown date" : formatDate(date),
    annotations: anns,
  }));
}

/**
 * Render an annotation using the appropriate signal-specific component.
 */
function renderAnnotation(
  annotation: Annotation,
  onResolve?: ResolveCallback,
  statusOverride?: AnnotationStatus,
) {
  const id = `annotation-${annotation.filename}`;

  switch (annotation.meta.signal) {
    case "proposal": {
      const { config, reasoning } = extractProposalConfig(annotation.content);
      return (
        <div key={annotation.filename} id={id}>
          <ProposalCard
            annotation={annotation}
            config={config}
            reasoning={reasoning}
            status={statusOverride}
            onResolve={onResolve}
          />
        </div>
      );
    }
    case "tension":
      return (
        <div key={annotation.filename} id={id}>
          <TensionAnnotation
            annotation={annotation}
            status={statusOverride}
            onResolve={onResolve}
          />
        </div>
      );
    case "connection":
      return (
        <div key={annotation.filename} id={id}>
          <ConnectionAnnotation annotation={annotation} />
        </div>
      );
    case "reading":
    default:
      return (
        <div key={annotation.filename} id={id}>
          <ReadingAnnotation annotation={annotation} />
        </div>
      );
  }
}

/**
 * AnnotationTimeline — groups annotations by date in a timeline view.
 * Collapses older groups when there are many dates.
 */
function AnnotationTimeline({
  annotations,
  collapseThreshold = 3,
  onResolve,
  statusOverrides,
}: AnnotationTimelineProps) {
  // Filter out dismissed annotations by default
  const visibleAnnotations = annotations.filter((ann) => {
    const status = statusOverrides?.get(ann.filename) ?? ann.meta.status ?? "open";
    return status !== "dismissed";
  });

  const groups = groupByDate(visibleAnnotations);
  const [showAll, setShowAll] = useState(groups.length <= collapseThreshold);

  if (visibleAnnotations.length === 0) {
    return null;
  }

  const visibleGroups = showAll ? groups : groups.slice(0, collapseThreshold);
  const hiddenCount = groups.length - collapseThreshold;

  return (
    <div className="space-y-6">
      {visibleGroups.map((group) => (
        <div key={group.date}>
          {/* Date header */}
          <div className="flex items-center gap-3 mb-3">
            <div className="h-px flex-1 bg-neutral-200/40 dark:bg-neutral-800/40" />
            <span className="text-[10px] font-medium text-neutral-400 dark:text-neutral-600 uppercase tracking-wider">
              {group.displayDate}
            </span>
            <div className="h-px flex-1 bg-neutral-200/40 dark:bg-neutral-800/40" />
          </div>

          {/* Annotations for this date */}
          <div className="space-y-3">
            {group.annotations.map((annotation) =>
              renderAnnotation(
                annotation,
                onResolve,
                statusOverrides?.get(annotation.filename),
              ),
            )}
          </div>
        </div>
      ))}

      {/* Show more button */}
      {!showAll && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="w-full py-2 text-[11px] text-neutral-500 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
        >
          Show {hiddenCount} older {hiddenCount === 1 ? "date" : "dates"}
        </button>
      )}
    </div>
  );
}

export { AnnotationTimeline, renderAnnotation };
