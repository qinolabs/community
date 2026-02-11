import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

import type { Annotation, AnnotationStatus, ContentFile, NodeDetail } from "~/server/types";
import { resolveAnnotation as resolveAnnotationApi } from "~/ui/api-client";
import { MarkdownContent } from "~/ui/features/_shared/markdown-content";
import { signalStyles } from "~/ui/features/_shared/signal-config";
import {
  getStatusLabel,
  getStatusStyle,
} from "~/ui/features/_shared/status-config";
import {
  AnnotationTimeline,
  renderAnnotation,
} from "~/ui/features/node/annotation-timeline";
import { renderContentFile } from "~/ui/features/node/result-renderers";

interface NodeDetailViewProps {
  node: NodeDetail;
  section?: string;
  graphPath?: string;
}

function StatusBadge({ status }: { status: string | undefined }) {
  const style = getStatusStyle(status);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${style.border} border`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.indicator}`} />
      <span className={style.label}>{getStatusLabel(status)}</span>
    </span>
  );
}

/**
 * Group annotations by their target field.
 * Returns a map of target -> annotations for that target,
 * plus a list of annotations with no target (general notes).
 */
function groupAnnotationsByTarget(annotations: Annotation[]): {
  byTarget: Map<string, Annotation[]>;
  general: Annotation[];
} {
  const byTarget = new Map<string, Annotation[]>();
  const general: Annotation[] = [];

  for (const annotation of annotations) {
    if (annotation.meta.target) {
      const existing = byTarget.get(annotation.meta.target) ?? [];
      existing.push(annotation);
      byTarget.set(annotation.meta.target, existing);
    } else {
      general.push(annotation);
    }
  }

  return { byTarget, general };
}

/** Extract the first markdown heading (# or ##) from content, or fall back to first non-empty line. */
function extractHeading(content: string): string | null {
  for (const line of content.split("\n")) {
    const match = line.match(/^#{1,3}\s+(.+)/);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

/** Strip leading number prefix + extension to produce a readable label. */
function humanizeFilename(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, "") // strip extension
    .replace(/^\d+[-.]?\s*/, "") // strip leading number prefix
    .replace(/[-_]/g, " "); // dashes/underscores to spaces
}

interface ContentIndexEntry {
  filename: string;
  label: string;
  heading: string | null;
}

function buildContentIndex(files: ContentFile[]): ContentIndexEntry[] {
  return files.map((file) => ({
    filename: file.filename,
    label: humanizeFilename(file.filename),
    heading: extractHeading(file.content),
  }));
}

interface CollapsibleContentFileProps {
  file: ContentFile;
  annotations: Annotation[];
  isOpen: boolean;
  onToggle: () => void;
  onResolve?: (filename: string, status: "accepted" | "resolved" | "dismissed") => void;
  statusOverrides?: Map<string, AnnotationStatus>;
}

function CollapsibleContentFile({
  file,
  annotations,
  isOpen,
  onToggle,
  onResolve,
  statusOverrides,
}: CollapsibleContentFileProps) {
  return (
    <div className="-mx-8 border border-neutral-200/40 dark:border-neutral-800/30 bg-background/70">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-4 py-2 text-left font-mono text-[11px] text-neutral-500 dark:text-neutral-400 transition-colors hover:bg-neutral-100/60 dark:hover:bg-neutral-800/40"
      >
        <span
          className={`text-[9px] text-neutral-400 dark:text-neutral-600 transition-transform ${isOpen ? "rotate-90" : ""}`}
        >
          ▶
        </span>
        <span className="truncate">{file.filename}</span>
      </button>
      {isOpen && (
        <div className="border-t border-neutral-200/30 dark:border-neutral-800/20 px-8 pb-3 pt-2 space-y-2">
          {renderContentFile(file)}
          {annotations.map((annotation) =>
            renderAnnotation(annotation, onResolve, statusOverrides?.get(annotation.filename)),
          )}
        </div>
      )}
    </div>
  );
}

function NodeDetailView({ node, section, graphPath }: NodeDetailViewProps) {
  const storyRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  const fileRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const queryClient = useQueryClient();

  // Track which content file is currently expanded (null = all collapsed)
  const lastFile = node.contentFiles.at(-1)?.filename ?? null;
  const [openFile, setOpenFile] = useState<string | null>(lastFile);

  // Optimistic status overrides for annotations
  const [statusOverrides, setStatusOverrides] = useState<Map<string, AnnotationStatus>>(new Map());

  function handleResolve(filename: string, status: "accepted" | "resolved" | "dismissed") {
    // Optimistic update
    setStatusOverrides((prev) => new Map(prev).set(filename, status));

    // Fire API call and invalidate on success
    resolveAnnotationApi(node.id, filename, status, graphPath).then(
      () => {
        void queryClient.invalidateQueries({ queryKey: ["node", node.id] });
        void queryClient.invalidateQueries({ queryKey: ["landing"] });
      },
      () => {
        // Revert optimistic update on failure
        setStatusOverrides((prev) => {
          const next = new Map(prev);
          next.delete(filename);
          return next;
        });
      },
    );
  }

  // Scroll to the requested section
  useEffect(() => {
    const refs: Record<string, React.RefObject<HTMLElement | null>> = {
      story: storyRef,
      content: contentRef,
    };

    if (section && refs[section]?.current) {
      refs[section].current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [section]);

  const { byTarget, general } = groupAnnotationsByTarget(node.annotations);

  // Collect content filenames so we can find orphaned targeted annotations
  const contentFilenames = new Set(node.contentFiles.map((f) => f.filename));

  // Annotations whose target doesn't match any content filename
  const orphaned: Annotation[] = [];
  for (const [target, annotations] of byTarget) {
    if (!contentFilenames.has(target)) {
      orphaned.push(...annotations);
    }
  }

  const allGeneral = [...general, ...orphaned];

  const contentIndex = buildContentIndex(node.contentFiles);

  // Attention items: proposals and tensions (open + accepted only)
  const attentionItems = node.annotations.filter((a) => {
    if (a.meta.signal !== "proposal" && a.meta.signal !== "tension") return false;
    const status = statusOverrides.get(a.filename) ?? a.meta.status ?? "open";
    return status === "open" || status === "accepted";
  });

  function handleIndexClick(filename: string) {
    setOpenFile((prev) => (prev === filename ? null : filename));
    // Scroll to the corresponding content file after a tick (so it renders)
    requestAnimationFrame(() => {
      fileRefs.current
        .get(filename)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  /** Extract first line of annotation content for preview, stripping markdown. */
  function getPreview(content: string): string {
    const firstLine = content.split("\n").find((line) => line.trim());
    if (!firstLine) return "";
    // Strip common markdown: headers, bold, italic, links, code
    const stripped = firstLine
      .replace(/^#{1,6}\s+/, "") // headers
      .replace(/\*\*(.+?)\*\*/g, "$1") // bold
      .replace(/\*(.+?)\*/g, "$1") // italic
      .replace(/_(.+?)_/g, "$1") // italic alt
      .replace(/`(.+?)`/g, "$1") // inline code
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links
      .trim();
    return stripped.length > 80 ? `${stripped.slice(0, 80)}…` : stripped;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      {/* Needs Attention — proposals and tensions */}
      {attentionItems.length > 0 && (
        <section>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
            Needs Attention
          </h2>
          <div className="-mx-8 border border-neutral-200/40 dark:border-neutral-800/30 bg-background/70 px-8 py-3">
            <div className="space-y-1">
              {attentionItems.map((annotation) => {
                const style = signalStyles[annotation.meta.signal];
                const annStatus = statusOverrides.get(annotation.filename) ?? annotation.meta.status ?? "open";
                const isAccepted = annStatus === "accepted";
                const isProposal = annotation.meta.signal === "proposal";
                return (
                  <Link
                    key={annotation.filename}
                    to="."
                    search={(prev) => prev}
                    hash={`annotation-${annotation.filename}`}
                    className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left transition-colors hover:bg-neutral-100/60 dark:hover:bg-neutral-800/40"
                  >
                    <span
                      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                        isAccepted ? "bg-teal-500" : style.color
                      } ${isProposal && !isAccepted ? "animate-pulse" : ""}`}
                    />
                    <span
                      className={`shrink-0 text-[10px] font-medium ${
                        isAccepted ? "text-teal-600 dark:text-teal-400" : style.text
                      }`}
                    >
                      {isAccepted ? "accepted" : style.label}
                    </span>
                    <span className="truncate text-[11px] text-neutral-600 dark:text-neutral-400">
                      {getPreview(annotation.content)}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Index — compact grid for content navigation */}
      {contentIndex.length > 0 && (
        <section>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
            Index
          </h2>
          <div className="-mx-8 border border-neutral-200/40 dark:border-neutral-800/30 bg-background/70 px-8 py-3">
            <div className="columns-2 sm:columns-3">
              {contentIndex.map((entry, i) => (
                <button
                  key={entry.filename}
                  type="button"
                  onClick={() => handleIndexClick(entry.filename)}
                  className={`flex items-baseline gap-1.5 px-1.5 py-0.5 text-left font-mono text-[11px] transition-colors hover:bg-neutral-100/60 dark:hover:bg-neutral-800/40 ${
                    openFile === entry.filename
                      ? "text-neutral-800 dark:text-neutral-200"
                      : "text-neutral-500 dark:text-neutral-400"
                  }`}
                >
                  <span className="shrink-0 text-[10px] text-neutral-400 dark:text-neutral-600">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="line-clamp-1">
                    {entry.heading ?? entry.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Story */}
      {node.story && (
        <section ref={storyRef} id="story">
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
            Story
          </h2>
          <MarkdownContent>{node.story}</MarkdownContent>
        </section>
      )}

      {/* Content files — collapsible accordion */}
      {node.contentFiles.length > 0 && (
        <section ref={contentRef} id="content">
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
            Content
          </h2>
          <div className="space-y-1">
            {node.contentFiles.map((file) => {
              const targetAnnotations = byTarget.get(file.filename) ?? [];

              return (
                <div
                  key={file.filename}
                  ref={(el) => {
                    if (el) fileRefs.current.set(file.filename, el);
                  }}
                >
                  <CollapsibleContentFile
                    file={file}
                    annotations={targetAnnotations}
                    isOpen={openFile === file.filename}
                    onToggle={() =>
                      setOpenFile((prev) =>
                        prev === file.filename ? null : file.filename,
                      )
                    }
                    onResolve={handleResolve}
                    statusOverrides={statusOverrides}
                  />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* General agent annotations (no target) + orphaned targeted annotations */}
      {allGeneral.length > 0 && (
        <>
          {/* Separator before agent notes */}
          <div className="h-px bg-neutral-200/60 dark:bg-neutral-800/40" />
          <section>
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
              Agent Notes
            </h2>
            <AnnotationTimeline
              annotations={allGeneral}
              onResolve={handleResolve}
              statusOverrides={statusOverrides}
            />
          </section>
        </>
      )}
    </div>
  );
}

export { NodeDetailView, StatusBadge };
