import { useState } from "react";
import { X } from "lucide-react";

import { Button } from "@qinolabs/ui-core/components/button";

import type { AgentSignal, AnnotationStatus } from "~/server/types";
import { MarkdownContent } from "~/ui/features/_shared/markdown-content";
import { signalStyles } from "~/ui/features/_shared/signal-config";

interface AnnotationCardProps {
  signal: AgentSignal | "proposed";
  /** Full markdown body — rendered when expanded. */
  content: string;
  /** Plain-text preview shown when collapsed. Auto-computed from content if omitted. */
  preview?: string;
  /** Title shown in header after signal badge (e.g., node title on landing page). */
  title?: string;
  /** Annotation target — displayed after signal badge with → arrow. */
  target?: string;
  /** Right-aligned timestamp text (e.g., "2h ago", "Feb 7"). */
  timestamp?: string;
  /** Lifecycle status — resolved/dismissed cards appear muted. */
  status?: AnnotationStatus;
  /** Renders hover X button. Consumer provides the handler; card handles event plumbing. */
  onDismiss?: () => void;
  /** Extra content rendered after markdown when expanded (e.g., StructuredConfig). */
  extraContent?: React.ReactNode;
  /** Action buttons rendered after content when expanded (e.g., resolve/accept). */
  actions?: React.ReactNode;
  /**
   * Footer element below preview in the collapse header area.
   * Interactive footers (e.g., links) should call e.stopPropagation()
   * to avoid triggering the collapse toggle.
   */
  footer?: React.ReactNode;
  /** Color palette for hover/interactive states. Defaults to "stone" (landing page). */
  palette?: "stone" | "neutral";
}

const borderBySignal: Record<string, string> = {
  reading: "border-emerald-300/25 dark:border-emerald-700/20",
  connection: "border-blue-300/25 dark:border-blue-700/20",
  proposal: "border-purple-300/25 dark:border-purple-700/20",
  tension: "border-amber-300/25 dark:border-amber-700/20",
  proposed: "border-dashed border-stone-300/30 dark:border-stone-600/20",
};

/** Strip common markdown syntax for plain-text preview display. */
function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, "")       // headings
    .replace(/\*\*(.+?)\*\*/g, "$1")    // bold
    .replace(/\*(.+?)\*/g, "$1")        // italic
    .replace(/_(.+?)_/g, "$1")          // italic (underscore)
    .replace(/`(.+?)`/g, "$1")          // inline code
    .replace(/\[(.+?)\]\(.+?\)/g, "$1") // links
    .replace(/^[-*]\s+/gm, "")          // list markers
    .trim();
}

function AnnotationCard({
  signal,
  content,
  preview,
  title,
  target,
  timestamp,
  status,
  onDismiss,
  extraContent,
  actions,
  footer,
  palette = "stone",
}: AnnotationCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const effectiveStatus = status ?? "open";
  const isMuted = effectiveStatus === "resolved" || effectiveStatus === "dismissed";
  const border = borderBySignal[signal] ?? borderBySignal.proposed;
  const hoverBg = palette === "neutral"
    ? "hover:bg-neutral-100/30 dark:hover:bg-neutral-800/20"
    : "hover:bg-stone-100/30 dark:hover:bg-stone-800/20";
  const style = signal !== "proposed" ? signalStyles[signal] : null;

  const displayPreview = preview ?? stripMarkdown(
    content.split("\n").find((line) => line.trim()) ?? "",
  ).slice(0, 100);

  const signalBadge = (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-medium ${
        style
          ? `${style.bg} ${style.text}`
          : "bg-stone-100/60 dark:bg-stone-800/40 text-stone-500 dark:text-stone-400"
      }`}
    >
      {signal}
    </span>
  );

  const statusBadge = effectiveStatus !== "open" ? (
    <span
      className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
        effectiveStatus === "accepted"
          ? "bg-teal-100/60 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400"
          : "bg-stone-200/60 dark:bg-stone-800/60 text-stone-400 dark:text-stone-500"
      }`}
    >
      {effectiveStatus}
    </span>
  ) : null;

  const hasExpandedExtras = extraContent != null || actions != null;

  return (
    <div className={`group relative border-2 ${border} font-mono transition-colors ${isMuted ? "opacity-60" : ""}`}>
      {/* Collapse header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={`flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors ${hoverBg}`}
      >
        <span
          className={`mt-0.5 text-[9px] text-stone-400 dark:text-stone-600 transition-transform ${
            isExpanded ? "rotate-90" : ""
          }`}
        >
          ▶
        </span>
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center gap-2">
            {statusBadge}
            {signalBadge}
            {title && (
              <span className="truncate text-[11px] font-medium leading-tight text-stone-800 dark:text-stone-200">
                {title}
              </span>
            )}
            {!title && !isExpanded && displayPreview && (
              <span className="truncate text-[11px] text-stone-700 dark:text-stone-300">
                {displayPreview}
              </span>
            )}
            {timestamp && (
              <span className="ml-auto shrink-0 text-[9px] text-stone-400 dark:text-stone-500">
                {timestamp}
              </span>
            )}
          </div>
          {target && (
            <div className="mb-1 ml-2 text-[10px] text-stone-400 dark:text-stone-500">
              <span className="text-stone-300 dark:text-stone-600">↳ </span>
              {target}
            </div>
          )}
          {title && !isExpanded && displayPreview && (
            <div className="line-clamp-2 text-[10px] leading-relaxed text-stone-500 dark:text-stone-400">
              {displayPreview}
            </div>
          )}
          {footer}
        </div>
      </button>

      {/* Dismiss button — visible on hover */}
      {onDismiss && (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={(e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            onDismiss();
          }}
          className="absolute right-1.5 top-1.5 hidden text-stone-400 dark:text-stone-500 group-hover:flex"
        >
          <X />
        </Button>
      )}

      {/* Expanded content */}
      {isExpanded && (
        <div className={`border-t border-stone-200/40 dark:border-stone-800/40 px-4 py-3${hasExpandedExtras ? " space-y-3" : ""}`}>
          <div className="text-[13px] text-stone-600 dark:text-stone-400">
            <MarkdownContent>{content}</MarkdownContent>
          </div>
          {extraContent}
          {actions}
        </div>
      )}
    </div>
  );
}

export { AnnotationCard, borderBySignal, stripMarkdown };
