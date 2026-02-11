/**
 * Deeplink builder for qino-lab URLs.
 *
 * URL structure (from iteration 06):
 *   - Graph: /:workspace/graph?at=sub/path
 *   - Node:  /:workspace/node/:nodeId?at=sub/path
 *
 * The graphPath parameter from MCP tools contains the full path including workspace:
 *   "qinolabs-repo/implementations/sound-lab" -> workspace: qinolabs-repo, at: implementations/sound-lab
 *
 * For the root workspace, graphPath is either undefined (root graph) or starts
 * with an internal directory like "nodes/emergence-experiments". In both cases
 * the workspace is "_root" (the UI sentinel for the multi-workspace root).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeeplinkConfig {
  baseUrl: string; // e.g., "http://localhost:4020"
}

export interface GraphDeeplinkParams {
  workspace: string;
  at?: string; // sub-path within workspace
  highlight?: string[];
  view?: string;
}

export interface NodeDeeplinkParams {
  workspace: string;
  nodeId: string;
  at?: string; // sub-path within workspace
  section?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Sentinel workspace identifier for the multi-workspace root. */
const ROOT_WORKSPACE = "_root";

// ---------------------------------------------------------------------------
// Path Parsing
// ---------------------------------------------------------------------------

/**
 * Parse a graphPath into workspace and sub-path components.
 *
 * graphPath follows the pattern: "workspace/optional/sub/path"
 *
 * When `knownWorkspaces` is provided, the first segment is validated against
 * the set. If it doesn't match a known workspace, the entire path is treated
 * as a sub-path within the root workspace (_root).
 *
 * Examples (with knownWorkspaces = {"qinolabs-repo", "qino-concepts"}):
 *   "qinolabs-repo" -> { workspace: "qinolabs-repo", at: undefined }
 *   "qinolabs-repo/implementations/sound-lab" -> { workspace: "qinolabs-repo", at: "implementations/sound-lab" }
 *   "nodes/emergence-experiments" -> { workspace: "_root", at: "nodes/emergence-experiments" }
 *   undefined -> { workspace: "_root", at: undefined }
 */
export function parseGraphPath(
  graphPath?: string,
  knownWorkspaces?: ReadonlySet<string>,
): {
  workspace?: string;
  at?: string;
} {
  if (!graphPath) return { workspace: ROOT_WORKSPACE };

  const segments = graphPath.split("/");
  const firstSegment = segments[0]!;

  // When we know the workspace set, validate the first segment
  if (knownWorkspaces && !knownWorkspaces.has(firstSegment)) {
    return { workspace: ROOT_WORKSPACE, at: graphPath };
  }

  return {
    workspace: firstSegment,
    at: segments.length > 1 ? segments.slice(1).join("/") : undefined,
  };
}

// ---------------------------------------------------------------------------
// Deeplink Builders
// ---------------------------------------------------------------------------

/**
 * Build a deeplink to a graph view.
 *
 * @param config - Deeplink configuration with base URL
 * @param params - Graph parameters (workspace, optional sub-path, highlight, view)
 * @returns Full URL string
 */
export function buildGraphDeeplink(
  config: DeeplinkConfig,
  params: GraphDeeplinkParams,
): string {
  const url = new URL(
    `/${encodeURIComponent(params.workspace)}/graph`,
    config.baseUrl,
  );
  if (params.at) url.searchParams.set("at", params.at);
  if (params.highlight?.length)
    url.searchParams.set("highlight", params.highlight.join(","));
  if (params.view) url.searchParams.set("view", params.view);
  return url.toString();
}

/**
 * Build a deeplink to a specific node.
 *
 * @param config - Deeplink configuration with base URL
 * @param params - Node parameters (workspace, nodeId, optional sub-path, section)
 * @returns Full URL string
 */
export function buildNodeDeeplink(
  config: DeeplinkConfig,
  params: NodeDeeplinkParams,
): string {
  const url = new URL(
    `/${encodeURIComponent(params.workspace)}/node/${encodeURIComponent(params.nodeId)}`,
    config.baseUrl,
  );
  if (params.at) url.searchParams.set("at", params.at);
  if (params.section) url.searchParams.set("section", params.section);
  return url.toString();
}

// ---------------------------------------------------------------------------
// Response Link Builder
// ---------------------------------------------------------------------------

export interface GraphLinks {
  self: string;
  nodes: Record<string, string>;
}

export interface NodeLinks {
  self: string;
  graph: string;
}

/**
 * Build _links for a graph response.
 *
 * @param config - Deeplink configuration with base URL
 * @param graphPath - Full graph path (e.g., "qinolabs-repo/implementations/sound-lab")
 * @param nodeIds - Array of node IDs in the graph
 * @param knownWorkspaces - Set of known workspace directory names for root-workspace detection
 * @returns GraphLinks with self and nodes map
 */
export function buildGraphLinks(
  config: DeeplinkConfig,
  graphPath: string | undefined,
  nodeIds: string[],
  knownWorkspaces?: ReadonlySet<string>,
): GraphLinks {
  const { workspace, at } = parseGraphPath(graphPath, knownWorkspaces);

  // If no workspace, we can't build links
  if (!workspace) {
    return { self: "", nodes: {} };
  }

  const self = buildGraphDeeplink(config, { workspace, at });

  const nodes: Record<string, string> = {};
  for (const nodeId of nodeIds) {
    nodes[nodeId] = buildNodeDeeplink(config, { workspace, nodeId, at });
  }

  return { self, nodes };
}

/**
 * Build _links for a node response.
 *
 * @param config - Deeplink configuration with base URL
 * @param graphPath - Full graph path containing this node
 * @param nodeId - The node's ID
 * @param knownWorkspaces - Set of known workspace directory names for root-workspace detection
 * @returns NodeLinks with self and graph links
 */
export function buildNodeLinks(
  config: DeeplinkConfig,
  graphPath: string | undefined,
  nodeId: string,
  knownWorkspaces?: ReadonlySet<string>,
): NodeLinks {
  const { workspace, at } = parseGraphPath(graphPath, knownWorkspaces);

  // If no workspace, we can't build links
  if (!workspace) {
    return { self: "", graph: "" };
  }

  return {
    self: buildNodeDeeplink(config, { workspace, nodeId, at }),
    graph: buildGraphDeeplink(config, { workspace, at }),
  };
}
