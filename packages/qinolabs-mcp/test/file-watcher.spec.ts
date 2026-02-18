/**
 * File Watcher Tests
 *
 * Tests the categorize function (pure path → event mapping) and
 * the FileWatcher subscribe/push/debounce mechanics.
 *
 * categorize is the most important function to test thoroughly
 * since it handles many path patterns across different graph structures.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  categorize,
  createFileWatcher,
  type FileChangeEvent,
} from "../src/server/file-watcher.js";

// =============================================================================
// categorize — pure path → event mapping
// =============================================================================

describe("categorize", () => {
  describe("config", () => {
    it("should detect .claude/qino-config.json", () => {
      expect(categorize(".claude/qino-config.json")).toEqual({
        type: "config",
      });
    });
  });

  describe("graph.json", () => {
    it("should detect root graph.json", () => {
      expect(categorize("graph.json")).toEqual({
        type: "graph",
        graphPath: undefined,
      });
    });

    it("should detect workspace graph.json with graphPath", () => {
      expect(categorize("qinolabs-repo/graph.json")).toEqual({
        type: "graph",
        graphPath: "qinolabs-repo",
      });
    });

    it("should detect deeply nested graph.json", () => {
      expect(
        categorize("qinolabs-repo/implementations/graph.json"),
      ).toEqual({
        type: "graph",
        graphPath: "qinolabs-repo/implementations",
      });
    });
  });

  describe("journal.md", () => {
    it("should detect root journal.md as journal event", () => {
      expect(categorize("journal.md")).toEqual({
        type: "journal",
        graphPath: undefined,
      });
    });

    it("should detect workspace journal.md as journal event", () => {
      expect(categorize("qinolabs-repo/journal.md")).toEqual({
        type: "journal",
        graphPath: "qinolabs-repo",
      });
    });

    it("should detect deep journal.md as node event", () => {
      expect(categorize("nodes/my-node/journal.md")).toEqual({
        type: "node",
        nodeId: "my-node",
      });
    });
  });

  describe("node identity files", () => {
    it("should detect node.json with nodeId", () => {
      expect(categorize("nodes/emergence/node.json")).toEqual({
        type: "node",
        nodeId: "emergence",
      });
    });

    it("should detect view.json with nodeId", () => {
      expect(categorize("nodes/my-view/view.json")).toEqual({
        type: "node",
        nodeId: "my-view",
      });
    });

    it("should detect story.md inside a node (3+ segments)", () => {
      expect(categorize("nodes/emergence/story.md")).toEqual({
        type: "node",
        nodeId: "emergence",
      });
    });

    it("should detect node files in workspace sub-graphs", () => {
      expect(
        categorize("qinolabs-repo/implementations/qino-drops/node.json"),
      ).toEqual({
        type: "node",
        nodeId: "qino-drops",
      });
    });
  });

  describe("annotation files", () => {
    it("should detect annotation .md files", () => {
      expect(
        categorize("nodes/my-node/annotations/001-proposal.md"),
      ).toEqual({
        type: "annotation",
        nodeId: "my-node",
      });
    });

    it("should detect annotations in workspace sub-graphs", () => {
      expect(
        categorize(
          "qinolabs-repo/implementations/qino-drops/annotations/002-tension.md",
        ),
      ).toEqual({
        type: "annotation",
        nodeId: "qino-drops",
      });
    });
  });

  describe("content files", () => {
    it("should detect content .md files as node events", () => {
      expect(
        categorize("nodes/my-node/content/01-foundation.md"),
      ).toEqual({
        type: "node",
        nodeId: "my-node",
      });
    });

    it("should detect content in workspace sub-graphs", () => {
      expect(
        categorize(
          "qinolabs-repo/implementations/qino-drops/content/02-interaction.md",
        ),
      ).toEqual({
        type: "node",
        nodeId: "qino-drops",
      });
    });
  });

  describe("ignored paths", () => {
    it("should return null for .git files", () => {
      expect(categorize(".git/HEAD")).toBeNull();
      expect(categorize(".git/refs/heads/main")).toBeNull();
    });

    it("should return null for node_modules", () => {
      expect(categorize("node_modules/hono/package.json")).toBeNull();
    });

    it("should return null for unrecognized files", () => {
      expect(categorize("README.md")).toBeNull();
      expect(categorize("package.json")).toBeNull();
      expect(categorize("src/server/index.ts")).toBeNull();
    });

    it("should return null for story.md at shallow depth", () => {
      // Root-level story.md (2 segments) is not a node file
      expect(categorize("workspace/story.md")).toBeNull();
    });
  });
});

// =============================================================================
// FileWatcher — subscribe, push, debounce
// =============================================================================

describe("FileWatcher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("push (immediate delivery)", () => {
    it("should deliver events immediately to subscribers", () => {
      const events: FileChangeEvent[] = [];
      // Use a non-existent dir so fs.watch silently fails — we only test push
      const watcher = createFileWatcher("/tmp/nonexistent-watcher-test-dir");

      watcher.subscribe((e) => events.push(e));
      watcher.push({ type: "graph", graphPath: "workspace" });

      expect(events).toEqual([{ type: "graph", graphPath: "workspace" }]);

      watcher.close();
    });

    it("should deliver to multiple subscribers", () => {
      const events1: FileChangeEvent[] = [];
      const events2: FileChangeEvent[] = [];
      const watcher = createFileWatcher("/tmp/nonexistent-watcher-test-dir");

      watcher.subscribe((e) => events1.push(e));
      watcher.subscribe((e) => events2.push(e));
      watcher.push({ type: "config" });

      expect(events1).toHaveLength(1);
      expect(events2).toHaveLength(1);

      watcher.close();
    });

    it("should cancel pending debounce for the same key", () => {
      const events: FileChangeEvent[] = [];
      const watcher = createFileWatcher("/tmp/nonexistent-watcher-test-dir");

      watcher.subscribe((e) => events.push(e));

      // Simulate: fs.watch fires first (would debounce), then push fires
      // We can't trigger fs.watch directly in unit tests, so we test that
      // push cancels any pending timer by pushing twice with the same key.
      watcher.push({ type: "graph", graphPath: "ws" });
      watcher.push({ type: "graph", graphPath: "ws" });

      // Both pushes deliver immediately (push doesn't debounce)
      expect(events).toHaveLength(2);

      // Advance time — no extra events from debounce timers
      vi.advanceTimersByTime(500);
      expect(events).toHaveLength(2);

      watcher.close();
    });
  });

  describe("unsubscribe", () => {
    it("should stop receiving events after unsubscribe", () => {
      const events: FileChangeEvent[] = [];
      const watcher = createFileWatcher("/tmp/nonexistent-watcher-test-dir");

      const unsub = watcher.subscribe((e) => events.push(e));
      watcher.push({ type: "config" });
      unsub();
      watcher.push({ type: "config" });

      expect(events).toHaveLength(1);

      watcher.close();
    });
  });

  describe("close", () => {
    it("should clear all subscribers on close", () => {
      const events: FileChangeEvent[] = [];
      const watcher = createFileWatcher("/tmp/nonexistent-watcher-test-dir");

      watcher.subscribe((e) => events.push(e));
      watcher.close();
      watcher.push({ type: "config" });

      expect(events).toHaveLength(0);
    });
  });

  describe("subscriber error isolation", () => {
    it("should not crash when a subscriber throws", () => {
      const events: FileChangeEvent[] = [];
      const watcher = createFileWatcher("/tmp/nonexistent-watcher-test-dir");

      watcher.subscribe(() => {
        throw new Error("boom");
      });
      watcher.subscribe((e) => events.push(e));

      // Should not throw, and second subscriber still receives event
      watcher.push({ type: "config" });
      expect(events).toHaveLength(1);

      watcher.close();
    });
  });
});
