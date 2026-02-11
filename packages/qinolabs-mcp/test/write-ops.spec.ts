/**
 * Write Operations Tests
 *
 * Tests filesystem write operations using temporary directories.
 * Verifies that saveJournal and writeAnnotation create files
 * with correct content and naming conventions.
 *
 * Functions tested:
 * - saveJournal
 * - writeAnnotation
 * - resolveAnnotation
 */

import fs from "node:fs/promises";
import path from "node:path";
import { describe, it, expect, afterAll } from "vitest";

import {
  saveJournal,
  writeAnnotation,
  resolveAnnotation,
  parseAnnotation,
  createNode as createNodeOp,
  writeJournalEntry,
  updateView as updateViewOp,
  readGraph,
  readNode,
  parseJournalSections,
} from "../src/server/protocol-reader.js";

import type { GraphData } from "../src/server/types.js";

import {
  createTempWorkspace,
  writeGraph,
  writeJournal,
  createNode,
} from "./helpers/fixtures.js";

// =============================================================================
// saveJournal
// =============================================================================

describe("saveJournal", () => {
  let dir: string;
  let cleanup: () => Promise<void>;

  afterAll(async () => {
    await cleanup?.();
  });

  it("should create a new journal file", async () => {
    ({ dir, cleanup } = await createTempWorkspace());

    const sections = [
      { context: "opening", body: "Initial observations." },
      { context: "session/2026-02-01", body: "Session notes." },
    ];

    const result = await saveJournal(dir, sections);
    expect(result).toEqual({ success: true });

    const written = await fs.readFile(
      path.join(dir, "journal.md"),
      "utf-8",
    );
    expect(written).toContain("Initial observations.");
    expect(written).toContain("<!-- context: session/2026-02-01 -->");
    expect(written).toContain("Session notes.");
  });

  it("should overwrite existing journal", async () => {
    ({ dir, cleanup } = await createTempWorkspace());

    await writeJournal(dir, "Old content that should be replaced.");

    const sections = [{ context: "opening", body: "Brand new content." }];

    await saveJournal(dir, sections);

    const written = await fs.readFile(
      path.join(dir, "journal.md"),
      "utf-8",
    );
    expect(written).not.toContain("Old content");
    expect(written).toContain("Brand new content.");
  });

  it("should round-trip: save sections then read back matching sections", async () => {
    ({ dir, cleanup } = await createTempWorkspace());

    const sections = [
      { context: "opening", body: "Round-trip opening." },
      { context: "session/2026-02-01", body: "Round-trip session." },
    ];

    await saveJournal(dir, sections);

    const raw = await fs.readFile(
      path.join(dir, "journal.md"),
      "utf-8",
    );
    const reparsed = parseJournalSections(raw);

    expect(reparsed).toHaveLength(2);
    expect(reparsed[0]!.context).toBe("opening");
    expect(reparsed[0]!.body).toBe("Round-trip opening.");
    expect(reparsed[1]!.context).toBe("session/2026-02-01");
    expect(reparsed[1]!.body).toBe("Round-trip session.");
  });
});

// =============================================================================
// writeAnnotation
// =============================================================================

describe("writeAnnotation", () => {
  let dir: string;
  let cleanup: () => Promise<void>;

  afterAll(async () => {
    await cleanup?.();
  });

  const graphData: GraphData = {
    id: "ann-write-graph",
    title: "Annotation Write Graph",
    nodes: [
      { id: "node-01", dir: "node-01", title: "Node One" },
    ],
    edges: [],
  };

  it("should create first annotation as 001-slug.md", async () => {
    ({ dir, cleanup } = await createTempWorkspace());

    await writeGraph(dir, graphData);
    await createNode(dir, { nodeDir: "node-01", identity: { title: "Node One" } });

    const result = await writeAnnotation(
      dir,
      "node-01",
      "reading",
      "This is an interesting finding",
    );

    expect(result.success).toBe(true);
    expect(result.filename).toMatch(/^001-this-is-an-interesting-finding\.md$/);
  });

  it("should create second annotation as 002-slug.md", async () => {
    ({ dir, cleanup } = await createTempWorkspace());

    await writeGraph(dir, graphData);
    await createNode(dir, {
      nodeDir: "node-01",
      identity: { title: "Node One" },
      annotations: [
        {
          filename: "001-existing.md",
          content: "---\nauthor: agent\nsignal: reading\ncreated: 2025-06-15\n---\nExisting.",
        },
      ],
    });

    const result = await writeAnnotation(
      dir,
      "node-01",
      "connection",
      "Why does this happen",
    );

    expect(result.filename).toMatch(/^002-why-does-this-happen\.md$/);
  });

  it("should generate slug from body text (lowercase, hyphenated, truncated)", async () => {
    ({ dir, cleanup } = await createTempWorkspace());

    await writeGraph(dir, graphData);
    await createNode(dir, { nodeDir: "node-01", identity: { title: "Node One" } });

    const result = await writeAnnotation(
      dir,
      "node-01",
      "reading",
      "This Has UPPERCASE and special chars!!! Plus it is quite long so it should be truncated at some point",
    );

    expect(result.filename).toMatch(/^001-/);
    // Slug should be lowercase and hyphenated
    const slug = result.filename.replace(/^001-/, "").replace(/\.md$/, "");
    expect(slug).toBe(slug.toLowerCase());
    expect(slug).not.toMatch(/[^a-z0-9-]/);
  });

  it("should write correct front matter content", async () => {
    ({ dir, cleanup } = await createTempWorkspace());

    await writeGraph(dir, graphData);
    await createNode(dir, { nodeDir: "node-01", identity: { title: "Node One" } });

    const result = await writeAnnotation(
      dir,
      "node-01",
      "tension",
      "Key discovery here",
    );

    const written = await fs.readFile(
      path.join(dir, "nodes", "node-01", "annotations", result.filename),
      "utf-8",
    );

    expect(written).toContain("signal: tension");
    expect(written).toContain("author: agent");
    expect(written).toContain("created:");
    expect(written).toContain("Key discovery here");
  });

  it("should create annotations directory if missing", async () => {
    ({ dir, cleanup } = await createTempWorkspace());

    await writeGraph(dir, graphData);

    // Create node dir with node.json but NOT the annotations subdirectory
    await createNode(dir, {
      nodeDir: "node-01",
      identity: { title: "Node One" },
    });

    const result = await writeAnnotation(
      dir,
      "node-01",
      "reading",
      "Should create dir",
    );

    expect(result.success).toBe(true);
    expect(result.filename).toMatch(/^001-/);
  });

  it("should throw for missing graph.json", async () => {
    ({ dir, cleanup } = await createTempWorkspace());

    await expect(
      writeAnnotation(dir, "node-01", "reading", "Body"),
    ).rejects.toThrow("No graph.json found");
  });

  it("should throw for non-existent node", async () => {
    ({ dir, cleanup } = await createTempWorkspace());

    await writeGraph(dir, graphData);

    await expect(
      writeAnnotation(dir, "nonexistent", "reading", "Body"),
    ).rejects.toThrow("Node not found: nonexistent");
  });

  it("should include target in front matter when provided", async () => {
    ({ dir, cleanup } = await createTempWorkspace());

    await writeGraph(dir, graphData);
    await createNode(dir, { nodeDir: "node-01", identity: { title: "Node One" } });

    const result = await writeAnnotation(
      dir,
      "node-01",
      "reading",
      "Note about specific content",
      "concept.md",
    );

    const written = await fs.readFile(
      path.join(dir, "nodes", "node-01", "annotations", result.filename),
      "utf-8",
    );

    expect(written).toContain("target: concept.md");
  });
});

// =============================================================================
// createNode (protocol-reader)
// =============================================================================

describe("createNode", () => {
  let dir: string;
  let cleanup: () => Promise<void>;

  afterAll(async () => {
    await cleanup?.();
  });

  const graphData: GraphData = {
    id: "create-node-graph",
    title: "Create Node Graph",
    nodes: [
      { id: "existing-01", dir: "existing-01", title: "Existing Node" },
    ],
    edges: [],
  };

  it("should create node.json and story.md in node directory", async () => {
    ({ dir, cleanup } = await createTempWorkspace());
    await writeGraph(dir, graphData);

    await createNodeOp(dir, {
      id: "new-node",
      dir: "new-node",
      title: "New Node",
      type: "concept",
      story: "The impulse behind this node.",
    });

    const identity = JSON.parse(
      await fs.readFile(
        path.join(dir, "nodes", "new-node", "node.json"),
        "utf-8",
      ),
    );
    expect(identity.title).toBe("New Node");
    expect(identity.type).toBe("concept");
    expect(identity.created).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const story = await fs.readFile(
      path.join(dir, "nodes", "new-node", "story.md"),
      "utf-8",
    );
    expect(story).toBe("The impulse behind this node.");
  });

  it("should not add node entry to graph.json (nodes are filesystem-discovered)", async () => {
    ({ dir, cleanup } = await createTempWorkspace());
    await writeGraph(dir, graphData);

    await createNodeOp(dir, {
      id: "new-node",
      dir: "new-node",
      title: "New Node",
      story: "Story.",
    });

    const graph = JSON.parse(
      await fs.readFile(path.join(dir, "graph.json"), "utf-8"),
    );
    // graph.json nodes array should be unchanged (still has the original entry)
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0].id).toBe("existing-01");

    // But the node should be discoverable via readGraph
    const fullGraph = await readGraph(dir);
    expect(fullGraph).not.toBeNull();
    const newNode = fullGraph!.nodes.find((n) => n.id === "new-node");
    expect(newNode).toBeDefined();
    expect(newNode!.title).toBe("New Node");
  });

  it("should add edges to graph.json when provided", async () => {
    ({ dir, cleanup } = await createTempWorkspace());
    await writeGraph(dir, graphData);

    await createNodeOp(dir, {
      id: "new-node",
      dir: "new-node",
      title: "New Node",
      story: "Story.",
      edges: [
        { target: "existing-01", type: "sparked-by", context: "testing" },
      ],
    });

    const graph = JSON.parse(
      await fs.readFile(path.join(dir, "graph.json"), "utf-8"),
    );
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0].source).toBe("new-node");
    expect(graph.edges[0].target).toBe("existing-01");
    expect(graph.edges[0].type).toBe("sparked-by");
    expect(graph.edges[0].context).toBe("testing");
  });

  it("should append creation echo to existing journal.md", async () => {
    ({ dir, cleanup } = await createTempWorkspace());
    await writeGraph(dir, graphData);
    await writeJournal(dir, "## opening\n\nExisting journal.");

    await createNodeOp(dir, {
      id: "new-node",
      dir: "new-node",
      title: "New Node",
      story: "Story.",
    });

    const journal = await fs.readFile(
      path.join(dir, "journal.md"),
      "utf-8",
    );
    expect(journal).toContain("Existing journal.");
    expect(journal).toContain("## created: New Node");
    expect(journal).toContain("<!-- context: node/new-node -->");
    expect(journal).toContain("→ [new-node](nodes/new-node/)");
  });

  it("should create journal.md if it does not exist", async () => {
    ({ dir, cleanup } = await createTempWorkspace());
    await writeGraph(dir, graphData);

    await createNodeOp(dir, {
      id: "new-node",
      dir: "new-node",
      title: "New Node",
      story: "Story.",
    });

    const journal = await fs.readFile(
      path.join(dir, "journal.md"),
      "utf-8",
    );
    expect(journal).toContain("created: New Node");
  });

  it("should throw for missing graph.json", async () => {
    ({ dir, cleanup } = await createTempWorkspace());

    await expect(
      createNodeOp(dir, {
        id: "new-node",
        dir: "new-node",
        title: "New Node",
        story: "Story.",
      }),
    ).rejects.toThrow("No graph.json found");
  });

  it("should throw for duplicate node ID", async () => {
    ({ dir, cleanup } = await createTempWorkspace());
    await writeGraph(dir, graphData);
    await createNode(dir, {
      nodeDir: "existing-01",
      identity: { title: "Existing Node" },
    });

    await expect(
      createNodeOp(dir, {
        id: "existing-01",
        dir: "existing-01",
        title: "Duplicate",
        story: "Story.",
      }),
    ).rejects.toThrow("Node already exists: existing-01");
  });

  it("should default status to 'active' when not provided", async () => {
    ({ dir, cleanup } = await createTempWorkspace());
    await writeGraph(dir, graphData);

    const result = await createNodeOp(dir, {
      id: "no-status",
      dir: "no-status",
      title: "No Status Provided",
      story: "Story.",
    });

    const identity = JSON.parse(
      await fs.readFile(
        path.join(dir, "nodes", "no-status", "node.json"),
        "utf-8",
      ),
    );
    expect(identity.status).toBe("active");
    expect(result.applied.status).toBe("active");
  });

  it("should preserve explicit status when provided", async () => {
    ({ dir, cleanup } = await createTempWorkspace());
    await writeGraph(dir, graphData);

    const result = await createNodeOp(dir, {
      id: "with-status",
      dir: "with-status",
      title: "With Status",
      status: "composted",
      story: "Story.",
    });

    const identity = JSON.parse(
      await fs.readFile(
        path.join(dir, "nodes", "with-status", "node.json"),
        "utf-8",
      ),
    );
    expect(identity.status).toBe("composted");
    expect(result.applied.status).toBe("composted");
  });

  it("should be readable by readGraph after creation", async () => {
    ({ dir, cleanup } = await createTempWorkspace());
    await writeGraph(dir, graphData);
    await createNode(dir, {
      nodeDir: "existing-01",
      identity: { title: "Existing Node" },
    });

    await createNodeOp(dir, {
      id: "round-trip",
      dir: "round-trip",
      title: "Round Trip Node",
      type: "concept",
      story: "Round-trip story.",
      edges: [{ target: "existing-01", type: "references" }],
    });

    const graph = await readGraph(dir);
    expect(graph).not.toBeNull();
    expect(graph!.nodes).toHaveLength(2);
    const created = graph!.nodes.find((n) => n.id === "round-trip");
    expect(created?.title).toBe("Round Trip Node");
    expect(graph!.edges).toHaveLength(1);
  });
});

// =============================================================================
// createNode — view support
// =============================================================================

describe("createNode — view support", () => {
  let dir: string;
  let cleanup: () => Promise<void>;

  afterAll(async () => {
    await cleanup?.();
  });

  const graphData: GraphData = {
    id: "view-create-graph",
    title: "View Create Graph",
    nodes: [
      { id: "target-a", dir: "target-a", title: "Target A" },
      { id: "target-b", dir: "target-b", title: "Target B" },
    ],
    edges: [],
  };

  it("should write view.json when view is provided", async () => {
    ({ dir, cleanup } = await createTempWorkspace());
    await writeGraph(dir, graphData);

    await createNodeOp(dir, {
      id: "view-node",
      dir: "view-node",
      title: "View Node",
      type: "view",
      story: "A curated view.",
      view: { focal: "target-a", includes: ["target-a", "target-b"] },
    });

    const viewJson = JSON.parse(
      await fs.readFile(
        path.join(dir, "nodes", "view-node", "view.json"),
        "utf-8",
      ),
    );
    expect(viewJson.focal).toBe("target-a");
    expect(viewJson.includes).toEqual(["target-a", "target-b"]);
  });

  it("should generate curates edges with focal context", async () => {
    ({ dir, cleanup } = await createTempWorkspace());
    await writeGraph(dir, graphData);

    await createNodeOp(dir, {
      id: "view-node",
      dir: "view-node",
      title: "View Node",
      type: "view",
      story: "A curated view.",
      view: { focal: "target-a", includes: ["target-a", "target-b"] },
    });

    const graph = JSON.parse(
      await fs.readFile(path.join(dir, "graph.json"), "utf-8"),
    );

    const curatesEdges = graph.edges.filter(
      (e: { type?: string }) => e.type === "curates",
    );
    expect(curatesEdges).toHaveLength(2);

    const focalEdge = curatesEdges.find(
      (e: { target: string }) => e.target === "target-a",
    );
    expect(focalEdge.context).toBe("focal");

    const nonFocalEdge = curatesEdges.find(
      (e: { target: string }) => e.target === "target-b",
    );
    expect(nonFocalEdge.context).toBeUndefined();
  });

  it("should round-trip: created view node is readable by readNode", async () => {
    ({ dir, cleanup } = await createTempWorkspace());
    await writeGraph(dir, graphData);

    const viewData = { focal: "target-a", includes: ["target-a", "target-b"] };
    await createNodeOp(dir, {
      id: "view-node",
      dir: "view-node",
      title: "View Node",
      type: "view",
      story: "Round-trip view.",
      view: viewData,
    });

    const node = await readNode(dir, "view-node");
    expect(node).not.toBeNull();
    expect(node!.view).toEqual(viewData);
  });
});

// =============================================================================
// writeJournalEntry
// =============================================================================

describe("writeJournalEntry", () => {
  let dir: string;
  let cleanup: () => Promise<void>;

  afterAll(async () => {
    await cleanup?.();
  });

  const graphData: GraphData = {
    id: "journal-entry-graph",
    title: "Journal Entry Graph",
    nodes: [
      { id: "node-01", dir: "node-01", title: "Node One" },
    ],
    edges: [],
  };

  it("should append entry with context marker to root journal", async () => {
    ({ dir, cleanup } = await createTempWorkspace());
    await writeJournal(dir, "## opening\n\nExisting content.");

    await writeJournalEntry(dir, {
      context: "session/2026-02-03",
      body: "Session observation.",
    });

    const journal = await fs.readFile(
      path.join(dir, "journal.md"),
      "utf-8",
    );
    expect(journal).toContain("Existing content.");
    expect(journal).toContain("<!-- context: session/2026-02-03 -->");
    expect(journal).toContain("Session observation.");
  });

  it("should create journal.md if it does not exist", async () => {
    ({ dir, cleanup } = await createTempWorkspace());

    await writeJournalEntry(dir, {
      context: "session/2026-02-03",
      body: "First entry.",
    });

    const journal = await fs.readFile(
      path.join(dir, "journal.md"),
      "utf-8",
    );
    expect(journal).toContain("<!-- context: session/2026-02-03 -->");
    expect(journal).toContain("First entry.");
  });

  it("should write to node-level journal when nodeId is provided", async () => {
    ({ dir, cleanup } = await createTempWorkspace());
    await writeGraph(dir, graphData);
    await createNode(dir, { nodeDir: "node-01", identity: { title: "Node One" } });

    await writeJournalEntry(dir, {
      context: "session/2026-02-03",
      body: "Node-level note.",
      nodeId: "node-01",
    });

    const journal = await fs.readFile(
      path.join(dir, "nodes", "node-01", "journal.md"),
      "utf-8",
    );
    expect(journal).toContain("<!-- context: session/2026-02-03 -->");
    expect(journal).toContain("Node-level note.");
  });

  it("should throw for missing graph.json when nodeId is provided", async () => {
    ({ dir, cleanup } = await createTempWorkspace());

    await expect(
      writeJournalEntry(dir, {
        context: "session/2026-02-03",
        body: "Entry.",
        nodeId: "node-01",
      }),
    ).rejects.toThrow("No graph.json found");
  });

  it("should throw for non-existent node when nodeId is provided", async () => {
    ({ dir, cleanup } = await createTempWorkspace());
    await writeGraph(dir, graphData);

    await expect(
      writeJournalEntry(dir, {
        context: "session/2026-02-03",
        body: "Entry.",
        nodeId: "nonexistent",
      }),
    ).rejects.toThrow("Node not found: nonexistent");
  });

  it("should round-trip: entry appears in parsed journal sections", async () => {
    ({ dir, cleanup } = await createTempWorkspace());
    await writeJournal(dir, "## opening\n\n<!-- context: opening -->\n\nOriginal.");

    await writeJournalEntry(dir, {
      context: "session/2026-02-03",
      body: "New session note.",
    });

    const raw = await fs.readFile(path.join(dir, "journal.md"), "utf-8");
    const sections = parseJournalSections(raw);

    const sessionSection = sections.find(
      (s) => s.context === "session/2026-02-03",
    );
    expect(sessionSection).toBeDefined();
    expect(sessionSection!.body).toContain("New session note.");
  });
});

// =============================================================================
// updateView
// =============================================================================

describe("updateView", () => {
  let dir: string;
  let cleanup: () => Promise<void>;

  afterAll(async () => {
    await cleanup?.();
  });

  const graphData: GraphData = {
    id: "view-update-graph",
    title: "View Update Graph",
    nodes: [
      { id: "target-a", dir: "target-a", title: "Target A" },
      { id: "target-b", dir: "target-b", title: "Target B" },
      { id: "target-c", dir: "target-c", title: "Target C" },
      { id: "my-view", dir: "my-view", title: "My View", type: "view" },
    ],
    edges: [
      { source: "my-view", target: "target-a", type: "curates", context: "focal" },
      { source: "my-view", target: "target-b", type: "curates" },
      { source: "target-a", target: "target-b", type: "references" },
    ],
  };

  it("should update view.json with new focal and includes", async () => {
    ({ dir, cleanup } = await createTempWorkspace());
    await writeGraph(dir, graphData);
    await createNode(dir, {
      nodeDir: "my-view",
      identity: { title: "My View", type: "view" },
      view: { focal: "target-a", includes: ["target-a", "target-b"] },
    });

    await updateViewOp(dir, "my-view", {
      focal: "target-b",
      includes: ["target-b", "target-c"],
    });

    const viewJson = JSON.parse(
      await fs.readFile(
        path.join(dir, "nodes", "my-view", "view.json"),
        "utf-8",
      ),
    );
    expect(viewJson.focal).toBe("target-b");
    expect(viewJson.includes).toEqual(["target-b", "target-c"]);
  });

  it("should replace old curates edges with new ones", async () => {
    ({ dir, cleanup } = await createTempWorkspace());
    await writeGraph(dir, graphData);
    await createNode(dir, {
      nodeDir: "my-view",
      identity: { title: "My View", type: "view" },
      view: { focal: "target-a", includes: ["target-a", "target-b"] },
    });

    await updateViewOp(dir, "my-view", {
      focal: "target-c",
      includes: ["target-c"],
    });

    const graph = JSON.parse(
      await fs.readFile(path.join(dir, "graph.json"), "utf-8"),
    );

    const curatesEdges = graph.edges.filter(
      (e: { type?: string }) => e.type === "curates",
    );
    expect(curatesEdges).toHaveLength(1);
    expect(curatesEdges[0].target).toBe("target-c");
    expect(curatesEdges[0].context).toBe("focal");
  });

  it("should preserve non-curates edges in graph.json", async () => {
    ({ dir, cleanup } = await createTempWorkspace());
    await writeGraph(dir, graphData);
    await createNode(dir, {
      nodeDir: "my-view",
      identity: { title: "My View", type: "view" },
      view: { focal: "target-a", includes: ["target-a", "target-b"] },
    });

    await updateViewOp(dir, "my-view", {
      focal: "target-c",
      includes: ["target-c"],
    });

    const graph = JSON.parse(
      await fs.readFile(path.join(dir, "graph.json"), "utf-8"),
    );

    const referencesEdge = graph.edges.find(
      (e: { type?: string }) => e.type === "references",
    );
    expect(referencesEdge).toBeDefined();
    expect(referencesEdge.source).toBe("target-a");
    expect(referencesEdge.target).toBe("target-b");
  });

  it("should throw for non-existent node", async () => {
    ({ dir, cleanup } = await createTempWorkspace());
    await writeGraph(dir, graphData);

    await expect(
      updateViewOp(dir, "nonexistent", {
        focal: "target-a",
        includes: ["target-a"],
      }),
    ).rejects.toThrow("Node not found: nonexistent");
  });

  it("should throw for node without view.json", async () => {
    ({ dir, cleanup } = await createTempWorkspace());
    await writeGraph(dir, graphData);
    await createNode(dir, {
      nodeDir: "target-a",
      identity: { title: "Target A" },
    });

    await expect(
      updateViewOp(dir, "target-a", {
        focal: "target-b",
        includes: ["target-b"],
      }),
    ).rejects.toThrow("not a view");
  });

  it("should be readable by readNode after update", async () => {
    ({ dir, cleanup } = await createTempWorkspace());
    await writeGraph(dir, graphData);
    await createNode(dir, {
      nodeDir: "my-view",
      identity: { title: "My View", type: "view" },
      view: { focal: "target-a", includes: ["target-a", "target-b"] },
    });

    await updateViewOp(dir, "my-view", {
      focal: "target-c",
      includes: ["target-b", "target-c"],
    });

    const node = await readNode(dir, "my-view");
    expect(node).not.toBeNull();
    expect(node!.view).toEqual({
      focal: "target-c",
      includes: ["target-b", "target-c"],
    });
  });
});

// =============================================================================
// Custom nodesDir
// =============================================================================

describe("custom nodesDir", () => {
  let dir: string;
  let cleanup: () => Promise<void>;

  afterAll(async () => {
    await cleanup?.();
  });

  it("createNode should write under custom nodesDir", async () => {
    ({ dir, cleanup } = await createTempWorkspace());

    const graphData: GraphData = {
      id: "custom-dir-graph",
      title: "Custom Dir Graph",
      nodesDir: "concepts",
      nodes: [],
      edges: [],
    };
    await writeGraph(dir, graphData);

    await createNodeOp(dir, {
      id: "new-concept",
      dir: "new-concept",
      title: "New Concept",
      story: "A concept in a custom directory.",
    });

    // Verify files exist under concepts/, not nodes/
    const identity = JSON.parse(
      await fs.readFile(
        path.join(dir, "concepts", "new-concept", "node.json"),
        "utf-8",
      ),
    );
    expect(identity.title).toBe("New Concept");

    const story = await fs.readFile(
      path.join(dir, "concepts", "new-concept", "story.md"),
      "utf-8",
    );
    expect(story).toBe("A concept in a custom directory.");
  });

  it("readGraph should enrich nodes through custom nodesDir", async () => {
    ({ dir, cleanup } = await createTempWorkspace());

    const graphData: GraphData = {
      id: "custom-dir-read",
      title: "Custom Dir Read",
      nodesDir: "implementations",
      nodes: [
        { id: "impl-01", dir: "impl-01", title: "Implementation One" },
      ],
      edges: [],
    };
    await writeGraph(dir, graphData);
    await createNode(dir, {
      nodeDir: "impl-01",
      nodesDir: "implementations",
      identity: { title: "Implementation One", created: "2026-01-15" },
      story: "An implementation.",
    });

    const graph = await readGraph(dir);
    expect(graph).not.toBeNull();
    expect(graph!.nodes).toHaveLength(1);
    expect(graph!.nodes[0]!.created).toBe("2026-01-15");
  });

  it("journal echo should reference custom nodesDir in link", async () => {
    ({ dir, cleanup } = await createTempWorkspace());

    const graphData: GraphData = {
      id: "custom-dir-journal",
      title: "Custom Dir Journal",
      nodesDir: "concepts",
      nodes: [],
      edges: [],
    };
    await writeGraph(dir, graphData);

    await createNodeOp(dir, {
      id: "journaled",
      dir: "journaled",
      title: "Journaled Concept",
      story: "Story.",
    });

    const journal = await fs.readFile(
      path.join(dir, "journal.md"),
      "utf-8",
    );
    expect(journal).toContain("→ [journaled](concepts/journaled/)");
    expect(journal).not.toContain("nodes/journaled");
  });
});

// =============================================================================
// resolveAnnotation
// =============================================================================

describe("resolveAnnotation", () => {
  let dir: string;
  let cleanup: () => Promise<void>;

  afterAll(async () => {
    await cleanup?.();
  });

  const graphData: GraphData = {
    id: "resolve-ann-graph",
    title: "Resolve Annotation Graph",
    nodes: [
      { id: "node-01", dir: "node-01", title: "Node One" },
    ],
    edges: [],
  };

  const annotationContent = `---
author: agent
signal: proposal
target: concept.md
created: 2025-06-15
---
A proposal to restructure.`;

  it("should update frontmatter with status and resolvedAt", async () => {
    ({ dir, cleanup } = await createTempWorkspace());
    await writeGraph(dir, graphData);
    await createNode(dir, {
      nodeDir: "node-01",
      identity: { title: "Node One" },
      annotations: [
        { filename: "001-restructure.md", content: annotationContent },
      ],
    });

    const result = await resolveAnnotation(dir, "node-01", "001-restructure.md", "accepted");

    expect(result.success).toBe(true);
    expect(result.meta.status).toBe("accepted");
    expect(result.meta.resolvedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Verify the file on disk
    const written = await fs.readFile(
      path.join(dir, "nodes", "node-01", "annotations", "001-restructure.md"),
      "utf-8",
    );
    expect(written).toContain("status: accepted");
    expect(written).toContain("resolvedAt:");
  });

  it("should preserve body content after resolution", async () => {
    ({ dir, cleanup } = await createTempWorkspace());
    await writeGraph(dir, graphData);
    await createNode(dir, {
      nodeDir: "node-01",
      identity: { title: "Node One" },
      annotations: [
        { filename: "001-restructure.md", content: annotationContent },
      ],
    });

    await resolveAnnotation(dir, "node-01", "001-restructure.md", "resolved");

    const written = await fs.readFile(
      path.join(dir, "nodes", "node-01", "annotations", "001-restructure.md"),
      "utf-8",
    );
    expect(written).toContain("A proposal to restructure.");
  });

  it("should preserve existing frontmatter fields (author, signal, target, created)", async () => {
    ({ dir, cleanup } = await createTempWorkspace());
    await writeGraph(dir, graphData);
    await createNode(dir, {
      nodeDir: "node-01",
      identity: { title: "Node One" },
      annotations: [
        { filename: "001-restructure.md", content: annotationContent },
      ],
    });

    await resolveAnnotation(dir, "node-01", "001-restructure.md", "dismissed");

    const written = await fs.readFile(
      path.join(dir, "nodes", "node-01", "annotations", "001-restructure.md"),
      "utf-8",
    );
    expect(written).toContain("author: agent");
    expect(written).toContain("signal: proposal");
    expect(written).toContain("target: concept.md");
    expect(written).toContain("created: 2025-06-15");
    expect(written).toContain("status: dismissed");
  });

  it("should be re-parseable after resolution", async () => {
    ({ dir, cleanup } = await createTempWorkspace());
    await writeGraph(dir, graphData);
    await createNode(dir, {
      nodeDir: "node-01",
      identity: { title: "Node One" },
      annotations: [
        { filename: "001-restructure.md", content: annotationContent },
      ],
    });

    await resolveAnnotation(dir, "node-01", "001-restructure.md", "accepted");

    const written = await fs.readFile(
      path.join(dir, "nodes", "node-01", "annotations", "001-restructure.md"),
      "utf-8",
    );
    const parsed = parseAnnotation(written);
    expect(parsed).not.toBeNull();
    expect(parsed!.meta.status).toBe("accepted");
    expect(parsed!.meta.resolvedAt).toBeDefined();
    expect(parsed!.meta.signal).toBe("proposal");
    expect(parsed!.meta.target).toBe("concept.md");
    expect(parsed!.content).toBe("A proposal to restructure.");
  });

  it("should throw for non-existent node", async () => {
    ({ dir, cleanup } = await createTempWorkspace());
    await writeGraph(dir, graphData);

    await expect(
      resolveAnnotation(dir, "nonexistent", "001-test.md", "resolved"),
    ).rejects.toThrow("Node not found: nonexistent");
  });

  it("should throw for non-existent annotation file", async () => {
    ({ dir, cleanup } = await createTempWorkspace());
    await writeGraph(dir, graphData);
    await createNode(dir, {
      nodeDir: "node-01",
      identity: { title: "Node One" },
    });

    await expect(
      resolveAnnotation(dir, "node-01", "999-nonexistent.md", "resolved"),
    ).rejects.toThrow("Annotation not found");
  });
});
