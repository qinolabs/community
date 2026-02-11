import { forwardRef, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";

import type { JournalSection } from "~/server/types";
import {
  checkpointJournal as apiCheckpointJournal,
  saveJournal as apiSaveJournal,
} from "~/ui/api-client";
import { MarkdownContent } from "~/ui/features/_shared/markdown-content";
import { useJournalState } from "~/ui/features/workspace/use-journal-state";
import { useWorkspaceData } from "~/ui/features/workspace/workspace-context";
import { computeGraphPath } from "~/ui/lib/graph-path";

/**
 * Map a context string to a route link for left-panel navigation.
 *
 * Context values:
 * - "opening" / "graph" -> graph view (root)
 * - "node/001"          -> node detail
 * - "node/001/results"  -> node detail with section param
 */
function contextToRoute(context: string, workspace: string, subPath?: string) {
  const atParam = subPath ? { at: subPath } : {};

  if (context === "opening" || context === "landing") {
    return { to: "/" as const, params: {}, search: {} };
  }

  if (context === "graph") {
    return {
      to: "/$workspace/graph" as const,
      params: { workspace },
      search: { ...atParam },
    };
  }

  const viewMatch = context.match(/^view\/(.+)$/);
  if (viewMatch) {
    const viewId = viewMatch[1]!;
    return {
      to: "/$workspace/graph" as const,
      params: { workspace },
      search: { view: viewId, ...atParam },
    };
  }

  const nodeMatch = context.match(/^node\/([^/]+)(?:\/(.+))?$/);
  if (nodeMatch) {
    const nodeId = nodeMatch[1]!;
    const section = nodeMatch[2];
    return {
      to: "/$workspace/node/$nodeId" as const,
      params: { workspace, nodeId },
      search: { ...(section ? { section } : {}), ...atParam },
    };
  }

  // Fallback: link to landing
  return { to: "/" as const, params: {}, search: {} };
}

function contextLabel(context: string): string {
  if (context === "opening") return "opening";
  if (context === "graph") return "viewing graph";
  const viewMatch = context.match(/^view\/(.+)$/);
  if (viewMatch) return `view · ${viewMatch[1]!.replace(/-/g, " ")}`;
  return context.replace(/\//g, " / ");
}

// ---------------------------------------------------------------------------
// Status types
// ---------------------------------------------------------------------------

type SaveStatus = "clean" | "dirty" | "saving";

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

function JournalPanel() {
  const { workspace, subPath, graph } = useWorkspaceData();
  const { workspaceSections, currentContext, scopedJournal, activeTab } =
    useJournalState({ workspace, subPath, graph });
  // Full graph path for API calls
  const graphPath = computeGraphPath(workspace, subPath);
  const [localSections, setLocalSections] =
    useState<JournalSection[]>(workspaceSections);
  const [localScopedSections, setLocalScopedSections] = useState<
    JournalSection[]
  >(scopedJournal?.sections ?? []);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("clean");
  const [checkpointing, setCheckpointing] = useState(false);
  const [checkpointMessage, setCheckpointMessage] = useState<string | null>(
    null,
  );
  const newSectionRef = useRef<HTMLTextAreaElement | null>(null);

  // Reset editing state when scope or active tab changes
  const [prevScopeLabel, setPrevScopeLabel] = useState<string | null>(null);
  const [prevActiveTab, setPrevActiveTab] = useState(activeTab);
  const currentScopeLabel = scopedJournal?.label ?? null;
  if (currentScopeLabel !== prevScopeLabel || activeTab !== prevActiveTab) {
    setPrevScopeLabel(currentScopeLabel);
    setPrevActiveTab(activeTab);
    setEditingIndex(null);
    setSaveStatus("clean");
  }

  // ── Active scope routing ─────────────────────────────────────────
  const isScoped = activeTab === "scoped" && scopedJournal;
  const activeSections = isScoped ? localScopedSections : localSections;
  const setActiveSections = isScoped
    ? setLocalScopedSections
    : setLocalSections;
  const activeGraphPath = isScoped ? scopedJournal.graphPath : undefined;
  const notesPlaceholder = isScoped ? "click to add note" : "click to add note";

  // ── Sync workspace sections from props ───────────────────────────
  const propKey = JSON.stringify(workspaceSections.map((s) => s.context));
  const lastPropKey = useRef(propKey);
  useEffect(() => {
    if (propKey !== lastPropKey.current) {
      lastPropKey.current = propKey;
      setLocalSections(workspaceSections);
      if (activeTab === "workspace") {
        setSaveStatus("clean");
      }
    }
  }, [propKey, workspaceSections, activeTab]);

  // ── Sync scoped sections from props ──────────────────────────────
  const scopedPropKey = JSON.stringify(
    (scopedJournal?.sections ?? []).map((s) => s.context),
  );
  const lastScopedPropKey = useRef(scopedPropKey);
  useEffect(() => {
    if (scopedPropKey !== lastScopedPropKey.current) {
      lastScopedPropKey.current = scopedPropKey;
      setLocalScopedSections(scopedJournal?.sections ?? []);
      if (activeTab === "scoped") {
        setSaveStatus("clean");
      }
    }
  }, [scopedPropKey, scopedJournal?.sections, activeTab]);

  // ── Ensure current context has a section (workspace tab only) ────
  // Context sections only apply to the workspace tab — scoped journals
  // don't need automatic context tracking.
  const [prevContext, setPrevContext] = useState<string | null>(null);
  if (currentContext !== prevContext) {
    setPrevContext(currentContext);
    if (activeTab === "workspace") {
      const hasSection = localSections.some(
        (s) => s.context === currentContext,
      );
      if (!hasSection && currentContext !== "opening") {
        const last = localSections[localSections.length - 1];
        if (last && !last.body.trim() && last.context !== "opening") {
          setLocalSections((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              context: currentContext,
              body: "",
            };
            return updated;
          });
        } else {
          setLocalSections((prev) => [
            ...prev,
            { context: currentContext, body: "" },
          ]);
        }
      }
    }
  }

  function updateSectionBody(index: number, body: string) {
    setActiveSections((prev) =>
      prev.map((s, i) => (i === index ? { ...s, body } : s)),
    );
    setSaveStatus("dirty");
  }

  async function handleBlur(index: number) {
    setEditingIndex(null);

    // Filter out empty sections (auto-cleanup on blur)
    const sectionsToSave = activeSections.filter((s) => s.body.trim());
    const hadEmptySections = sectionsToSave.length !== activeSections.length;

    // Update local state to remove empties
    if (hadEmptySections) {
      setActiveSections(sectionsToSave);
    }

    // Save if dirty or if we removed empty sections
    if (saveStatus !== "dirty" && !hadEmptySections) return;

    setSaveStatus("saving");
    try {
      await apiSaveJournal(sectionsToSave, activeGraphPath);
      setSaveStatus("clean");
    } catch {
      setSaveStatus("dirty");
    }
  }

  function createSectionForCurrentContext() {
    const newIndex = activeSections.length;
    const context = isScoped ? "opening" : currentContext;
    setActiveSections((prev) => [...prev, { context, body: "" }]);
    setEditingIndex(newIndex);
    requestAnimationFrame(() => {
      newSectionRef.current?.focus();
    });
  }

  async function handleCheckpoint() {
    setCheckpointing(true);
    setCheckpointMessage(null);
    try {
      // Always filter empty sections before save/checkpoint
      const sectionsToSave = activeSections.filter((s) => s.body.trim());
      const hadEmptySections = sectionsToSave.length !== activeSections.length;

      // Update local state to remove empties
      if (hadEmptySections) {
        setActiveSections(sectionsToSave);
      }

      // Save if dirty or if we removed empty sections
      if (saveStatus === "dirty" || hadEmptySections) {
        setSaveStatus("saving");
        await apiSaveJournal(sectionsToSave, activeGraphPath);
        setSaveStatus("clean");
      }

      const result = await apiCheckpointJournal(activeGraphPath);
      setCheckpointMessage(
        result.committed ? "checkpoint committed" : "nothing to commit",
      );
      setTimeout(() => setCheckpointMessage(null), 2500);
    } catch {
      setCheckpointMessage("checkpoint failed");
      setTimeout(() => setCheckpointMessage(null), 3000);
    } finally {
      setCheckpointing(false);
    }
  }

  // Filter sections for display — only show sections with content OR currently being edited
  const displaySections = activeSections
    .map((section, originalIndex) => ({ section, originalIndex }))
    .filter(({ section, originalIndex }) =>
      section.body.trim() || editingIndex === originalIndex
    );

  return (
    <div className="flex h-full flex-col">
      {/* Scrollable sections */}
      <div className="flex-1 overflow-y-auto">
        {displaySections.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6">
            <button
              type="button"
              onClick={createSectionForCurrentContext}
              className="text-xs self-stretch text-neutral-400 dark:text-neutral-600 hover:text-neutral-600 dark:hover:text-neutral-400 transition-colors cursor-text italic"
            >
              {notesPlaceholder}
            </button>
          </div>
        ) : (
          <div className="space-y-4 p-4">
            {displaySections.map(({ section, originalIndex }, displayIndex) => {
              const isCurrent = section.context === currentContext;
              const isEditing = editingIndex === originalIndex;

              return (
                <div key={`${section.context}-${originalIndex}`}>
                  {/* Context header for navigated sections; thin divider between opening sections */}
                  {section.context !== "opening" ? (
                    <ContextHeader
                      context={section.context}
                      isCurrent={isCurrent}
                      workspace={workspace}
                      subPath={subPath}
                    />
                  ) : displayIndex > 0 ? (
                    <div className="mb-2 flex items-center">
                      <div className="h-px flex-1 bg-neutral-200/60 dark:bg-neutral-800/40" />
                    </div>
                  ) : null}

                  {/* Section body */}
                  {isEditing ? (
                    <SectionTextarea
                      ref={
                        originalIndex === activeSections.length - 1
                          ? newSectionRef
                          : undefined
                      }
                      value={section.body}
                      onChange={(value) => updateSectionBody(originalIndex, value)}
                      onBlur={() => void handleBlur(originalIndex)}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingIndex(originalIndex)}
                      className="w-full cursor-text text-left text-[12px] leading-relaxed text-neutral-700 dark:text-neutral-300"
                    >
                      {section.body.trim() ? (
                        <MarkdownContent>{section.body}</MarkdownContent>
                      ) : (
                        <span className="text-neutral-400 dark:text-neutral-600 italic">
                          {notesPlaceholder}
                        </span>
                      )}
                    </button>
                  )}
                </div>
              );
            })}

            {/* Prompt to add notes — workspace: when no section for context; scoped: always */}
            {(isScoped ||
              (activeTab === "workspace" &&
                !activeSections.some((s) => s.context === currentContext))) && (
              <div>
                {!isScoped && currentContext !== "opening" && (
                  <div className="mb-2 flex items-center gap-2 text-[10px] text-neutral-400 dark:text-neutral-600">
                    <div className="h-px flex-1 bg-neutral-200/60 dark:bg-neutral-800/40" />
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500/60" />
                    <span className="shrink-0 font-mono">
                      {contextLabel(currentContext)}
                    </span>
                    <div className="h-px flex-1 bg-neutral-200/60 dark:bg-neutral-800/40" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={createSectionForCurrentContext}
                  className="w-full cursor-text rounded-md border border-dashed border-neutral-200/40 dark:border-neutral-800/40 px-3 py-2 text-left text-[12px] text-neutral-400 dark:text-neutral-600 italic"
                >
                  {notesPlaceholder}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer: context + status + checkpoint */}
      <div className="shrink-0 px-4 py-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] text-neutral-400 dark:text-neutral-600">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500/60" />
            <span className="font-mono">
              {isScoped ? scopedJournal.label : contextLabel(currentContext)}
            </span>
            <StatusIndicator status={saveStatus} />
          </div>

          <div className="flex items-center gap-2">
            {checkpointMessage && (
              <span className="text-[10px] font-mono text-neutral-400 dark:text-neutral-600">
                {checkpointMessage}
              </span>
            )}
            <button
              type="button"
              onClick={() => void handleCheckpoint()}
              disabled={checkpointing}
              className="rounded px-1.5 py-0.5 text-[10px] font-mono text-neutral-400 dark:text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-900 hover:text-neutral-600 dark:hover:text-neutral-400 transition-colors disabled:opacity-40"
              title="Checkpoint journal (git commit)"
            >
              {checkpointing ? "..." : "cp"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status Indicator
// ---------------------------------------------------------------------------

function StatusIndicator({ status }: { status: SaveStatus }) {
  if (status === "clean") return null;

  if (status === "saving") {
    return (
      <span className="ml-1 text-[10px] font-mono text-neutral-400 dark:text-neutral-500">
        saving...
      </span>
    );
  }

  return (
    <span className="ml-1 text-[10px] font-mono text-amber-500 dark:text-amber-400">
      unsaved
    </span>
  );
}

// ---------------------------------------------------------------------------
// Auto-Resizing Textarea
// ---------------------------------------------------------------------------

interface SectionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}

const SectionTextarea = forwardRef<HTMLTextAreaElement, SectionTextareaProps>(
  function SectionTextarea({ value, onChange, onBlur }, ref) {
    const internalRef = useRef<HTMLTextAreaElement | null>(null);

    function resize(el: HTMLTextAreaElement) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }

    // Auto-resize on mount
    useEffect(() => {
      if (internalRef.current) resize(internalRef.current);
    }, []);

    return (
      <textarea
        ref={(el) => {
          internalRef.current = el;
          if (typeof ref === "function") ref(el);
          else if (ref) ref.current = el;
          if (el) resize(el);
        }}
        autoFocus
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          resize(e.target);
        }}
        onBlur={onBlur}
        className="w-full resize-none rounded border border-neutral-200/60 dark:border-neutral-800/60 bg-transparent px-2 py-1.5 text-[12px] leading-relaxed text-neutral-700 dark:text-neutral-300 font-mono outline-none focus:border-neutral-300 dark:focus:border-neutral-700 min-h-[3rem]"
        rows={1}
      />
    );
  },
);

// ---------------------------------------------------------------------------
// Context Header
// ---------------------------------------------------------------------------

interface ContextHeaderProps {
  context: string;
  isCurrent: boolean;
  workspace: string;
  subPath?: string;
}

function ContextHeader({ context, isCurrent, workspace, subPath }: ContextHeaderProps) {
  const route = contextToRoute(context, workspace, subPath);

  return (
    <Link
      to={route.to}
      params={route.params}
      search={route.search}
      className="mb-2 flex items-center gap-2 text-[10px] text-neutral-400 dark:text-neutral-600 hover:text-neutral-600 dark:hover:text-neutral-400 transition-colors"
    >
      <div className="h-px flex-1 bg-neutral-200/60 dark:bg-neutral-800/40" />
      {isCurrent && (
        <div className="h-1.5 w-1.5 rounded-full bg-emerald-500/60" />
      )}
      <span className="shrink-0 font-mono">{contextLabel(context)}</span>
      <div className="h-px flex-1 bg-neutral-200/60 dark:bg-neutral-800/40" />
    </Link>
  );
}

export { JournalPanel };
