#!/usr/bin/env node

/**
 * qino-lab-mcp entry point.
 *
 * Supports two modes of operation:
 *
 * **Standalone mode** (default, for distribution):
 *   - Starts both HTTP server (for browser UI) and MCP stdio transport
 *   - MCP tools use direct filesystem operations
 *   - User opens browser to localhost:4020 to see the UI
 *
 * **Client mode** (--api-url, for development):
 *   - Only starts MCP stdio transport (no HTTP server)
 *   - MCP tools use HTTP client to call existing dev server
 *   - Allows hot-reloading dev server to coexist with MCP integration
 *   - No port conflict
 *
 * Usage:
 *   # Standalone (distribution)
 *   qino-lab-mcp --workspace-dir /path/to/workspace
 *
 *   # Client (development)
 *   qino-lab-mcp --workspace-dir /path/to/workspace --api-url http://localhost:4020
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { serve } from "@hono/node-server";

import { createApi } from "./http-api.js";
import { registerTools } from "./mcp-tools.js";
import { createDirectOps, createHttpOps } from "./ops.js";
import { openBrowser } from "./open-browser.js";
import { resolveGitRoot, readConfig } from "./protocol-reader.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const workspaceDir =
  process.env.WORKSPACE_DIR ??
  getCliArg("--workspace-dir") ??
  process.cwd();

const port = Number(process.env.PORT ?? getCliArg("--port") ?? "4020");

const repoRootOverride = process.env.REPO_ROOT ?? getCliArg("--repo-root");

const apiUrl = process.env.API_URL ?? getCliArg("--api-url");

const noBrowser = process.argv.includes("--no-browser");

// Client mode: MCP tools call HTTP API instead of direct fs ops
const isClientMode = !!apiUrl;

// Resolve the built SPA directory.
// When running via tsx (dev), __dirname is src/server/ → we look up to the package root.
// When running from dist/server/ (production), __dirname is dist/server/ → ../ui is dist/ui/.
const packageRoot = path.resolve(__dirname, "../..");
const distUiDir = path.resolve(packageRoot, "dist/ui");

async function hasBuiltSpa(): Promise<boolean> {
  try {
    const fs = await import("node:fs/promises");
    // The built index.html has hashed asset references; source one doesn't
    const html = await fs.readFile(
      path.join(distUiDir, "index.html"),
      "utf-8",
    );
    return html.includes("/assets/");
  } catch {
    return false;
  }
}

function getCliArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && idx + 1 < process.argv.length) {
    return process.argv[idx + 1];
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Detect mode: stdio means Claude Code invoked us as an MCP server
// ---------------------------------------------------------------------------

const isStdio = !process.stdin.isTTY;

async function main() {
  // ── Resolve git repo root ─────────────────────────────────────

  const repoRoot =
    repoRootOverride ?? (await resolveGitRoot(workspaceDir));

  // Use consistent logging (stderr in MCP mode to keep stdout clean)
  const log = isStdio ? console.error : console.log;

  // ── Discover workspace paths for deeplink resolution ─────────────
  // Known workspaces allow deeplink builders to distinguish root-workspace
  // sub-paths (e.g., "nodes/emergence-experiments") from workspace-prefixed
  // paths (e.g., "qinolabs-repo/implementations/sound-lab").
  const knownWorkspaces = new Set<string>();
  const config = await readConfig(workspaceDir);
  if (config.workspaces) {
    for (const ws of Object.values(config.workspaces)) {
      if (ws.path) knownWorkspaces.add(ws.path);
    }
  }

  // ── HTTP server (standalone mode only) ──────────────────────────────

  // Base URL for deeplinks — constructed from port in standalone mode
  const baseUrl = `http://localhost:${port}`;

  if (!isClientMode) {
    const serveSpa = await hasBuiltSpa();
    const staticDir = serveSpa ? distUiDir : undefined;
    const api = createApi(workspaceDir, repoRoot, staticDir, baseUrl, knownWorkspaces);

    const httpServer = serve(
      { fetch: api.fetch, port },
      () => {
        log(`[qino-lab] HTTP server listening on http://localhost:${port}`);
        log(`[qino-lab] Workspace dir: ${workspaceDir}`);
        log(`[qino-lab] Repo root: ${repoRoot ?? "(not in a git repo)"}`);

        if (!noBrowser && !isStdio) {
          openBrowser(`http://localhost:${port}`);
        }
      },
    );

    // Graceful shutdown when MCP disconnects (if in MCP mode)
    if (isStdio) {
      process.on("exit", () => httpServer.close());
    }
  } else {
    log(`[qino-lab] Client mode — using API at ${apiUrl}`);
    log(`[qino-lab] Workspace dir: ${workspaceDir}`);
  }

  // ── MCP server (stdio mode only) ────────────────────────────

  if (isStdio) {
    const mcpServer = new McpServer({
      name: "qino-lab",
      version: "0.0.1",
    });

    // Create operations layer based on mode
    // In client mode, apiUrl is the base URL for deeplinks
    // In standalone mode, we use the baseUrl constructed above
    const opsBaseUrl = apiUrl ?? baseUrl;
    const ops = isClientMode
      ? createHttpOps(apiUrl)
      : createDirectOps(workspaceDir, repoRoot, opsBaseUrl, knownWorkspaces);

    registerTools(mcpServer, ops);

    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);

    // Graceful shutdown: close when MCP disconnects
    transport.onclose = () => {
      process.exit(0);
    };
  }
}

main().catch((err) => {
  console.error("[qino-lab] Fatal error:", err);
  process.exit(1);
});
