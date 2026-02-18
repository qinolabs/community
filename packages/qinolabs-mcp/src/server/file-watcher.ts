/**
 * File watcher for real-time UI sync.
 *
 * Two delivery paths:
 * - **MCP fast path**: `push(event)` — immediate, no debounce.
 *   Used by ops.ts after write operations complete.
 * - **fs.watch path**: Recursive watcher with 300ms debounce per logical key.
 *   Catches manual file edits (VS Code, git pull, etc.).
 *
 * Rapid writes from a single operation (e.g. create_node writing node.json +
 * story.md + graph.json + journal.md) collapse into one debounced event.
 */

import fs from "node:fs";

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export interface FileChangeEvent {
  type: "graph" | "node" | "journal" | "config" | "annotation";
  nodeId?: string;
  graphPath?: string;
}

// ---------------------------------------------------------------------------
// Categorize file paths → events
// ---------------------------------------------------------------------------

/**
 * Map a relative file path to a FileChangeEvent.
 *
 * Returns null for paths that don't correspond to protocol-relevant files
 * (e.g. `.git/`, `node_modules/`, unknown extensions).
 */
export function categorize(relativePath: string): FileChangeEvent | null {
  if (/(?:^|\/)(?:\.git|node_modules)\//.test(relativePath)) return null;

  const parts = relativePath.split("/");
  const file = parts.at(-1)!;

  // Config
  if (relativePath === ".claude/qino-config.json") return { type: "config" };

  // graph.json at any depth
  if (file === "graph.json") {
    const graphPath =
      parts.length > 1 ? parts.slice(0, -1).join("/") : undefined;
    return { type: "graph", graphPath };
  }

  // Annotation files: .../annotations/*.md
  const annIdx = parts.lastIndexOf("annotations");
  if (annIdx >= 1 && file.endsWith(".md")) {
    const nodeId = parts[annIdx - 1];
    return { type: "annotation", nodeId };
  }

  // Content files: .../content/*.md
  const contentIdx = parts.lastIndexOf("content");
  if (contentIdx >= 1 && file.endsWith(".md")) {
    const nodeId = parts[contentIdx - 1];
    return { type: "node", nodeId };
  }

  // Node identity files
  if ((file === "node.json" || file === "view.json") && parts.length >= 2) {
    const nodeId = parts.at(-2)!;
    return { type: "node", nodeId };
  }

  // story.md inside a node directory (3+ segments: nodesDir/nodeId/story.md)
  if (file === "story.md" && parts.length >= 3) {
    const nodeId = parts.at(-2)!;
    return { type: "node", nodeId };
  }

  // journal.md — graph-level if shallow (≤2 segments), node-level if deeper
  if (file === "journal.md") {
    if (parts.length <= 2) {
      const graphPath =
        parts.length > 1 ? parts.slice(0, -1).join("/") : undefined;
      return { type: "journal", graphPath };
    }
    // Deeper: node-level journal
    const nodeId = parts.at(-2)!;
    return { type: "node", nodeId };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Debounce key
// ---------------------------------------------------------------------------

function debounceKey(event: FileChangeEvent): string {
  switch (event.type) {
    case "config":
      return "config";
    case "graph":
    case "journal":
      return `graph:${event.graphPath ?? ""}`;
    case "node":
    case "annotation":
      return `node:${event.nodeId ?? ""}:${event.graphPath ?? ""}`;
  }
}

// ---------------------------------------------------------------------------
// FileWatcher
// ---------------------------------------------------------------------------

export interface FileWatcher {
  /** Subscribe to events. Returns an unsubscribe function. */
  subscribe(fn: (event: FileChangeEvent) => void): () => void;
  /** Push an event immediately (MCP fast path, no debounce). */
  push(event: FileChangeEvent): void;
  /** Stop watching and clean up all timers and subscribers. */
  close(): void;
}

const DEBOUNCE_MS = 300;

export function createFileWatcher(workspaceDir: string): FileWatcher {
  const subscribers = new Set<(event: FileChangeEvent) => void>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  function emit(event: FileChangeEvent) {
    for (const fn of subscribers) {
      try {
        fn(event);
      } catch {
        // Subscriber errors should not crash the watcher
      }
    }
  }

  function handleFsChange(_eventType: string, filename: string | null) {
    if (!filename) return;

    // Normalize Windows backslashes (just in case)
    const relativePath = filename.replace(/\\/g, "/");
    const event = categorize(relativePath);
    if (!event) return;

    const key = debounceKey(event);

    // Clear existing timer for this key
    const existing = timers.get(key);
    if (existing) clearTimeout(existing);

    // Set new debounced emission
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        emit(event);
      }, DEBOUNCE_MS),
    );
  }

  // Start recursive watcher — uses FSEvents on macOS (no extra dependency)
  let watcher: fs.FSWatcher | undefined;
  try {
    watcher = fs.watch(
      workspaceDir,
      { recursive: true },
      handleFsChange,
    );
    // Suppress watcher errors (e.g. EPERM on some directories)
    watcher.on("error", () => {});
  } catch {
    // If watch fails (e.g. missing directory), continue without fs watching.
    // MCP fast path (push) still works.
  }

  return {
    subscribe(fn) {
      subscribers.add(fn);
      return () => {
        subscribers.delete(fn);
      };
    },

    push(event) {
      // Cancel any pending debounce for the same key to avoid double delivery
      const key = debounceKey(event);
      const existing = timers.get(key);
      if (existing) {
        clearTimeout(existing);
        timers.delete(key);
      }
      emit(event);
    },

    close() {
      watcher?.close();
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
      subscribers.clear();
    },
  };
}
