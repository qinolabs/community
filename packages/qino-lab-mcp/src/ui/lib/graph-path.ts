/**
 * Centralized graph path computation utilities.
 *
 * The qino-lab UI uses a flat routing model where graph hierarchy is encoded
 * in the `at` query parameter rather than nested route segments.
 *
 * Path structure:
 *   {workspace}/{subPath}
 *
 * Examples:
 *   "qinolabs-repo"                           (root workspace graph)
 *   "qinolabs-repo/implementations"           (sub-graph at implementations/)
 *   "qinolabs-repo/implementations/sound-lab" (nested sub-graph)
 *   "_root"                                   (multi-workspace root)
 */

/** Sentinel workspace identifier for the multi-workspace root. */
export const ROOT_WORKSPACE = "_root";

/** Resolve URL workspace to API-compatible path (_root → ""). */
export function resolveWorkspace(workspace: string): string {
  return workspace === ROOT_WORKSPACE ? "" : workspace;
}

/**
 * Combine workspace and optional sub-path into a full graph path.
 * Used for API queries and context construction.
 *
 * Resolves the _root sentinel internally so callers don't need to handle it.
 */
export function computeGraphPath(
  workspace: string,
  subPath?: string,
): string {
  const resolved = resolveWorkspace(workspace);
  if (!subPath) return resolved;
  return resolved ? `${resolved}/${subPath}` : subPath;
}

/**
 * Compute the path to a node's directory within a graph.
 * Used for fetching node-specific data like journals.
 *
 * @param graphPath - Full graph path (workspace + subPath)
 * @param nodesDir - Directory containing nodes (from graph.json, defaults to "nodes")
 * @param nodeDir - Node's directory name (from graph entry)
 */
export function computeNodePath(
  graphPath: string,
  nodesDir: string,
  nodeDir: string,
): string {
  return `${graphPath}/${nodesDir}/${nodeDir}`;
}

/**
 * Parse a sub-path into its parent context.
 *
 * Given a path like "implementations/sound-lab/explorations/nodes/paths-overview",
 * extracts the parent graph path and parent node information.
 *
 * This is used for "back" navigation when viewing a node inside a sub-graph.
 *
 * @returns null if at root level (no parent), otherwise parent context
 */
export function parseParentFromSubPath(
  subPath: string | undefined,
): { parentAt: string | undefined; parentNodeDir: string } | null {
  if (!subPath) {
    return null; // At root level, no parent
  }

  const segments = subPath.split("/");

  // Minimum structure for sub-graph: {nodesDir}/{nodeDir}
  // e.g., "nodes/sound-lab" means we're in sound-lab's sub-graph
  if (segments.length < 2) {
    return null;
  }

  // Last segment is the node directory containing this sub-graph
  const parentNodeDir = segments[segments.length - 1] ?? "";

  // Everything before last 2 segments is the parent's `at` path
  // e.g., "implementations/nodes/sound-lab" → parentAt = "implementations"
  if (segments.length <= 2) {
    return { parentAt: undefined, parentNodeDir };
  }

  const parentAt = segments.slice(0, -2).join("/");
  return { parentAt: parentAt || undefined, parentNodeDir };
}
