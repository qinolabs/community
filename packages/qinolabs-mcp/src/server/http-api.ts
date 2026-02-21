/**
 * Hono HTTP API for the qino-lab browser UI.
 *
 * Each route is a thin wrapper around a protocol-reader function.
 * The API serves both dev mode (proxied from Vite) and production
 * (bundled SPA assets served from dist/ui).
 */

import fs from "node:fs/promises";
import nodePath from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";

import type { FileWatcher } from "./file-watcher.js";
import {
  readConfig,
  readGraph,
  readLandingData,
  readNode,
  readTextFile,
  parseJournalSections,
  writeAnnotation,
  resolveAnnotation,
  saveJournal,
  checkpointJournal,
  createNode,
  writeJournalEntry,
  updateView,
  readData,
  writeData,
  resolveTargetPath,
} from "./protocol-reader.js";

import {
  assertWithinWorkspace,
  resolveEditorCommand,
  revealInExplorer,
  openInEditor,
} from "./shell-actions.js";

import type { AgentSignal, JournalSection } from "./types.js";
import { buildGraphLinks, buildNodeLinks } from "./deeplinks.js";

/** Resolve the `path` query parameter — strip the _root sentinel used in deep links. */
function resolveApiPath(raw: string | undefined): string | undefined {
  if (!raw || raw === "_root") return undefined;
  return raw;
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

export function createApi(
  workspaceDir: string,
  repoRoot: string | null,
  staticDir?: string,
  baseUrl?: string,
  knownWorkspaces?: ReadonlySet<string>,
  watcher?: FileWatcher,
) {
  const app = new Hono();

  // Deeplink config — uses provided baseUrl or derives from request
  const getDeeplinkConfig = (requestUrl?: string) => {
    if (baseUrl) return { baseUrl };
    // Fallback: derive from request URL (works for most cases)
    if (requestUrl) {
      const url = new URL(requestUrl);
      return { baseUrl: `${url.protocol}//${url.host}` };
    }
    return { baseUrl: "http://localhost:4020" };
  };

  app.use("/api/*", cors());

  // ── SSE events ─────────────────────────────────────────────────

  app.get("/api/events", (c) => {
    return streamSSE(c, async (stream) => {
      if (!watcher) {
        // No watcher (client mode) — keep connection alive without events.
        // This prevents EventSource from entering aggressive retry.
        await new Promise<void>((resolve) => {
          c.req.raw.signal.addEventListener("abort", () => resolve());
        });
        return;
      }

      // Send each file-change event as an SSE message
      const unsubscribe = watcher.subscribe((event) => {
        stream.writeSSE({ data: JSON.stringify(event) }).catch(() => {
          // Write failure means the connection is closing — handled below
        });
      });

      // Wait for client disconnect
      await new Promise<void>((resolve) => {
        c.req.raw.signal.addEventListener("abort", () => resolve());
      });

      unsubscribe();
    });
  });

  // ── Read endpoints ─────────────────────────────────────────────

  app.get("/api/config", async (c) => {
    const configPath = resolveApiPath(c.req.query("path"));
    const configDir = configPath
      ? nodePath.join(workspaceDir, configPath)
      : workspaceDir;
    const config = await readConfig(configDir);
    return c.json(config);
  });

  app.get("/api/landing", async (c) => {
    const landing = await readLandingData(workspaceDir);
    return c.json(landing);
  });

  app.get("/api/graph", async (c) => {
    const graphPath = resolveApiPath(c.req.query("path"));
    const graphDir = graphPath
      ? nodePath.join(workspaceDir, graphPath)
      : workspaceDir;
    const graph = await readGraph(graphDir);
    if (!graph) {
      // Return available workspaces for better error UX
      const landing = await readLandingData(workspaceDir);
      const workspaceNames = landing.workspaces
        .filter((ws) => ws.nodeCount != null)
        .map((ws) => ws.path || ws.name);
      return c.json(
        {
          error: "No graph.json found",
          path: graphPath,
          availableWorkspaces: workspaceNames,
        },
        404,
      );
    }

    // Add _links for hypermedia navigation
    const deeplinkConfig = getDeeplinkConfig(c.req.url);
    const nodeIds = graph.nodes.map((n) => n.id);
    const _links = buildGraphLinks(deeplinkConfig, graphPath, nodeIds, knownWorkspaces);

    return c.json({ ...graph, _links });
  });

  app.get("/api/nodes/:nodeId", async (c) => {
    const nodeId = c.req.param("nodeId");
    const graphPath = resolveApiPath(c.req.query("path"));
    const graphDir = graphPath
      ? nodePath.join(workspaceDir, graphPath)
      : workspaceDir;
    // Pass graphPath (the `at` query param) for parent context computation
    const node = await readNode(graphDir, nodeId, graphPath);
    if (!node) {
      return c.json({ error: "Node not found" }, 404);
    }

    // Add _links for hypermedia navigation
    const deeplinkConfig = getDeeplinkConfig(c.req.url);
    const _links = buildNodeLinks(deeplinkConfig, graphPath, nodeId, knownWorkspaces);

    return c.json({ ...node, _links });
  });

  // ── Write endpoints ──────────────────────────────────────────────

  app.post("/api/nodes/:nodeId/annotations", async (c) => {
    const nodeId = c.req.param("nodeId");
    const graphPath = resolveApiPath(c.req.query("path"));
    const graphDir = graphPath
      ? nodePath.join(workspaceDir, graphPath)
      : workspaceDir;

    const body = await c.req.json<{
      signal: AgentSignal;
      body: string;
      target?: string;
    }>();

    if (!body.signal || !body.body) {
      return c.json({ error: "Missing signal or body" }, 400);
    }

    const result = await writeAnnotation(
      graphDir,
      nodeId,
      body.signal,
      body.body,
      body.target,
    );
    return c.json(result);
  });

  app.patch("/api/nodes/:nodeId/annotations/:filename", async (c) => {
    const nodeId = c.req.param("nodeId");
    const filename = c.req.param("filename");
    const graphPath = resolveApiPath(c.req.query("path"));
    const graphDir = graphPath
      ? nodePath.join(workspaceDir, graphPath)
      : workspaceDir;

    const body = await c.req.json<{ status: string }>();
    const validStatuses = new Set(["accepted", "resolved", "dismissed"]);
    if (!body.status || !validStatuses.has(body.status)) {
      return c.json(
        { error: "Invalid status. Must be: accepted, resolved, or dismissed" },
        400,
      );
    }

    try {
      const result = await resolveAnnotation(
        graphDir,
        nodeId,
        filename,
        body.status as "accepted" | "resolved" | "dismissed",
      );
      return c.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      if (message.includes("not found") || message.includes("Not found")) {
        return c.json({ error: message }, 404);
      }
      throw err;
    }
  });

  app.get("/api/journal", async (c) => {
    const graphPath = resolveApiPath(c.req.query("path"));
    const graphDir = graphPath
      ? nodePath.join(workspaceDir, graphPath)
      : workspaceDir;

    const journal = await readTextFile(
      nodePath.join(graphDir, "journal.md"),
    );
    const sections = journal ? parseJournalSections(journal) : [];
    return c.json({ sections });
  });

  app.put("/api/journal", async (c) => {
    const graphPath = resolveApiPath(c.req.query("path"));
    const graphDir = graphPath
      ? nodePath.join(workspaceDir, graphPath)
      : workspaceDir;

    const body = await c.req.json<{ sections: JournalSection[] }>();

    if (!body.sections || !Array.isArray(body.sections)) {
      return c.json({ error: "Missing or invalid sections array" }, 400);
    }

    const result = await saveJournal(graphDir, body.sections);
    return c.json(result);
  });

  app.post("/api/nodes", async (c) => {
    const graphPath = resolveApiPath(c.req.query("path"));
    const graphDir = graphPath
      ? nodePath.join(workspaceDir, graphPath)
      : workspaceDir;

    const body = await c.req.json<{
      id: string;
      dir: string;
      title: string;
      type?: string;
      status?: string;
      story: string;
      edges?: Array<{ target: string; type?: string; context?: string }>;
      view?: { focal: string; includes: string[] };
    }>();

    if (!body.id || !body.dir || !body.title || !body.story) {
      return c.json({ error: "Missing required fields: id, dir, title, story" }, 400);
    }

    const result = await createNode(graphDir, body);
    return c.json(result, 201);
  });

  app.post("/api/journal/entry", async (c) => {
    const graphPath = resolveApiPath(c.req.query("path"));
    const graphDir = graphPath
      ? nodePath.join(workspaceDir, graphPath)
      : workspaceDir;

    const body = await c.req.json<{
      context: string;
      body: string;
      nodeId?: string;
    }>();

    if (!body.context || !body.body) {
      return c.json({ error: "Missing required fields: context, body" }, 400);
    }

    const result = await writeJournalEntry(graphDir, body);
    return c.json(result);
  });

  app.put("/api/nodes/:nodeId/view", async (c) => {
    const nodeId = c.req.param("nodeId");
    const graphPath = resolveApiPath(c.req.query("path"));
    const graphDir = graphPath
      ? nodePath.join(workspaceDir, graphPath)
      : workspaceDir;

    const body = await c.req.json<{
      focal: string;
      includes: string[];
    }>();

    if (!body.focal || !Array.isArray(body.includes)) {
      return c.json({ error: "Missing required fields: focal, includes" }, 400);
    }

    const result = await updateView(graphDir, nodeId, body);
    return c.json(result);
  });

  // ── Data endpoints ───────────────────────────────────────────────

  app.get("/api/nodes/:nodeId/data", async (c) => {
    const nodeId = c.req.param("nodeId");
    const graphPath = resolveApiPath(c.req.query("path"));
    const graphDir = graphPath
      ? nodePath.join(workspaceDir, graphPath)
      : workspaceDir;

    try {
      const result = await readData(graphDir, nodeId);
      return c.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      if (message.includes("not found") || message.includes("Not found")) {
        return c.json({ error: message }, 404);
      }
      throw err;
    }
  });

  app.get("/api/nodes/:nodeId/data/:filename", async (c) => {
    const nodeId = c.req.param("nodeId");
    const filename = c.req.param("filename");
    const graphPath = resolveApiPath(c.req.query("path"));
    const graphDir = graphPath
      ? nodePath.join(workspaceDir, graphPath)
      : workspaceDir;

    try {
      const result = await readData(graphDir, nodeId, filename);
      return c.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      if (message.includes("not found") || message.includes("Not found")) {
        return c.json({ error: message }, 404);
      }
      throw err;
    }
  });

  app.put("/api/nodes/:nodeId/data/:filename", async (c) => {
    const nodeId = c.req.param("nodeId");
    const filename = c.req.param("filename");
    const graphPath = resolveApiPath(c.req.query("path"));
    const graphDir = graphPath
      ? nodePath.join(workspaceDir, graphPath)
      : workspaceDir;

    const body = await c.req.json<{ data: string }>();

    if (!body.data) {
      return c.json({ error: "Missing required field: data" }, 400);
    }

    try {
      const result = await writeData(graphDir, nodeId, filename, body.data);
      return c.json(result, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      if (message.includes("not found") || message.includes("Not found")) {
        return c.json({ error: message }, 404);
      }
      if (message.includes("Invalid JSON")) {
        return c.json({ error: message }, 400);
      }
      throw err;
    }
  });

  app.post("/api/journal/checkpoint", async (c) => {
    if (!repoRoot) {
      return c.json({ error: "Not in a git repository" }, 400);
    }

    const graphPath = resolveApiPath(c.req.query("path"));
    const graphDir = graphPath
      ? nodePath.join(workspaceDir, graphPath)
      : workspaceDir;

    const result = await checkpointJournal(graphDir, repoRoot);
    return c.json(result);
  });

  // ── Shell action endpoints ───────────────────────────────────────

  app.post("/api/reveal", async (c) => {
    const body = await c.req.json<{
      graphPath?: string;
      nodeId?: string;
      file?: string;
    }>();

    const targetPath = await resolveTargetPath(workspaceDir, body);
    if (!targetPath) {
      return c.json({ error: "Path not found" }, 404);
    }

    try {
      assertWithinWorkspace(targetPath, workspaceDir);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Path validation failed";
      return c.json({ error: message }, 403);
    }

    try {
      await revealInExplorer(targetPath);
      return c.json({ success: true, path: targetPath });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to reveal";
      return c.json({ error: message }, 500);
    }
  });

  app.post("/api/open", async (c) => {
    const body = await c.req.json<{
      graphPath?: string;
      nodeId?: string;
      file?: string;
      line?: number;
    }>();

    const targetPath = await resolveTargetPath(workspaceDir, body);
    if (!targetPath) {
      return c.json({ error: "Path not found" }, 404);
    }

    try {
      assertWithinWorkspace(targetPath, workspaceDir);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Path validation failed";
      return c.json({ error: message }, 403);
    }

    // Resolve editor command from config (read on each call to pick up changes)
    const config = await readConfig(workspaceDir);
    const editor = resolveEditorCommand(config.editor);

    try {
      await openInEditor(targetPath, editor, body.line);
      return c.json({ success: true, path: targetPath, editor });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to open in editor";
      return c.json({ error: message }, 500);
    }
  });

  // ── Static SPA serving (production only) ───────────────────────

  if (staticDir) {
    app.get("*", async (c) => {
      const url = new URL(c.req.url);
      const reqPath = url.pathname === "/" ? "/index.html" : url.pathname;
      const filePath = nodePath.join(staticDir, reqPath);

      try {
        const content = await fs.readFile(filePath);
        const ext = nodePath.extname(filePath);
        const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
        return new Response(content, {
          headers: { "content-type": contentType },
        });
      } catch {
        // Missing assets (files with extensions) should 404, not serve HTML.
        // SPA fallback only applies to navigation routes (extensionless paths).
        if (nodePath.extname(reqPath)) {
          return c.notFound();
        }
        const html = await fs.readFile(
          nodePath.join(staticDir, "index.html"),
          "utf-8",
        );
        return c.html(html);
      }
    });
  }

  return app;
}
