import { useState } from "react";

import type { Annotation, AnnotationStatus, JsonRecord } from "~/server/types";
import { MarkdownContent } from "~/ui/features/_shared/markdown-content";
import { StructuredConfig } from "~/ui/features/_shared/structured-config";

// ---------------------------------------------------------------------------
// Config block extraction
// ---------------------------------------------------------------------------

const KNOWN_CONFIG_FIELDS = new Set([
  "figure",
  "lenses",
  "substrate_source",
  "depth",
  "depths",
  "model",
  "temperature",
  "prompt",
  "seed",
]);

/**
 * Extract a JSON config block from annotation content.
 * Returns the parsed config and the reasoning text (everything outside the block).
 * Returns null config if no valid config block is found.
 */
export function extractProposalConfig(content: string): {
  reasoning: string;
  config: JsonRecord | null;
} {
  const codeBlockRegex = /```(?:json)?\s*\n([\s\S]*?)\n```/;
  const match = content.match(codeBlockRegex);

  if (!match?.[1]) {
    return { reasoning: content, config: null };
  }

  try {
    const parsed: unknown = JSON.parse(match[1]);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      const hasKnownField = Object.keys(parsed).some((k) =>
        KNOWN_CONFIG_FIELDS.has(k),
      );
      if (hasKnownField) {
        const reasoning = content.replace(match[0], "").trim();
        return { reasoning, config: parsed as JsonRecord };
      }
    }
  } catch {
    // Not valid JSON — fall through
  }

  return { reasoning: content, config: null };
}

// ---------------------------------------------------------------------------
// ProposalCard component
// ---------------------------------------------------------------------------

interface ProposalCardProps {
  annotation: Annotation;
  config: JsonRecord | null;
  reasoning: string;
  status?: AnnotationStatus;
  onResolve?: (filename: string, status: "accepted" | "resolved" | "dismissed") => void;
}

/**
 * Proposal annotation — collapsible, with structured config extraction.
 * Same visual weight as other annotation types when collapsed.
 */
function ProposalCard({
  annotation,
  config,
  reasoning,
  status,
  onResolve,
}: ProposalCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const effectiveStatus = status ?? annotation.meta.status ?? "open";
  const isAccepted = effectiveStatus === "accepted";
  const isResolved = effectiveStatus === "resolved";
  const isDismissed = effectiveStatus === "dismissed";

  // Preview from reasoning text
  const firstLine = reasoning.split("\n").find((line) => line.trim());
  const preview = firstLine
    ? firstLine.replace(/^#{1,6}\s+/, "").slice(0, 80)
    : "";
  const hasMore = reasoning.length > (firstLine?.length ?? 0) + 10 || config !== null;

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
          <span
            className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
              isAccepted
                ? "bg-teal-100/60 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400"
                : "bg-neutral-200/60 dark:bg-neutral-800/60 text-neutral-400 dark:text-neutral-500"
            }`}
          >
            {effectiveStatus}
          </span>
        )}
        <span
          className={`text-[10px] font-medium ${
            effectiveStatus === "open"
              ? "rounded bg-purple-100/60 dark:bg-purple-950/40 px-1.5 py-0.5 text-[9px] text-purple-600 dark:text-purple-400"
              : "text-purple-600 dark:text-purple-400"
          }`}
        >
          proposal
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
        <div className="border-t border-neutral-200/30 dark:border-neutral-800/30 px-4 py-3 space-y-3">
          {/* Reasoning text */}
          {reasoning && (
            <div className="text-[13px] leading-relaxed text-neutral-700 dark:text-neutral-300">
              <MarkdownContent>{reasoning}</MarkdownContent>
            </div>
          )}

          {/* Proposed config */}
          {config && <StructuredConfig config={config} />}

          {/* Action footer */}
          {effectiveStatus === "open" && onResolve && (
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
                className="rounded px-2 py-0.5 text-[10px] font-medium text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100/60 dark:hover:bg-neutral-800/40 transition-colors"
              >
                dismiss
              </button>
            </div>
          )}
          {isAccepted && (
            <div className="pt-1 text-[10px] text-teal-500/70 dark:text-teal-400/50 font-mono">
              waiting for agent to act on this
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export { ProposalCard };
