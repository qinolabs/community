/**
 * Read Operations Tests
 *
 * Tests filesystem read operations using temporary directories.
 * Each describe block creates an isolated temp directory via fixtures,
 * exercises the read function, and cleans up in afterAll.
 *
 * Functions tested:
 * - readConfig
 * - readGraph
 * - readNode
 * - readAnnotations
 */

import { describe, it, expect, afterAll } from "vitest";

import {
  readConfig,
  readGraph,
  readNode,
  readAnnotations,
} from "../src/server/protocol-reader.js";

import type { GraphData } from "../src/server/types.js";

import {
  createTempWorkspace,
  writeWorkspaceConfig,
  writeGraph,
  writeJournal,
  createNode,
} from "./helpers/fixtures.js";

// =============================================================================
// readConfig
// =============================================================================

describe("readConfig", () => {
  let dir: string;
  let cleanup: () => Promise<void>;

  afterAll(async () => {
    await cleanup?.();
  });

  it("should read a valid workspace config", async () => {
    ({ dir, cleanup } = await createTempWorkspace());

    const config = {
      repoType: "concepts",
      name: "test-workspace",
      types: { concept: { color: "purple" } },
    };
    await writeWorkspaceConfig(dir, config);

    const result = await readConfig(dir);
    expect(result).toEqual(config);
  });

  it("should return empty object for missing config", async () => {
    ({ dir, cleanup } = await createTempWorkspace());

    const result = await readConfig(dir);
    expect(result).toEqual({});
  });
});

// =============================================================================
// readGraph
// =============================================================================

describe("readGraph", () => {
  let dir: string;
  let cleanup: () => Promise<void>;

  afterAll(async () => {
    await cleanup?.();
  });

  const graphData: GraphData = {
    id: "test-graph",
    title: "Test Graph",
    nodes: [
      { id: "node-a", dir: "node-a", title: "Node A", type: "concept", status: "active" },
      { id: "node-b", dir: "node-b", title: "Node B", type: "tool" },
    ],
    edges: [
      { source: "node-a", target: "node-b", type: "references" },
    ],
  };

  it("should read full graph with journal and agent signals", async () => {
    ({ dir, cleanup } = await createTempWorkspace());

    const journal = `Opening notes.

<!-- context: session/2026-02-01 -->

Session observations here.`;

    await writeGraph(dir, graphData);
    await writeJournal(dir, journal);

    // Create filesystem nodes (discovery reads from disk, not graph.json)
    await createNode(dir, {
      nodeDir: "node-a",
      identity: { title: "Node A", type: "concept", status: "active" },
      annotations: [
        {
          filename: "001-first.md",
          content: "---\nauthor: agent\nsignal: reading\ncreated: 2025-06-15\n---\nFirst note.",
        },
        {
          filename: "002-second.md",
          content: "---\nauthor: agent\nsignal: tension\ncreated: 2025-06-16\n---\nA tension.",
        },
      ],
    });
    await createNode(dir, {
      nodeDir: "node-b",
      identity: { title: "Node B", type: "tool" },
    });

    const result = await readGraph(dir);

    expect(result).not.toBeNull();
    expect(result!.id).toBe("test-graph");
    expect(result!.journal).toBe(journal);
    expect(result!.journalSections).toHaveLength(2);
    expect(result!.journalSections[0]!.context).toBe("opening");
    expect(result!.journalSections[1]!.context).toBe("session/2026-02-01");
    expect(result!.agentSignals["node-a"]).toEqual(
      expect.arrayContaining(["reading", "tension"]),
    );
  });

  it("should return null journal and empty sections when journal.md is missing", async () => {
    ({ dir, cleanup } = await createTempWorkspace());

    await writeGraph(dir, graphData);
    await createNode(dir, {
      nodeDir: "node-a",
      identity: { title: "Node A", type: "concept", status: "active" },
    });
    await createNode(dir, {
      nodeDir: "node-b",
      identity: { title: "Node B", type: "tool" },
    });

    const result = await readGraph(dir);

    expect(result).not.toBeNull();
    expect(result!.journal).toBeNull();
    expect(result!.journalSections).toEqual([]);
  });

  it("should return null for missing graph.json", async () => {
    ({ dir, cleanup } = await createTempWorkspace());

    const result = await readGraph(dir);
    expect(result).toBeNull();
  });

  it("should preserve edge data", async () => {
    ({ dir, cleanup } = await createTempWorkspace());

    await writeGraph(dir, graphData);
    await createNode(dir, {
      nodeDir: "node-a",
      identity: { title: "Node A", type: "concept", status: "active" },
    });
    await createNode(dir, {
      nodeDir: "node-b",
      identity: { title: "Node B", type: "tool" },
    });

    const result = await readGraph(dir);

    expect(result!.edges).toHaveLength(1);
    expect(result!.edges[0]).toEqual({
      source: "node-a",
      target: "node-b",
      type: "references",
    });
  });
});

// =============================================================================
// readNode
// =============================================================================

describe("readNode", () => {
  let dir: string;
  let cleanup: () => Promise<void>;

  afterAll(async () => {
    await cleanup?.();
  });

  const graphData: GraphData = {
    id: "node-graph",
    title: "Node Graph",
    nodes: [
      { id: "concept-01", dir: "concept-01", title: "Test Concept", type: "concept" },
    ],
    edges: [],
  };

  it("should read full node with all files", async () => {
    ({ dir, cleanup } = await createTempWorkspace());

    await writeGraph(dir, graphData);

    await createNode(dir, {
      nodeDir: "concept-01",
      identity: {
        title: "Test Concept",
        type: "concept",
        status: "active",
        created: "2026-02-01",
        tags: ["test"],
      },
      story: "The impulse behind this concept.",
      contentFiles: [
        { filename: "concept.md", content: "# Test Concept\n\nFull concept document." },
        { filename: "notes.md", content: "Additional notes." },
      ],
      annotations: [
        {
          filename: "001-interesting.md",
          content: "---\nauthor: agent\nsignal: tension\ncreated: 2025-06-15\n---\nInteresting finding.",
        },
      ],
    });

    const result = await readNode(dir, "concept-01");

    expect(result).not.toBeNull();
    expect(result!.id).toBe("concept-01");
    expect(result!.identity).toEqual({
      title: "Test Concept",
      type: "concept",
      status: "active",
      created: "2026-02-01",
      tags: ["test"],
    });
    expect(result!.story).toContain("impulse behind");
    expect(result!.contentFiles).toHaveLength(2);
    expect(result!.contentFiles[0]!.filename).toBe("concept.md");
    expect(result!.contentFiles[0]!.content).toContain("Full concept document");
    expect(result!.annotations).toHaveLength(1);
    expect(result!.annotations[0]!.meta.signal).toBe("tension");
    expect(result!.hasSubGraph).toBe(false);
  });

  it("should detect sub-graph when node has graph.json", async () => {
    ({ dir, cleanup } = await createTempWorkspace());

    await writeGraph(dir, graphData);

    await createNode(dir, {
      nodeDir: "concept-01",
      identity: { title: "Test Concept" },
      subGraph: {
        id: "sub-graph",
        title: "Sub Graph",
        nodes: [{ id: "facet-01", dir: "facet-01", title: "Facet" }],
        edges: [],
      },
    });

    const result = await readNode(dir, "concept-01");

    expect(result).not.toBeNull();
    expect(result!.hasSubGraph).toBe(true);
  });

  it("should return null fields for missing optional files", async () => {
    ({ dir, cleanup } = await createTempWorkspace());

    await writeGraph(dir, graphData);

    // Create node directory with only node.json (required for discovery)
    await createNode(dir, {
      nodeDir: "concept-01",
      identity: { title: "Test Concept" },
    });

    const result = await readNode(dir, "concept-01");

    expect(result).not.toBeNull();
    expect(result!.identity).toEqual({ title: "Test Concept" });
    expect(result!.story).toBeNull();
    expect(result!.contentFiles).toEqual([]);
    expect(result!.annotations).toEqual([]);
    expect(result!.hasSubGraph).toBe(false);
  });

  it("should return null for non-existent nodeId", async () => {
    ({ dir, cleanup } = await createTempWorkspace());

    await writeGraph(dir, graphData);

    const result = await readNode(dir, "nonexistent");
    expect(result).toBeNull();
  });
});

// =============================================================================
// readGraph — view detection
// =============================================================================

describe("readGraph — view detection", () => {
  let dir: string;
  let cleanup: () => Promise<void>;

  afterAll(async () => {
    await cleanup?.();
  });

  it("should detect hasView: true for nodes with view.json", async () => {
    ({ dir, cleanup } = await createTempWorkspace());

    const graphData: GraphData = {
      id: "view-graph",
      title: "View Graph",
      nodes: [
        { id: "view-node", dir: "view-node", title: "View Node", type: "view" },
        { id: "plain-node", dir: "plain-node", title: "Plain Node", type: "concept" },
      ],
      edges: [],
    };

    await writeGraph(dir, graphData);

    await createNode(dir, {
      nodeDir: "view-node",
      identity: { title: "View Node", type: "view" },
      view: { focal: "plain-node", includes: ["plain-node"] },
    });

    await createNode(dir, {
      nodeDir: "plain-node",
      identity: { title: "Plain Node", type: "concept" },
    });

    const result = await readGraph(dir);

    expect(result).not.toBeNull();
    const viewNode = result!.nodes.find((n) => n.id === "view-node");
    const plainNode = result!.nodes.find((n) => n.id === "plain-node");

    expect(viewNode?.hasView).toBe(true);
    expect(plainNode?.hasView).toBeUndefined();
  });
});

// =============================================================================
// readGraph — journal detection
// =============================================================================

describe("readGraph — journal detection", () => {
  let dir: string;
  let cleanup: () => Promise<void>;

  afterAll(async () => {
    await cleanup?.();
  });

  it("should detect hasJournal: true for nodes with journal.md", async () => {
    ({ dir, cleanup } = await createTempWorkspace());

    const graphData: GraphData = {
      id: "journal-graph",
      title: "Journal Graph",
      nodes: [
        { id: "with-journal", dir: "with-journal", title: "With Journal" },
        { id: "without-journal", dir: "without-journal", title: "Without Journal" },
      ],
      edges: [],
    };

    await writeGraph(dir, graphData);

    await createNode(dir, {
      nodeDir: "with-journal",
      identity: { title: "With Journal" },
      journal: "Some node-level notes.",
    });

    await createNode(dir, {
      nodeDir: "without-journal",
      identity: { title: "Without Journal" },
    });

    const result = await readGraph(dir);

    expect(result).not.toBeNull();
    const journalNode = result!.nodes.find((n) => n.id === "with-journal");
    const plainNode = result!.nodes.find((n) => n.id === "without-journal");

    expect(journalNode?.hasJournal).toBe(true);
    expect(plainNode?.hasJournal).toBeUndefined();
  });
});

// =============================================================================
// readNode — view data
// =============================================================================

describe("readNode — view data", () => {
  let dir: string;
  let cleanup: () => Promise<void>;

  afterAll(async () => {
    await cleanup?.();
  });

  const graphData: GraphData = {
    id: "view-node-graph",
    title: "View Node Graph",
    nodes: [
      { id: "with-view", dir: "with-view", title: "With View" },
      { id: "without-view", dir: "without-view", title: "Without View" },
    ],
    edges: [],
  };

  it("should return view data when view.json is present", async () => {
    ({ dir, cleanup } = await createTempWorkspace());

    await writeGraph(dir, graphData);

    const viewData = { focal: "some-focal", includes: ["some-focal", "other-node"] };
    await createNode(dir, {
      nodeDir: "with-view",
      identity: { title: "With View" },
      view: viewData,
    });

    await createNode(dir, { nodeDir: "without-view", identity: { title: "Without View" } });

    const result = await readNode(dir, "with-view");

    expect(result).not.toBeNull();
    expect(result!.view).toEqual(viewData);
  });

  it("should return view: null when no view.json exists", async () => {
    ({ dir, cleanup } = await createTempWorkspace());

    await writeGraph(dir, graphData);
    await createNode(dir, { nodeDir: "without-view", identity: { title: "Without View" } });

    const result = await readNode(dir, "without-view");

    expect(result).not.toBeNull();
    expect(result!.view).toBeNull();
  });
});

// =============================================================================
// readAnnotations
// =============================================================================

describe("readAnnotations", () => {
  let dir: string;
  let cleanup: () => Promise<void>;

  afterAll(async () => {
    await cleanup?.();
  });

  const graphData: GraphData = {
    id: "ann-graph",
    title: "Annotations Graph",
    nodes: [
      { id: "node-01", dir: "node-01", title: "Node One" },
    ],
    edges: [],
  };

  it("should read and sort multiple annotation files", async () => {
    ({ dir, cleanup } = await createTempWorkspace());

    await writeGraph(dir, graphData);

    await createNode(dir, {
      nodeDir: "node-01",
      identity: { title: "Node One" },
      annotations: [
        {
          filename: "002-second.md",
          content: "---\nauthor: agent\nsignal: connection\ncreated: 2025-06-16\n---\nSecond.",
        },
        {
          filename: "001-first.md",
          content: "---\nauthor: agent\nsignal: reading\ncreated: 2025-06-15\n---\nFirst.",
        },
      ],
    });

    const result = await readAnnotations(dir, "node-01");

    expect(result).toHaveLength(2);
    expect(result[0]!.filename).toBe("001-first.md");
    expect(result[1]!.filename).toBe("002-second.md");
  });

  it("should return empty array for empty annotations directory", async () => {
    ({ dir, cleanup } = await createTempWorkspace());

    await writeGraph(dir, graphData);

    await createNode(dir, {
      nodeDir: "node-01",
      identity: { title: "Node One" },
      annotations: [],
    });

    const result = await readAnnotations(dir, "node-01");
    expect(result).toEqual([]);
  });

  it("should skip files without valid front matter", async () => {
    ({ dir, cleanup } = await createTempWorkspace());

    await writeGraph(dir, graphData);

    await createNode(dir, {
      nodeDir: "node-01",
      identity: { title: "Node One" },
      annotations: [
        {
          filename: "001-valid.md",
          content: "---\nauthor: agent\nsignal: reading\ncreated: 2025-06-15\n---\nValid.",
        },
        {
          filename: "002-invalid.md",
          content: "No front matter here, just plain text.",
        },
      ],
    });

    const result = await readAnnotations(dir, "node-01");

    expect(result).toHaveLength(1);
    expect(result[0]!.filename).toBe("001-valid.md");
  });
});

// =============================================================================
// readGraph — actionItems filtering by annotation status
// =============================================================================

describe("readGraph — actionItems status filtering", () => {
  let dir: string;
  let cleanup: () => Promise<void>;

  afterAll(async () => {
    await cleanup?.();
  });

  const graphData: GraphData = {
    id: "action-status-graph",
    title: "Action Status Graph",
    nodes: [
      { id: "node-01", dir: "node-01", title: "Node One" },
    ],
    edges: [],
  };

  it("should exclude resolved annotations from actionItems", async () => {
    ({ dir, cleanup } = await createTempWorkspace());
    await writeGraph(dir, graphData);
    await createNode(dir, {
      nodeDir: "node-01",
      identity: { title: "Node One" },
      annotations: [
        {
          filename: "001-open-proposal.md",
          content: "---\nauthor: agent\nsignal: proposal\ncreated: 2025-06-15\n---\nOpen proposal.",
        },
        {
          filename: "002-resolved-tension.md",
          content: "---\nauthor: agent\nsignal: tension\ncreated: 2025-06-16\nstatus: resolved\nresolvedAt: 2025-06-20\n---\nResolved tension.",
        },
      ],
    });

    const result = await readGraph(dir);

    expect(result).not.toBeNull();
    expect(result!.actionItems).toHaveLength(1);
    expect(result!.actionItems[0]!.annotationFilename).toBe("001-open-proposal.md");
  });

  it("should exclude dismissed annotations from actionItems", async () => {
    ({ dir, cleanup } = await createTempWorkspace());
    await writeGraph(dir, graphData);
    await createNode(dir, {
      nodeDir: "node-01",
      identity: { title: "Node One" },
      annotations: [
        {
          filename: "001-dismissed-proposal.md",
          content: "---\nauthor: agent\nsignal: proposal\ncreated: 2025-06-15\nstatus: dismissed\nresolvedAt: 2025-06-20\n---\nDismissed proposal.",
        },
      ],
    });

    const result = await readGraph(dir);

    expect(result).not.toBeNull();
    expect(result!.actionItems).toHaveLength(0);
  });

  it("should include accepted annotations in actionItems", async () => {
    ({ dir, cleanup } = await createTempWorkspace());
    await writeGraph(dir, graphData);
    await createNode(dir, {
      nodeDir: "node-01",
      identity: { title: "Node One" },
      annotations: [
        {
          filename: "001-accepted-proposal.md",
          content: "---\nauthor: agent\nsignal: proposal\ncreated: 2025-06-15\nstatus: accepted\nresolvedAt: 2025-06-18\n---\nAccepted proposal.",
        },
      ],
    });

    const result = await readGraph(dir);

    expect(result).not.toBeNull();
    expect(result!.actionItems).toHaveLength(1);
    expect(result!.actionItems[0]!.status).toBe("accepted");
  });

  it("should include annotations with no status field (backward compat)", async () => {
    ({ dir, cleanup } = await createTempWorkspace());
    await writeGraph(dir, graphData);
    await createNode(dir, {
      nodeDir: "node-01",
      identity: { title: "Node One" },
      annotations: [
        {
          filename: "001-legacy-tension.md",
          content: "---\nauthor: agent\nsignal: tension\ncreated: 2025-06-15\n---\nOld tension without status.",
        },
      ],
    });

    const result = await readGraph(dir);

    expect(result).not.toBeNull();
    expect(result!.actionItems).toHaveLength(1);
    expect(result!.actionItems[0]!.status).toBeUndefined();
  });

  it("should pass status through to actionItem", async () => {
    ({ dir, cleanup } = await createTempWorkspace());
    await writeGraph(dir, graphData);
    await createNode(dir, {
      nodeDir: "node-01",
      identity: { title: "Node One" },
      annotations: [
        {
          filename: "001-accepted.md",
          content: "---\nauthor: agent\nsignal: proposal\ncreated: 2025-06-15\nstatus: accepted\n---\nAccepted.",
        },
        {
          filename: "002-open.md",
          content: "---\nauthor: agent\nsignal: tension\ncreated: 2025-06-16\nstatus: open\n---\nExplicitly open.",
        },
      ],
    });

    const result = await readGraph(dir);

    expect(result).not.toBeNull();
    expect(result!.actionItems).toHaveLength(2);

    const accepted = result!.actionItems.find((i) => i.annotationFilename === "001-accepted.md");
    expect(accepted?.status).toBe("accepted");

    const open = result!.actionItems.find((i) => i.annotationFilename === "002-open.md");
    expect(open?.status).toBe("open");
  });
});
