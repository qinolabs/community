/**
 * HTTP API Tests
 *
 * Tests the Hono routes via `app.request()` — no HTTP server needed.
 * A temp fixture directory is created for each group, and the
 * Hono app is instantiated with `createApi(workspaceDir, repoRoot)`.
 *
 * Routes tested:
 * - GET  /api/config
 * - GET  /api/graph
 * - GET  /api/nodes/:nodeId
 * - POST /api/nodes/:nodeId/annotations
 * - POST /api/nodes (create node)
 * - PUT  /api/journal
 * - POST /api/journal/entry
 * - POST /api/journal/checkpoint
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { createApi } from "../src/server/http-api.js";

import type { GraphData } from "../src/server/types.js";

import {
  createTempWorkspace,
  writeWorkspaceConfig,
  writeGraph,
  writeJournal,
  createNode,
} from "./helpers/fixtures.js";

// =============================================================================
// Shared fixtures
// =============================================================================

let dir: string;
let cleanup: () => Promise<void>;
let app: ReturnType<typeof createApi>;

const graphData: GraphData = {
  id: "api-graph",
  title: "API Test Graph",
  nodes: [
    { id: "node-01", dir: "node-01", title: "Test Node", type: "concept", status: "active" },
  ],
  edges: [],
};

beforeAll(async () => {
  ({ dir, cleanup } = await createTempWorkspace());

  await writeWorkspaceConfig(dir, {
    repoType: "concepts",
    name: "api-test",
    types: { concept: { color: "purple" } },
  });

  await writeGraph(dir, graphData);
  await writeJournal(dir, "Some journal notes.");

  await createNode(dir, {
    nodeDir: "node-01",
    identity: {
      title: "Test Node",
      type: "concept",
      status: "active",
      created: "2026-02-01",
    },
    story: "# Test Node\n\nThe story of the test node.",
    contentFiles: [
      { filename: "concept.md", content: "# Concept\n\nFull document." },
    ],
  });

  // Create a second node with a journal for scoped journal tests
  await createNode(dir, {
    nodeDir: "node-with-journal",
    identity: {
      title: "Node With Journal",
      type: "concept",
      created: "2026-02-01",
    },
    story: "A node that has its own journal.",
    journal: "<!-- context: session/2026-02-01 -->\n\nNode-level observations.",
  });

  // Update graphData to include the new node
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const updatedGraph: GraphData = {
    ...graphData,
    nodes: [
      ...graphData.nodes,
      { id: "node-with-journal", dir: "node-with-journal", title: "Node With Journal", type: "concept" },
    ],
  };
  await fs.writeFile(
    path.join(dir, "graph.json"),
    JSON.stringify(updatedGraph, null, 2),
  );

  app = createApi(dir, null);
});

afterAll(async () => {
  await cleanup?.();
});

// =============================================================================
// GET /api/config
// =============================================================================

describe("GET /api/config", () => {
  it("should return workspace config JSON", async () => {
    const res = await app.request("/api/config");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.repoType).toBe("concepts");
    expect(body.name).toBe("api-test");
    expect(body.types.concept.color).toBe("purple");
  });
});

// =============================================================================
// GET /api/graph
// =============================================================================

describe("GET /api/graph", () => {
  it("should return 200 with graph data", async () => {
    const res = await app.request("/api/graph");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("api-graph");
    expect(body.title).toBe("API Test Graph");
    expect(body.journal).toBe("Some journal notes.");
  });

  it("should return 404 for non-existent sub-graph path", async () => {
    const res = await app.request("/api/graph?path=nodes/nonexistent");

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("No graph.json found");
  });
});

// =============================================================================
// GET /api/nodes/:nodeId
// =============================================================================

describe("GET /api/nodes/:nodeId", () => {
  it("should return 200 with node data for existing node", async () => {
    const res = await app.request("/api/nodes/node-01");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("node-01");
    expect(body.story).toContain("Test Node");
    expect(body.identity.title).toBe("Test Node");
    expect(body.contentFiles).toHaveLength(1);
    expect(body.contentFiles[0].filename).toBe("concept.md");
  });

  it("should return 404 for non-existent node", async () => {
    const res = await app.request("/api/nodes/nonexistent");

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Node not found");
  });
});

// =============================================================================
// POST /api/nodes/:nodeId/annotations
// =============================================================================

describe("POST /api/nodes/:nodeId/annotations", () => {
  it("should create annotation and return 200 with filename", async () => {
    const res = await app.request(
      "/api/nodes/node-01/annotations",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signal: "reading",
          body: "An observation from the API",
        }),
      },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.filename).toMatch(/^001-/);
    expect(body.filename).toMatch(/\.md$/);
  });

  it("should return 400 for missing signal field", async () => {
    const res = await app.request(
      "/api/nodes/node-01/annotations",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: "Missing signal field",
        }),
      },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing");
  });

  it("should return 400 for missing body field", async () => {
    const res = await app.request(
      "/api/nodes/node-01/annotations",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signal: "reading",
        }),
      },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing");
  });
});

// =============================================================================
// POST /api/nodes (create node)
// =============================================================================

describe("POST /api/nodes", () => {
  it("should create node and return 201", async () => {
    const res = await app.request("/api/nodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "created-node",
        dir: "created-node",
        title: "Created Node",
        type: "concept",
        story: "The impulse behind this node.",
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.nodeId).toBe("created-node");
  });

  it("should make created node visible in graph", async () => {
    const res = await app.request("/api/graph");
    expect(res.status).toBe(200);
    const graph = await res.json();
    const created = graph.nodes.find((n: { id: string }) => n.id === "created-node");
    expect(created).toBeDefined();
    expect(created.title).toBe("Created Node");
  });

  it("should include edges when provided", async () => {
    const res = await app.request("/api/nodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "node-with-edges",
        dir: "node-with-edges",
        title: "Node With Edges",
        story: "Has connections.",
        edges: [
          { target: "node-01", type: "sparked-by", context: "testing" },
        ],
      }),
    });

    expect(res.status).toBe(201);

    const graphRes = await app.request("/api/graph");
    const graph = await graphRes.json();
    const edge = graph.edges.find(
      (e: { source: string }) => e.source === "node-with-edges",
    );
    expect(edge).toBeDefined();
    expect(edge.target).toBe("node-01");
    expect(edge.type).toBe("sparked-by");
  });

  it("should return 400 for missing required fields", async () => {
    const res = await app.request("/api/nodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "missing-story",
        dir: "missing-story",
        title: "Missing Story",
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing");
  });
});

// =============================================================================
// POST /api/nodes — view support
// =============================================================================

describe("POST /api/nodes — view support", () => {
  it("should create node with view.json and curates edges", async () => {
    const res = await app.request("/api/nodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "view-node",
        dir: "view-node",
        title: "View Node",
        type: "view",
        story: "A curated view.",
        view: { focal: "node-01", includes: ["node-01"] },
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.nodeId).toBe("view-node");

    // Verify curates edges in graph
    const graphRes = await app.request("/api/graph");
    const graph = await graphRes.json();
    const curatesEdge = graph.edges.find(
      (e: { source: string; type?: string }) =>
        e.source === "view-node" && e.type === "curates",
    );
    expect(curatesEdge).toBeDefined();
    expect(curatesEdge.target).toBe("node-01");
    expect(curatesEdge.context).toBe("focal");
  });

  it("should return view data when reading a view node", async () => {
    const res = await app.request("/api/nodes/view-node");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.view).toEqual({ focal: "node-01", includes: ["node-01"] });
  });
});

// =============================================================================
// PUT /api/nodes/:nodeId/view
// =============================================================================

describe("PUT /api/nodes/:nodeId/view", () => {
  it("should update view and return 200", async () => {
    const res = await app.request("/api/nodes/view-node/view", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        focal: "node-01",
        includes: ["node-01", "node-with-journal"],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("should sync curates edges in graph after update", async () => {
    const graphRes = await app.request("/api/graph");
    const graph = await graphRes.json();

    const curatesEdges = graph.edges.filter(
      (e: { source: string; type?: string }) =>
        e.source === "view-node" && e.type === "curates",
    );
    expect(curatesEdges).toHaveLength(2);

    const targets = curatesEdges.map((e: { target: string }) => e.target);
    expect(targets).toContain("node-01");
    expect(targets).toContain("node-with-journal");
  });

  it("should return 400 for missing focal", async () => {
    const res = await app.request("/api/nodes/view-node/view", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        includes: ["node-01"],
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing");
  });

  it("should return 400 for missing includes", async () => {
    const res = await app.request("/api/nodes/view-node/view", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        focal: "node-01",
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing");
  });
});

// =============================================================================
// GET /api/journal
// =============================================================================

describe("GET /api/journal", () => {
  it("should return workspace journal sections", async () => {
    const res = await app.request("/api/journal");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sections).toBeDefined();
    expect(Array.isArray(body.sections)).toBe(true);
    expect(body.sections.length).toBeGreaterThan(0);
  });

  it("should return node journal sections when path is provided", async () => {
    const res = await app.request(
      "/api/journal?path=nodes/node-with-journal",
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sections).toHaveLength(1);
    expect(body.sections[0].context).toBe("session/2026-02-01");
    expect(body.sections[0].body).toContain("Node-level observations.");
  });

  it("should return empty sections when node has no journal.md", async () => {
    const res = await app.request("/api/journal?path=nodes/node-01");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sections).toEqual([]);
  });
});

// =============================================================================
// PUT /api/journal
// =============================================================================

describe("PUT /api/journal", () => {
  it("should save journal and return 200", async () => {
    const res = await app.request("/api/journal", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sections: [
          { context: "opening", body: "Updated opening notes." },
          { context: "session/2026-02-01", body: "Session observations." },
        ],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("should return 400 for missing sections", async () => {
    const res = await app.request("/api/journal", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("sections");
  });

  it("should round-trip: saved sections appear in GET graph", async () => {
    const sections = [
      { context: "opening", body: "Round-trip opening." },
      { context: "session/2026-02-01", body: "Session notes." },
    ];

    await app.request("/api/journal", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sections }),
    });

    const res = await app.request("/api/graph");
    expect(res.status).toBe(200);
    const graph = await res.json();

    expect(graph.journalSections).toHaveLength(2);
    expect(graph.journalSections[0].context).toBe("opening");
    expect(graph.journalSections[0].body).toContain("Round-trip opening.");
    expect(graph.journalSections[1].context).toBe("session/2026-02-01");
  });
});

// =============================================================================
// POST /api/journal/entry
// =============================================================================

describe("POST /api/journal/entry", () => {
  it("should append entry and return 200", async () => {
    const res = await app.request("/api/journal/entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        context: "session/2026-02-03",
        body: "A session observation from the API.",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("should make entry visible in graph journal sections", async () => {
    const res = await app.request("/api/graph");
    expect(res.status).toBe(200);
    const graph = await res.json();

    const sessionSection = graph.journalSections.find(
      (s: { context: string }) => s.context === "session/2026-02-03",
    );
    expect(sessionSection).toBeDefined();
    expect(sessionSection.body).toContain("A session observation from the API.");
  });

  it("should return 400 for missing context", async () => {
    const res = await app.request("/api/journal/entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body: "Missing context.",
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing");
  });

  it("should return 400 for missing body", async () => {
    const res = await app.request("/api/journal/entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        context: "session/2026-02-03",
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing");
  });
});

// =============================================================================
// POST /api/journal/checkpoint
// =============================================================================

// =============================================================================
// PATCH /api/nodes/:nodeId/annotations/:filename
// =============================================================================

describe("PATCH /api/nodes/:nodeId/annotations/:filename", () => {
  let annotationFilename: string;

  it("should create a test annotation for PATCH tests", async () => {
    const res = await app.request(
      "/api/nodes/node-01/annotations",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signal: "proposal",
          body: "A proposal to test PATCH resolution",
        }),
      },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    annotationFilename = body.filename;
    expect(annotationFilename).toMatch(/\.md$/);
  });

  it("should resolve annotation and return 200 with updated meta", async () => {
    const res = await app.request(
      `/api/nodes/node-01/annotations/${annotationFilename}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "accepted" }),
      },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.meta.status).toBe("accepted");
    expect(body.meta.resolvedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("should return 400 for invalid status", async () => {
    const res = await app.request(
      `/api/nodes/node-01/annotations/${annotationFilename}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "invalid-value" }),
      },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid status");
  });

  it("should return 400 for missing status field", async () => {
    const res = await app.request(
      `/api/nodes/node-01/annotations/${annotationFilename}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid status");
  });

  it("should return error for non-existent annotation file", async () => {
    const res = await app.request(
      "/api/nodes/node-01/annotations/999-nonexistent.md",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "resolved" }),
      },
    );

    // Should return error status (500 from unhandled throw or 404)
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("POST /api/journal/checkpoint", () => {
  it("should return 400 when repoRoot is null", async () => {
    const res = await app.request(
      "/api/journal/checkpoint",
      { method: "POST" },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("git");
  });
});
