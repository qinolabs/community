/**
 * ops.ts — Operations abstraction for qino-lab protocol.
 *
 * Provides a unified interface for protocol operations that can be backed by:
 * - Direct filesystem operations (standalone mode)
 * - HTTP client calls (development mode, delegates to running dev server)
 *
 * This enables the MCP server to work both as a self-contained distribution
 * AND alongside a hot-reloading dev server during development.
 */

import type {
  GraphWithLinks,
  NodeDetailWithLinks,
  LandingData,
  WorkspaceConfig,
  AgentSignal,
  AnnotationMeta,
} from "./types.js";
import { buildGraphLinks, buildNodeLinks } from "./deeplinks.js";

// ---------------------------------------------------------------------------
// Operations Interface
// ---------------------------------------------------------------------------

export interface WriteAnnotationArgs {
  nodeId: string;
  signal: AgentSignal;
  body: string;
  target?: string;
  graphPath?: string;
}

export interface CreateNodeArgs {
  id: string;
  dir: string;
  title: string;
  type?: string;
  status?: string;
  story: string;
  edges?: Array<{ target: string; type?: string; context?: string }>;
  view?: { focal: string; includes: string[] };
  graphPath?: string;
}

export interface WriteJournalEntryArgs {
  context: string;
  body: string;
  nodeId?: string;
  graphPath?: string;
}

export interface UpdateViewArgs {
  nodeId: string;
  focal: string;
  includes: string[];
  graphPath?: string;
}

export interface ResolveAnnotationArgs {
  nodeId: string;
  filename: string;
  status: "accepted" | "resolved" | "dismissed";
  graphPath?: string;
}

/**
 * Protocol operations interface.
 *
 * Each method corresponds to a protocol operation (read or write).
 * Implementations can be backed by direct filesystem ops or HTTP calls.
 *
 * Read responses include `_links` for hypermedia navigation:
 * - `readGraph` returns `_links.self` and `_links.nodes` (map of nodeId -> deeplink)
 * - `readNode` returns `_links.self` and `_links.graph`
 */
export interface ProtocolOps {
  // Read operations
  readConfig(): Promise<WorkspaceConfig>;
  readLanding(): Promise<LandingData>;
  readGraph(graphPath?: string): Promise<GraphWithLinks | null>;
  readNode(nodeId: string, graphPath?: string): Promise<NodeDetailWithLinks | null>;

  // Write operations
  writeAnnotation(
    args: WriteAnnotationArgs,
  ): Promise<{ success: true; filename: string }>;
  createNode(args: CreateNodeArgs): Promise<{ success: true; nodeId: string; applied: { status: string } }>;
  writeJournalEntry(args: WriteJournalEntryArgs): Promise<{ success: true }>;
  updateView(args: UpdateViewArgs): Promise<{ success: true }>;
  resolveAnnotation(
    args: ResolveAnnotationArgs,
  ): Promise<{ success: true; meta: AnnotationMeta }>;
}

// ---------------------------------------------------------------------------
// Direct Filesystem Operations (Standalone Mode)
// ---------------------------------------------------------------------------

import {
  readConfig as fsReadConfig,
  readLandingData as fsReadLanding,
  readGraph as fsReadGraph,
  readNode as fsReadNode,
  writeAnnotation as fsWriteAnnotation,
  createNode as fsCreateNode,
  writeJournalEntry as fsWriteJournalEntry,
  updateView as fsUpdateView,
  resolveAnnotation as fsResolveAnnotation,
} from "./protocol-reader.js";

/**
 * Create operations backed by direct filesystem access.
 *
 * Used in standalone mode (distribution) where the MCP server
 * handles both HTTP serving and MCP tools.
 *
 * @param workspaceDir - Absolute path to the workspace directory
 * @param _repoRoot - Git repository root (unused, kept for API compatibility)
 * @param baseUrl - Base URL for building deeplinks (e.g., "http://localhost:4020")
 * @param knownWorkspaces - Set of known workspace directory names for root-workspace detection in deeplinks
 */
export function createDirectOps(
  workspaceDir: string,
  _repoRoot: string | null,
  baseUrl: string,
  knownWorkspaces?: ReadonlySet<string>,
): ProtocolOps {
  const resolveGraphDir = (graphPath?: string) =>
    graphPath ? `${workspaceDir}/${graphPath}` : workspaceDir;

  const deeplinkConfig = { baseUrl };

  return {
    readConfig: () => fsReadConfig(workspaceDir),
    readLanding: () => fsReadLanding(workspaceDir),

    readGraph: async (graphPath) => {
      const graph = await fsReadGraph(resolveGraphDir(graphPath));
      if (!graph) return null;

      const nodeIds = graph.nodes.map((n) => n.id);
      const _links = buildGraphLinks(deeplinkConfig, graphPath, nodeIds, knownWorkspaces);

      return { ...graph, _links };
    },

    readNode: async (nodeId, graphPath) => {
      const node = await fsReadNode(resolveGraphDir(graphPath), nodeId, graphPath);
      if (!node) return null;

      const _links = buildNodeLinks(deeplinkConfig, graphPath, nodeId, knownWorkspaces);

      return { ...node, _links };
    },

    writeAnnotation: async (args) => {
      const graphDir = resolveGraphDir(args.graphPath);
      return fsWriteAnnotation(
        graphDir,
        args.nodeId,
        args.signal,
        args.body,
        args.target,
      );
    },

    createNode: async (args) => {
      const graphDir = resolveGraphDir(args.graphPath);
      return fsCreateNode(graphDir, {
        id: args.id,
        dir: args.dir,
        title: args.title,
        type: args.type,
        status: args.status,
        story: args.story,
        edges: args.edges,
        view: args.view,
      });
    },

    writeJournalEntry: async (args) => {
      const graphDir = resolveGraphDir(args.graphPath);
      return fsWriteJournalEntry(graphDir, {
        context: args.context,
        body: args.body,
        nodeId: args.nodeId,
      });
    },

    updateView: async (args) => {
      const graphDir = resolveGraphDir(args.graphPath);
      return fsUpdateView(graphDir, args.nodeId, {
        focal: args.focal,
        includes: args.includes,
      });
    },

    resolveAnnotation: async (args) => {
      const graphDir = resolveGraphDir(args.graphPath);
      return fsResolveAnnotation(
        graphDir,
        args.nodeId,
        args.filename,
        args.status,
      );
    },
  };
}

// ---------------------------------------------------------------------------
// HTTP Client Operations (Development Mode)
// ---------------------------------------------------------------------------

/**
 * Create operations backed by HTTP calls to a running dev server.
 *
 * Used in development mode where a separate dev server (with hot reload)
 * handles the actual filesystem operations. The MCP server becomes a thin
 * client that translates MCP calls to HTTP requests.
 *
 * Benefits:
 * - No port conflict (MCP server doesn't start HTTP)
 * - Hot reload works (dev server handles requests)
 * - Real-time UI updates (single source of truth)
 *
 * Note: The HTTP API returns responses with `_links` already attached,
 * so this client simply passes them through.
 */
export function createHttpOps(apiUrl: string): ProtocolOps {
  const buildUrl = (path: string, params?: Record<string, string>) => {
    const url = new URL(path, apiUrl);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.set(key, value);
        }
      }
    }
    return url.toString();
  };

  const handleResponse = async <T>(res: Response): Promise<T> => {
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  };

  return {
    readConfig: async () => {
      const res = await fetch(buildUrl("/api/config"));
      return handleResponse<WorkspaceConfig>(res);
    },

    readLanding: async () => {
      const res = await fetch(buildUrl("/api/landing"));
      return handleResponse<LandingData>(res);
    },

    readGraph: async (graphPath) => {
      const res = await fetch(
        buildUrl("/api/graph", graphPath ? { path: graphPath } : undefined),
      );
      if (res.status === 404) return null;
      return handleResponse<GraphWithLinks>(res);
    },

    readNode: async (nodeId, graphPath) => {
      const res = await fetch(
        buildUrl(
          `/api/nodes/${encodeURIComponent(nodeId)}`,
          graphPath ? { path: graphPath } : undefined,
        ),
      );
      if (res.status === 404) return null;
      return handleResponse<NodeDetailWithLinks>(res);
    },

    writeAnnotation: async (args) => {
      const res = await fetch(
        buildUrl(
          `/api/nodes/${encodeURIComponent(args.nodeId)}/annotations`,
          args.graphPath ? { path: args.graphPath } : undefined,
        ),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            signal: args.signal,
            body: args.body,
            target: args.target,
          }),
        },
      );
      return handleResponse<{ success: true; filename: string }>(res);
    },

    createNode: async (args) => {
      const res = await fetch(
        buildUrl(
          "/api/nodes",
          args.graphPath ? { path: args.graphPath } : undefined,
        ),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: args.id,
            dir: args.dir,
            title: args.title,
            type: args.type,
            status: args.status,
            story: args.story,
            edges: args.edges,
            view: args.view,
          }),
        },
      );
      return handleResponse<{ success: true; nodeId: string; applied: { status: string } }>(res);
    },

    writeJournalEntry: async (args) => {
      const res = await fetch(
        buildUrl(
          "/api/journal/entry",
          args.graphPath ? { path: args.graphPath } : undefined,
        ),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            context: args.context,
            body: args.body,
            nodeId: args.nodeId,
          }),
        },
      );
      return handleResponse<{ success: true }>(res);
    },

    updateView: async (args) => {
      const res = await fetch(
        buildUrl(
          `/api/nodes/${encodeURIComponent(args.nodeId)}/view`,
          args.graphPath ? { path: args.graphPath } : undefined,
        ),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            focal: args.focal,
            includes: args.includes,
          }),
        },
      );
      return handleResponse<{ success: true }>(res);
    },

    resolveAnnotation: async (args) => {
      const res = await fetch(
        buildUrl(
          `/api/nodes/${encodeURIComponent(args.nodeId)}/annotations/${encodeURIComponent(args.filename)}`,
          args.graphPath ? { path: args.graphPath } : undefined,
        ),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: args.status }),
        },
      );
      return handleResponse<{ success: true; meta: AnnotationMeta }>(res);
    },
  };
}
