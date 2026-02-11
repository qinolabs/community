/**
 * Temp-directory fixtures for qino-lab-mcp tests.
 *
 * Helper functions that create protocol-compliant workspace structures
 * in the OS temp directory. Each test group creates its own isolated
 * directory via `createTempWorkspace()` and cleans up in `afterAll`.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type {
  GraphData,
  NodeIdentity,
  ViewData,
  WorkspaceConfig,
} from "../../src/server/types.js";

// ---------------------------------------------------------------------------
// Temp directory lifecycle
// ---------------------------------------------------------------------------

export async function createTempWorkspace(): Promise<{
  dir: string;
  cleanup: () => Promise<void>;
}> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "qino-lab-test-"));
  return {
    dir,
    cleanup: () => fs.rm(dir, { recursive: true, force: true }),
  };
}

// ---------------------------------------------------------------------------
// Config writers
// ---------------------------------------------------------------------------

export async function writeWorkspaceConfig(
  dir: string,
  config: WorkspaceConfig,
): Promise<void> {
  const configDir = path.join(dir, ".claude");
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(
    path.join(configDir, "qino-config.json"),
    JSON.stringify(config, null, 2),
  );
}

export async function writeGraph(
  dir: string,
  graph: GraphData,
): Promise<void> {
  await fs.writeFile(
    path.join(dir, "graph.json"),
    JSON.stringify(graph, null, 2),
  );
}

export async function writeJournal(
  dir: string,
  content: string,
): Promise<void> {
  await fs.writeFile(path.join(dir, "journal.md"), content);
}

// ---------------------------------------------------------------------------
// Node creation
// ---------------------------------------------------------------------------

export async function createNode(
  dir: string,
  opts: {
    nodeDir: string;
    identity?: NodeIdentity;
    story?: string;
    contentFiles?: Array<{ filename: string; content: string }>;
    annotations?: Array<{ filename: string; content: string }>;
    /** If provided, creates a sub-graph inside this node. */
    subGraph?: GraphData;
    /** If provided, writes a view.json inside this node. */
    view?: ViewData;
    /** If provided, writes a journal.md inside this node. */
    journal?: string;
    /** Override the default "nodes" directory name. */
    nodesDir?: string;
  },
): Promise<void> {
  const nodeDir = path.join(dir, opts.nodesDir ?? "nodes", opts.nodeDir);
  await fs.mkdir(nodeDir, { recursive: true });

  if (opts.identity) {
    await fs.writeFile(
      path.join(nodeDir, "node.json"),
      JSON.stringify(opts.identity, null, 2),
    );
  }

  if (opts.story !== undefined) {
    await fs.writeFile(path.join(nodeDir, "story.md"), opts.story);
  }

  if (opts.contentFiles) {
    const contentDir = path.join(nodeDir, "content");
    await fs.mkdir(contentDir, { recursive: true });
    for (const f of opts.contentFiles) {
      await fs.writeFile(path.join(contentDir, f.filename), f.content);
    }
  }

  if (opts.annotations) {
    const annotationsDir = path.join(nodeDir, "annotations");
    await fs.mkdir(annotationsDir, { recursive: true });
    for (const a of opts.annotations) {
      await fs.writeFile(path.join(annotationsDir, a.filename), a.content);
    }
  }

  if (opts.subGraph) {
    await fs.writeFile(
      path.join(nodeDir, "graph.json"),
      JSON.stringify(opts.subGraph, null, 2),
    );
  }

  if (opts.view) {
    await fs.writeFile(
      path.join(nodeDir, "view.json"),
      JSON.stringify(opts.view, null, 2),
    );
  }

  if (opts.journal !== undefined) {
    await fs.writeFile(path.join(nodeDir, "journal.md"), opts.journal);
  }
}
