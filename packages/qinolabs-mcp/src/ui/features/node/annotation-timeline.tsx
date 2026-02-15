import { useState } from "react";

import type { Annotation, AnnotationStatus } from "~/server/types";
import { AnnotationCard } from "~/ui/features/_shared/annotation-card";
import { formatAnnotationDate } from "~/ui/features/_shared/format-date";
import { StructuredConfig } from "~/ui/features/_shared/structured-config";
import { extractProposalConfig } from "~/ui/features/node/proposal-card";

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
 * Render an annotation using the shared AnnotationCard component.
 */
function renderAnnotation(
  annotation: Annotation,
  onResolve?: ResolveCallback,
  statusOverride?: AnnotationStatus,
) {
  const id = `annotation-${annotation.filename}`;
  const effectiveStatus = statusOverride ?? annotation.meta.status ?? "open";
  const timestamp = formatAnnotationDate(annotation.meta.created);

  switch (annotation.meta.signal) {
    case "proposal": {
      const { config, reasoning } = extractProposalConfig(annotation.content);
      return (
        <div key={annotation.filename} id={id}>
          <AnnotationCard
            palette="neutral"
            signal="proposal"
            content={reasoning}
            target={annotation.meta.target}
            timestamp={timestamp}
            status={effectiveStatus}
            extraContent={config ? <StructuredConfig config={config} /> : undefined}
            actions={
              effectiveStatus === "open" && onResolve ? (
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => onResolve(annotation.filename, "accepted")}
                    className="rounded px-2 py-0.5 text-[10px] font-medium text-teal-600 dark:text-teal-400 hover:bg-teal-50/60 dark:hover:bg-teal-950/40 transition-colors"
                  >
                    accept
                  </button>
                  <button
                    type="button"
                    onClick={() => onResolve(annotation.filename, "dismissed")}
                    className="rounded px-2 py-0.5 text-[10px] font-medium text-stone-500 dark:text-stone-400 hover:bg-stone-100/60 dark:hover:bg-stone-800/40 transition-colors"
                  >
                    dismiss
                  </button>
                </div>
              ) : effectiveStatus === "accepted" ? (
                <div className="pt-1 text-[10px] text-teal-500/70 dark:text-teal-400/50 font-mono">
                  waiting for agent to act on this
                </div>
              ) : undefined
            }
          />
        </div>
      );
    }
    case "tension":
      return (
        <div key={annotation.filename} id={id}>
          <AnnotationCard
            palette="neutral"
            signal="tension"
            content={annotation.content}
            target={annotation.meta.target}
            timestamp={timestamp}
            status={effectiveStatus}
            actions={
              effectiveStatus === "open" && onResolve ? (
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
                    className="rounded px-2 py-0.5 text-[10px] font-medium text-stone-500 dark:text-stone-400 hover:bg-stone-100/60 dark:hover:bg-stone-800/40 transition-colors"
                  >
                    dismiss
                  </button>
                </div>
              ) : undefined
            }
          />
        </div>
      );
    case "connection":
      return (
        <div key={annotation.filename} id={id}>
          <AnnotationCard
            palette="neutral"
            signal="connection"
            content={annotation.content}
            target={annotation.meta.target}
            timestamp={timestamp}
          />
        </div>
      );
    case "reading":
    default:
      return (
        <div key={annotation.filename} id={id}>
          <AnnotationCard
            palette="neutral"
            signal="reading"
            content={annotation.content}
            target={annotation.meta.target}
            timestamp={timestamp}
          />
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
