/**
 * protocol-reader.ts — Filesystem operations for qino-protocol workspaces.
 *
 * Reads and writes the universal qino-protocol file structure:
 *   graph.json  — index (nodes, edges)
 *   node.json   — identity (per node)
 *   story.md    — impulse (per node)
 *   content/    — domain-specific files (per node, discovered)
 *   annotations/ — agent signals (per node)
 *   journal.md  — bidirectional channel (workspace or node level)
 *
 * Every function takes a `workspaceDir` parameter so callers (MCP tools,
 * HTTP routes) can configure the workspace directory independently.
 * Zero framework dependencies — only Node.js built-ins.
 */

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type {
  ActionItem,
  AgentSignal,
  Annotation,
  AnnotationMeta,
  AnnotationStatus,
  BreadcrumbItem,
  ContentFile,
  GraphData,
  GraphEdge,
  GraphNodeEntry,
  GraphWithJournal,
  JournalSection,
  LandingData,
  NavigatorEntry,
  NodeDetail,
  NodeIdentity,
  RecentNode,
  SubGraphEntry,
  ViewData,
  ViewEntry,
  WorkspaceConfig,
  WorkspaceEntry,
} from "./types.js";

const VALID_SIGNALS = new Set<AgentSignal>([
  "reading",
  "connection",
  "tension",
  "proposal",
]);

const VALID_STATUSES = new Set<AnnotationStatus>([
  "open",
  "accepted",
  "resolved",
  "dismissed",
]);

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalize literal escape sequences that LLMs sometimes emit in MCP tool arguments.
 * Converts literal `\n` and `\t` character pairs to real newlines/tabs.
 */
function normalizeLlmEscapes(text: string): string {
  return text.replaceAll("\\n", "\n").replaceAll("\\t", "\t");
}

export async function readTextFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

async function listDir(dirPath: string): Promise<string[]> {
  try {
    return await fs.readdir(dirPath);
  } catch {
    return [];
  }
}

/**
 * Parse journal.md into sections split by context headers.
 *
 * Context headers are HTML comments: `<!-- context: session/2026-02-02 -->`
 * Content before the first context header gets the "opening" context.
 *
 * @internal Exported for testing — not part of the public API.
 */
export function parseJournalSections(raw: string): JournalSection[] {
  const sections: JournalSection[] = [];
  const contextPattern = /<!-- context: (.+?) -->/g;

  let lastIndex = 0;
  let currentContext = "opening";
  let match = contextPattern.exec(raw);

  while (match !== null) {
    const textBefore = raw.slice(lastIndex, match.index).trim();
    if (textBefore) {
      sections.push({ context: currentContext, body: textBefore });
    }

    currentContext = match[1] ?? "unknown";
    lastIndex = match.index + match[0].length;
    match = contextPattern.exec(raw);
  }

  const remaining = raw.slice(lastIndex).trim();
  if (remaining) {
    sections.push({ context: currentContext, body: remaining });
  }

  return sections;
}

/**
 * Reconstruct journal.md from structured sections.
 *
 * @internal Exported for testing — not part of the public API.
 */
export function sectionsToMarkdown(sections: JournalSection[]): string {
  const parts: string[] = [];

  for (const section of sections) {
    const trimmed = section.body.trim();
    if (!trimmed) continue;

    if (section.context === "opening") {
      parts.push(trimmed);
    } else {
      parts.push(`<!-- context: ${section.context} -->\n\n${trimmed}`);
    }
  }

  return parts.join("\n\n") + "\n";
}

/**
 * Parse a markdown annotation file with YAML-like front matter.
 *
 * @internal Exported for testing — not part of the public API.
 */
export function parseAnnotation(
  raw: string,
): { meta: AnnotationMeta; content: string } | null {
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch?.[1] || !fmMatch[2]) return null;

  const frontMatter = fmMatch[1];
  const content = fmMatch[2].trim();

  const meta: Record<string, string> = {};
  for (const line of frontMatter.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      meta[key] = value;
    }
  }

  const rawSignal = meta["signal"];
  const signal: AgentSignal =
    rawSignal && VALID_SIGNALS.has(rawSignal as AgentSignal)
      ? (rawSignal as AgentSignal)
      : "reading";

  const rawStatus = meta["status"];
  const status: AnnotationStatus | undefined =
    rawStatus && VALID_STATUSES.has(rawStatus as AnnotationStatus)
      ? (rawStatus as AnnotationStatus)
      : undefined;

  return {
    meta: {
      author: "agent",
      signal,
      target: meta["target"],
      created: meta["created"] ?? "",
      ...(status ? { status } : {}),
      ...(meta["resolvedAt"] ? { resolvedAt: meta["resolvedAt"] } : {}),
    },
    content,
  };
}

/**
 * Read annotation files from a directory.
 */
async function readAnnotationsFromDir(dirPath: string): Promise<Annotation[]> {
  const files = await listDir(dirPath);
  const mdFiles = files.filter((f) => f.endsWith(".md")).sort();
  const annotations: Annotation[] = [];

  for (const file of mdFiles) {
    const raw = await readTextFile(path.join(dirPath, file));
    if (!raw) continue;

    const parsed = parseAnnotation(raw);
    if (parsed) {
      annotations.push({
        filename: file,
        meta: parsed.meta,
        content: parsed.content,
      });
    }
  }

  return annotations;
}

const ACTION_SIGNALS = new Set<AgentSignal>(["proposal", "tension"]);

/**
 * Collect action items from a node's annotations directory.
 *
 * Filters for proposal/tension signals and extracts a preview line
 * from each annotation body.
 */
async function collectActionItems(
  annotationsDir: string,
  nodeId: string,
  nodeTitle: string,
  graphPath?: string,
  workspaceName?: string,
): Promise<ActionItem[]> {
  const annotations = await readAnnotationsFromDir(annotationsDir);
  const items: ActionItem[] = [];

  for (const ann of annotations) {
    if (!ACTION_SIGNALS.has(ann.meta.signal)) continue;

    // Skip resolved/dismissed annotations — they no longer need attention
    const annStatus = ann.meta.status ?? "open";
    if (annStatus === "resolved" || annStatus === "dismissed") continue;

    // Extract first non-empty line as preview, truncated to 120 chars
    const preview =
      ann.content
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.length > 0)
        ?.slice(0, 120) ?? "";

    // Get file mtime for precise timestamp display
    let modified: number | undefined;
    try {
      const stat = await fs.stat(path.join(annotationsDir, ann.filename));
      modified = stat.mtimeMs;
    } catch {
      // File might not exist if annotation was parsed differently
    }

    items.push({
      source: "annotation",
      signal: ann.meta.signal,
      nodeId,
      nodeTitle,
      graphPath,
      workspaceName,
      annotationFilename: ann.filename,
      preview,
      created: ann.meta.created || undefined,
      modified,
      target: ann.meta.target,
      status: ann.meta.status,
    });
  }

  return items;
}

/**
 * Recursively collect action items from a graph and all nested sub-graphs.
 *
 * Walks the graph tree depth-first: for each node, collects tension/proposal
 * annotations and proposed-status signals, then recurses into any sub-graph
 * the node contains.
 *
 * @param graphDir  - Physical directory containing graph.json
 * @param graphPath - Logical path prefix for action items (e.g., "_root", "qinolabs-repo/implementations/...")
 * @param workspaceName - Display name of the parent workspace
 * @param maxDepth  - Recursion guard to avoid runaway walks
 */
async function collectDeepActionItems(
  graphDir: string,
  graphPath: string,
  workspaceName: string | undefined,
  maxDepth: number = 8,
): Promise<ActionItem[]> {
  if (maxDepth <= 0) return [];

  const graphData = await readJsonFile<GraphData>(
    path.join(graphDir, "graph.json"),
  );
  if (!graphData) return [];

  const nodesDir = graphData.nodesDir ?? "nodes";
  const nodes = await discoverNodes(graphDir, nodesDir);
  const items: ActionItem[] = [];

  for (const node of nodes) {
    // Skip arcs entirely; navigators skip own annotations but recurse into sub-graphs
    if (node.type === "arc") continue;

    const nodeDir = path.join(graphDir, nodesDir, node.dir);

    if (node.type !== "navigator") {
      // Annotation action items
      const annItems = await collectActionItems(
        path.join(nodeDir, "annotations"),
        node.id,
        node.title,
        graphPath,
        workspaceName,
      );
      items.push(...annItems);

      // Proposed-status nodes
      if (node.status === "proposed") {
        items.push({
          source: "status",
          signal: "proposed",
          nodeId: node.id,
          nodeTitle: node.title,
          graphPath,
          workspaceName,
          preview: `Proposed ${node.type ?? "node"}`,
          created: node.created,
        });
      }
    }

    // Recurse into sub-graphs (including navigators — their children may have action items)
    const hasSubGraph = await fileExists(path.join(nodeDir, "graph.json"));
    if (hasSubGraph) {
      const subGraphPath = `${graphPath}/${nodesDir}/${node.dir}`;
      const subItems = await collectDeepActionItems(
        nodeDir,
        subGraphPath,
        workspaceName,
        maxDepth - 1,
      );
      items.push(...subItems);
    }
  }

  return items;
}

/**
 * Collect annotations for a given date across all signal types.
 *
 * Same shape as collectActionItems but:
 * - No signal filter — accepts all AgentSignal types
 * - Date filter: only annotations whose `created` starts with `datePrefix`
 * - Still excludes resolved/dismissed
 */
async function collectAnnotationsForDate(
  annotationsDir: string,
  nodeId: string,
  nodeTitle: string,
  datePrefix: string,
  graphPath?: string,
  workspaceName?: string,
  nodeType?: string,
): Promise<ActionItem[]> {
  const annotations = await readAnnotationsFromDir(annotationsDir);
  const items: ActionItem[] = [];

  for (const ann of annotations) {
    // Date filter — only annotations created on the target date
    if (!ann.meta.created || !ann.meta.created.startsWith(datePrefix)) continue;

    // Skip resolved/dismissed annotations
    const annStatus = ann.meta.status ?? "open";
    if (annStatus === "resolved" || annStatus === "dismissed") continue;

    // Extract first non-empty line as preview, truncated to 120 chars
    const preview =
      ann.content
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.length > 0)
        ?.slice(0, 120) ?? "";

    // Get file mtime for precise timestamp display
    let modified: number | undefined;
    try {
      const stat = await fs.stat(path.join(annotationsDir, ann.filename));
      modified = stat.mtimeMs;
    } catch {
      // File might not exist if annotation was parsed differently
    }

    items.push({
      source: "annotation",
      signal: ann.meta.signal,
      nodeId,
      nodeTitle,
      nodeType,
      graphPath,
      workspaceName,
      annotationFilename: ann.filename,
      preview,
      content: ann.content,
      created: ann.meta.created || undefined,
      modified,
      target: ann.meta.target,
      status: ann.meta.status,
    });
  }

  return items;
}

/**
 * Recursively collect today's annotations from a graph and all nested sub-graphs.
 *
 * Similar traversal to collectDeepActionItems but:
 * - Calls collectAnnotationsForDate instead of collectActionItems
 * - Includes navigator annotations (navigators have readings/connections worth surfacing)
 * - Skips proposed-status nodes (those aren't date-scoped annotations)
 */
async function collectDeepAnnotationsForDate(
  graphDir: string,
  graphPath: string,
  workspaceName: string | undefined,
  datePrefix: string,
  maxDepth: number = 8,
): Promise<ActionItem[]> {
  if (maxDepth <= 0) return [];

  const graphData = await readJsonFile<GraphData>(
    path.join(graphDir, "graph.json"),
  );
  if (!graphData) return [];

  const nodesDir = graphData.nodesDir ?? "nodes";
  const nodes = await discoverNodes(graphDir, nodesDir);
  const items: ActionItem[] = [];

  for (const node of nodes) {
    if (node.type === "arc") continue;

    const nodeDir = path.join(graphDir, nodesDir, node.dir);

    // Collect annotations from all node types (including navigators —
    // unlike action items, today's notes should surface readings/connections
    // from navigators too)
    const annItems = await collectAnnotationsForDate(
      path.join(nodeDir, "annotations"),
      node.id,
      node.title,
      datePrefix,
      graphPath,
      workspaceName,
      node.type,
    );
    items.push(...annItems);

    // Recurse into sub-graphs
    const hasSubGraph = await fileExists(path.join(nodeDir, "graph.json"));
    if (hasSubGraph) {
      const subGraphPath = `${graphPath}/${nodesDir}/${node.dir}`;
      const subItems = await collectDeepAnnotationsForDate(
        nodeDir,
        subGraphPath,
        workspaceName,
        datePrefix,
        maxDepth - 1,
      );
      items.push(...subItems);
    }
  }

  return items;
}

/**
 * Read content files by discovery — lists the content/ directory and reads
 * each file found there. This is what makes the protocol universal.
 */
async function readContentFiles(contentDir: string): Promise<ContentFile[]> {
  const files = await listDir(contentDir);
  const contentFiles: ContentFile[] = [];

  for (const filename of files.sort()) {
    const content = await readTextFile(path.join(contentDir, filename));
    if (content !== null) {
      contentFiles.push({ filename, content });
    }
  }

  return contentFiles;
}

/**
 * Resolve the directory name where node directories live.
 * Defaults to "nodes" when graph.json doesn't specify nodesDir.
 */
function resolveNodesDir(graphData: GraphData): string {
  return graphData.nodesDir ?? "nodes";
}

/**
 * Discover nodes from the filesystem by scanning {graphDir}/{nodesDir}/
 * for subdirectories containing a valid node.json.
 *
 * This replaces the graph.json `nodes` array as the authoritative node source.
 * Directory name = node ID (invariant across all existing data).
 */
async function discoverNodes(
  graphDir: string,
  nodesDir: string,
): Promise<GraphNodeEntry[]> {
  const nodesDirPath = path.join(graphDir, nodesDir);
  let entries: string[];
  try {
    entries = await fs.readdir(nodesDirPath);
  } catch {
    return [];
  }

  const nodes: GraphNodeEntry[] = [];

  for (const entry of entries) {
    const nodeJsonPath = path.join(nodesDirPath, entry, "node.json");
    const identity = await readJsonFile<NodeIdentity>(nodeJsonPath);
    if (!identity) continue;

    nodes.push({
      id: entry,
      dir: entry,
      title: identity.title,
      ...(identity.type ? { type: identity.type as string } : {}),
      ...(identity.status ? { status: identity.status as string } : {}),
      ...(identity.created ? { created: identity.created as string } : {}),
    });
  }

  return nodes.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Resolve a node ID to its absolute directory path.
 *
 * Checks that {nodesDir}/{nodeId}/node.json exists on disk.
 * Returns the absolute node directory path, or null if the node doesn't exist.
 */
async function resolveNodeDir(
  graphDir: string,
  nodesDir: string,
  nodeId: string,
): Promise<string | null> {
  const nodeDir = path.join(graphDir, nodesDir, nodeId);
  const identity = await readJsonFile<NodeIdentity>(
    path.join(nodeDir, "node.json"),
  );
  return identity ? nodeDir : null;
}

// ---------------------------------------------------------------------------
// Read Operations
// ---------------------------------------------------------------------------

/**
 * Read workspace config from .claude/qino-config.json.
 */
export async function readConfig(
  workspaceDir: string,
): Promise<WorkspaceConfig> {
  const config = await readJsonFile<WorkspaceConfig>(
    path.join(workspaceDir, ".claude", "qino-config.json"),
  );
  return config ?? {};
}

/**
 * Read a graph.json, its journal, and per-node agent signals.
 *
 * Works at any level — root workspace or inside a node's sub-graph.
 * The `graphDir` is the directory containing graph.json.
 */
export async function readGraph(
  graphDir: string,
): Promise<GraphWithJournal | null> {
  const graphData = await readJsonFile<GraphData>(
    path.join(graphDir, "graph.json"),
  );

  if (!graphData) {
    return null;
  }

  const journal = await readTextFile(path.join(graphDir, "journal.md"));

  const journalSections = journal ? parseJournalSections(journal) : [];

  const nodesDir = resolveNodesDir(graphData);
  const agentSignals: Record<string, AgentSignal[]> = {};
  const actionItems: ActionItem[] = [];
  const discoveredNodes = await discoverNodes(graphDir, nodesDir);

  for (const node of discoveredNodes) {
    const nodeDir = path.join(graphDir, nodesDir, node.dir);

    // Enrich with file mtime
    const mtime = await getNodeMtime(nodeDir);
    if (mtime) {
      node.modified = mtime;
    }

    const annotationsDir = path.join(nodeDir, "annotations");
    const annotations = await readAnnotationsFromDir(annotationsDir);
    if (annotations.length > 0) {
      const signals = [...new Set(annotations.map((a) => a.meta.signal))];
      agentSignals[node.id] = signals;
    }

    // Collect action items (proposals, tensions) from this node
    const nodeActionItems = await collectActionItems(
      annotationsDir,
      node.id,
      node.title,
    );
    actionItems.push(...nodeActionItems);

    // Check for nested sub-graph
    try {
      await fs.access(path.join(nodeDir, "graph.json"));
      node.hasSubGraph = true;
    } catch {
      // No sub-graph — leave undefined
    }

    // Check for view.json
    try {
      await fs.access(path.join(nodeDir, "view.json"));
      node.hasView = true;
    } catch {
      // No view — leave undefined
    }

    // Check for node-level journal
    try {
      await fs.access(path.join(nodeDir, "journal.md"));
      node.hasJournal = true;
    } catch {
      // No journal — leave undefined
    }
  }

  // Sort action items by created date (most recent first)
  actionItems.sort((a, b) => {
    const dateA = a.created ?? "";
    const dateB = b.created ?? "";
    return dateB.localeCompare(dateA);
  });

  return {
    ...graphData,
    nodes: discoveredNodes,
    journal,
    journalSections,
    agentSignals,
    actionItems,
  };
}

/**
 * Read full detail for a single node.
 *
 * Resolves the node's directory from the graph, then reads:
 * node.json, story.md, content/* (by discovery), annotations/*.
 *
 * @param graphDir - Absolute path to the graph directory
 * @param nodeId - ID of the node to read
 * @param subPath - Relative path from workspace root to graph (the `at` query param).
 *                  Used to compute parent navigation context.
 */
export async function readNode(
  graphDir: string,
  nodeId: string,
  subPath?: string,
): Promise<NodeDetail | null> {
  const graphData = await readJsonFile<GraphData>(
    path.join(graphDir, "graph.json"),
  );

  if (!graphData) {
    return null;
  }

  const nodesDir = resolveNodesDir(graphData);
  const nodeDir = await resolveNodeDir(graphDir, nodesDir, nodeId);
  if (!nodeDir) {
    return null;
  }

  const [identity, story, view, journalRaw] = await Promise.all([
    readJsonFile<NodeIdentity>(path.join(nodeDir, "node.json")),
    readTextFile(path.join(nodeDir, "story.md")),
    readJsonFile<ViewData>(path.join(nodeDir, "view.json")),
    readTextFile(path.join(nodeDir, "journal.md")),
  ]);

  const journalSections = journalRaw
    ? parseJournalSections(journalRaw)
    : [];

  const [contentFiles, modified] = await Promise.all([
    readContentFiles(path.join(nodeDir, "content")),
    getNodeMtime(nodeDir),
  ]);

  const annotations = await readAnnotationsFromDir(
    path.join(nodeDir, "annotations"),
  );

  // Check if this node has its own sub-graph
  const subGraph = await readJsonFile<GraphData>(
    path.join(nodeDir, "graph.json"),
  );
  const hasSubGraph = subGraph !== null;

  // Compute relative path to sub-graph (e.g., "nodes/sound-lab" or "explorations/nodes/paths-overview")
  const subGraphPath = hasSubGraph ? `${nodesDir}/${nodeId}` : undefined;
  const subGraphTitle = subGraph?.title;

  // Detect parent node context and build breadcrumb
  // Sub-graphs follow the pattern: parentGraph/{nodesDir}/{nodeDir}/graph.json
  // We check two levels up for a parent graph
  let parentNodeId: string | undefined;
  let parentNodeTitle: string | undefined;
  let parentAt: string | undefined;

  const parentGraphDir = path.dirname(path.dirname(graphDir));
  const parentGraph = await readJsonFile<GraphData>(
    path.join(parentGraphDir, "graph.json"),
  );
  if (parentGraph) {
    // Find which node in the parent graph owns this sub-graph
    const currentSubGraphDir = path.basename(graphDir);
    const parentNodesDir = resolveNodesDir(parentGraph);
    const parentNodeDir = await resolveNodeDir(parentGraphDir, parentNodesDir, currentSubGraphDir);
    if (parentNodeDir) {
      const parentIdentity = await readJsonFile<NodeIdentity>(path.join(parentNodeDir, "node.json"));
      parentNodeId = currentSubGraphDir;
      parentNodeTitle = parentIdentity?.title ?? currentSubGraphDir;

      // Compute parentAt from subPath by removing the workspace prefix and last 2 segments
      // The subPath includes workspace as first segment: "workspace/nodesDir/nodeDir"
      // e.g., "qino-concepts/concepts/qino-lab/explorations" → "concepts/qino-lab"
      // e.g., "qino-concepts/concepts/qino-lab" → undefined (parent at workspace root)
      if (subPath) {
        const segments = subPath.split("/");
        // segments[0] = workspace, segments[1..n-2] = parent path, segments[n-2..n-1] = nodesDir/nodeDir
        // Minimum for sub-graph: workspace + nodesDir + nodeDir = 3 segments
        if (segments.length > 3) {
          // Skip workspace (first), remove nodesDir/nodeDir (last 2)
          parentAt = segments.slice(1, -2).join("/");
        }
        // If 3 or fewer segments, parent is at workspace root (parentAt stays undefined)
      }
    }
  }

  // Build breadcrumb trail from workspace root to parent node
  // Walk up to find workspace root graph title
  let workspaceTitle = graphData.title; // fallback to current graph title
  let currentDir = graphDir;
  while (true) {
    const upTwo = path.dirname(path.dirname(currentDir));
    const upGraph = await readJsonFile<GraphData>(path.join(upTwo, "graph.json"));
    if (!upGraph) {
      // currentDir is the workspace root
      const rootGraph = await readJsonFile<GraphData>(path.join(currentDir, "graph.json"));
      if (rootGraph) workspaceTitle = rootGraph.title;
      break;
    }
    currentDir = upTwo;
  }

  // Construct breadcrumb array
  const breadcrumb: BreadcrumbItem[] = [
    { id: null, title: workspaceTitle, at: undefined },
  ];

  // Add parent node if we're in a sub-graph
  if (parentNodeId && parentNodeTitle) {
    breadcrumb.push({
      id: parentNodeId,
      title: parentNodeTitle,
      at: parentAt,
    });
  }

  return {
    id: nodeId,
    identity,
    story,
    contentFiles,
    annotations,
    hasSubGraph,
    subGraphPath,
    subGraphTitle,
    graphTitle: graphData.title,
    breadcrumb,
    parentNodeId,
    parentNodeTitle,
    parentAt,
    view,
    journalSections,
    modified: modified || undefined,
  };
}

/**
 * Read annotations for a specific node.
 */
export async function readAnnotations(
  graphDir: string,
  nodeId: string,
): Promise<Annotation[]> {
  const graphData = await readJsonFile<GraphData>(
    path.join(graphDir, "graph.json"),
  );

  if (!graphData) {
    return [];
  }

  const nodesDir = resolveNodesDir(graphData);
  const nodeDir = await resolveNodeDir(graphDir, nodesDir, nodeId);
  if (!nodeDir) {
    return [];
  }

  return readAnnotationsFromDir(path.join(nodeDir, "annotations"));
}

// ---------------------------------------------------------------------------
// File Modification Helpers
// ---------------------------------------------------------------------------

/**
 * Get the latest modification time (epoch ms) from a node's key files.
 *
 * Checks story.md and node.json — the two files that represent meaningful
 * edits to a node's content or identity.
 */
async function getNodeMtime(nodeDir: string): Promise<number> {
  let latest = 0;
  for (const filename of ["story.md", "node.json", "graph.json", "journal.md"]) {
    try {
      const stat = await fs.stat(path.join(nodeDir, filename));
      if (stat.mtimeMs > latest) latest = stat.mtimeMs;
    } catch {
      // File may not exist
    }
  }
  return latest;
}

// ---------------------------------------------------------------------------
// Sub-Graph Discovery
// ---------------------------------------------------------------------------

/**
 * Recursively discover graph.json files within a directory.
 *
 * Finds sub-graphs (like explorations, studies) nested within workspaces.
 * Excludes node_modules, .git, and other common non-content directories.
 *
 * @param baseDir - The directory to search within
 * @param relativeTo - The workspace root (for computing relative paths)
 * @param maxDepth - Maximum recursion depth (default 4)
 */
async function discoverSubGraphs(
  baseDir: string,
  relativeTo: string,
  maxDepth: number = 4,
): Promise<SubGraphEntry[]> {
  const subGraphs: SubGraphEntry[] = [];
  const excludeDirs = new Set([
    "node_modules",
    ".git",
    ".venv",
    "dist",
    "build",
    ".next",
    ".turbo",
  ]);

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;

    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return; // Directory doesn't exist or isn't readable
    }

    // Check if this directory has a graph.json
    if (entries.includes("graph.json")) {
      const graphPath = path.join(dir, "graph.json");
      const graph = await readJsonFile<GraphData>(graphPath);

      if (graph) {
        // Skip the workspace's own root graph (already handled by workspace discovery)
        if (dir !== baseDir) {
          const relPath = path.relative(relativeTo, dir);
          // Calculate most recent modification time across all nodes
          const nodesDir = graph.nodesDir ?? "nodes";
          const discovered = await discoverNodes(dir, nodesDir);
          let latestMtime = 0;
          for (const node of discovered) {
            const nodeDir = path.join(dir, nodesDir, node.dir);
            const mtime = await getNodeMtime(nodeDir);
            if (mtime > latestMtime) latestMtime = mtime;
          }

          subGraphs.push({
            id: graph.id,
            title: graph.title,
            path: relPath,
            nodeCount: discovered.length,
            modified: latestMtime || undefined,
          });
        }
      }
    }

    // Recurse into subdirectories
    for (const entry of entries) {
      if (excludeDirs.has(entry)) continue;

      const fullPath = path.join(dir, entry);
      try {
        const stat = await fs.stat(fullPath);
        if (stat.isDirectory()) {
          await walk(fullPath, depth + 1);
        }
      } catch {
        // Skip entries we can't stat
      }
    }
  }

  await walk(baseDir, 0);
  return subGraphs;
}

// ---------------------------------------------------------------------------
// Multi-Workspace Discovery
// ---------------------------------------------------------------------------

/**
 * Discover child workspaces from the root config's `workspaces` map.
 *
 * Reads each child's config + graph to gather metadata (name, repoType, nodeCount).
 * Missing children are silently skipped — partial workspace setups are fine.
 * The root workspace is included first with a summed node count across all children.
 */
export async function readWorkspaces(
  workspaceDir: string,
): Promise<WorkspaceEntry[]> {
  const config = await readConfig(workspaceDir);
  const workspacesMap = config.workspaces;
  if (!workspacesMap) return [];

  const entries: WorkspaceEntry[] = [];
  let totalNodeCount = 0;

  for (const [name, ws] of Object.entries(workspacesMap)) {
    const wsDir = path.join(workspaceDir, ws.path);
    const childConfig = await readConfig(wsDir);
    const childGraph = await readJsonFile<GraphData>(
      path.join(wsDir, "graph.json"),
    );
    const childNodesDir = childGraph?.nodesDir ?? "nodes";
    const childNodes = childGraph ? await discoverNodes(wsDir, childNodesDir) : [];
    const nodeCount = childGraph ? childNodes.length : undefined;
    if (nodeCount != null) {
      totalNodeCount += nodeCount;
    }
    entries.push({
      name: childConfig.name ?? name,
      path: ws.path,
      repoType: childConfig.repoType,
      nodeCount,
    });
  }

  // Add root workspace entry with summed node count (at the beginning)
  if (config.name) {
    entries.unshift({
      name: config.name,
      path: "",
      repoType: config.repoType,
      nodeCount: totalNodeCount,
    });
  }

  return entries;
}

/**
 * Compose landing page data from root graph + child workspace discovery.
 *
 * Extracts arcs and navigators by type from the root graph, gathers recent
 * nodes across all workspaces (root + children), discovers child workspaces,
 * and recursively discovers sub-graphs within workspaces.
 */
export async function readLandingData(
  workspaceDir: string,
): Promise<LandingData> {
  const workspaces = await readWorkspaces(workspaceDir);
  const rootGraph = await readJsonFile<GraphData>(
    path.join(workspaceDir, "graph.json"),
  );

  const rootNodesDir = rootGraph?.nodesDir ?? "nodes";
  const rootNodes = rootGraph
    ? await discoverNodes(workspaceDir, rootNodesDir)
    : [];
  const arcs = rootNodes.filter((n) => n.type === "arc");
  const navigators: NavigatorEntry[] = rootNodes
    .filter((n) => n.type === "navigator")
    .map((n) => ({ ...n, graphPath: "_root" }));

  // Collect views from all workspaces (nodes with hasView: true or type: "view")
  const views: ViewEntry[] = [];

  // Gather recent nodes from root graph (non-structural), with file mtime
  const recentNodes: RecentNode[] = [];
  for (const n of rootNodes) {
    if (n.type === "arc" || n.type === "navigator") continue;
    const nodeDir = path.join(workspaceDir, rootNodesDir, n.dir);
    const modified = await getNodeMtime(nodeDir);
    recentNodes.push({ ...n, graphPath: "_root", modified });
  }

  // Track node directories so sub-graph discovery can skip duplicates
  const knownNodePaths = new Set<string>();

  // Gather recent nodes from child workspace graphs, with file mtime
  for (const ws of workspaces) {
    // Skip root workspace (it's just an aggregate container)
    if (!ws.path) continue;

    const wsDir = path.join(workspaceDir, ws.path);
    const wsGraph = await readJsonFile<GraphData>(
      path.join(wsDir, "graph.json"),
    );
    if (!wsGraph) continue;

    const wsNodesDir = wsGraph.nodesDir ?? "nodes";
    const wsNodes = await discoverNodes(wsDir, wsNodesDir);

    // Enrich workspace nodes with view/journal/subgraph detection
    for (const node of wsNodes) {
      const wsNodeDir = path.join(wsDir, wsNodesDir, node.dir);
      try {
        await fs.access(path.join(wsNodeDir, "view.json"));
        node.hasView = true;
      } catch {
        // No view
      }
    }

    for (const node of wsNodes) {
      // Record full relative path for sub-graph deduplication
      knownNodePaths.add(path.join(ws.path, wsNodesDir, node.dir));

      // Collect views for dedicated views section
      if (node.hasView || node.type === "view") {
        views.push({
          ...node,
          graphPath: ws.path,
          workspaceName: ws.name,
        });
        continue;
      }
      if (node.type === "navigator") {
        navigators.push({ ...node, graphPath: ws.path });
        continue;
      }
      if (node.type === "arc") continue;
      const nodeDir = path.join(wsDir, wsNodesDir, node.dir);
      const modified = await getNodeMtime(nodeDir);
      recentNodes.push({
        ...node,
        graphPath: ws.path,
        modified,
        workspacePath: ws.path,
        workspaceName: ws.name,
        appName: node.dir, // Node directory is the app/project name
      });
    }
  }

  // Discover sub-graphs within each workspace and add as pseudo-nodes
  for (const ws of workspaces) {
    // Skip root workspace — subgraphs belong to their actual parent workspace
    if (!ws.path) continue;

    const wsDir = path.join(workspaceDir, ws.path);
    const wsSubGraphs = await discoverSubGraphs(wsDir, workspaceDir);

    // Convert sub-graphs to RecentNode entries AND include their nodes
    for (const sg of wsSubGraphs) {
      // Skip sub-graphs that are already represented as nodes in their workspace graph
      // (e.g., concept nodes with facets — already added above as regular nodes)
      if (knownNodePaths.has(sg.path)) continue;

      // Extract app name from path (e.g., "sound-lab" from "qinolabs-repo/implementations/sound-lab/explorations")
      const pathSegments = sg.path.split(path.sep);
      const implIndex = pathSegments.indexOf("implementations");
      const appName =
        implIndex !== -1 && pathSegments[implIndex + 1]
          ? pathSegments[implIndex + 1]
          : undefined;

      recentNodes.push({
        id: sg.id,
        dir: sg.path, // Use path as dir for navigation
        title: sg.title,
        type: "subgraph",
        hasSubGraph: true,
        graphPath: sg.path, // The path IS the graph location
        modified: sg.modified,
        nodeCount: sg.nodeCount,
        // Store parent workspace info for subtitle rendering
        workspacePath: ws.path,
        workspaceName: ws.name,
        appName,
      });

      // Also include nodes from within the sub-graph for search
      const sgDir = path.join(workspaceDir, sg.path);
      const sgGraph = await readJsonFile<GraphData>(
        path.join(sgDir, "graph.json"),
      );
      if (sgGraph) {
        const sgNodesDir = sgGraph.nodesDir ?? "nodes";
        const sgNodes = await discoverNodes(sgDir, sgNodesDir);
        for (const node of sgNodes) {
          if (node.type === "arc" || node.type === "navigator") continue;
          const nodeDir = path.join(sgDir, sgNodesDir, node.dir);
          const modified = await getNodeMtime(nodeDir);
          recentNodes.push({
            ...node,
            graphPath: sg.path, // The sub-graph path for navigation
            modified,
            workspacePath: ws.path,
            workspaceName: ws.name,
            appName,
          });
        }
      }
    }
  }

  // Sort by file modification time (most recently modified first)
  recentNodes.sort((a, b) => (b.modified ?? 0) - (a.modified ?? 0));

  // Deep action item collection — recursively walks all graphs and sub-graphs
  const actionItems: ActionItem[] = [];

  // Root graph and its sub-graphs (e.g., emergence-experiments sessions)
  const rootWs = workspaces.find((ws) => !ws.path);
  const rootItems = await collectDeepActionItems(workspaceDir, "_root", rootWs?.name);
  actionItems.push(...rootItems);

  // Each child workspace and its full tree
  for (const ws of workspaces) {
    if (!ws.path) continue;
    const wsDir = path.join(workspaceDir, ws.path);
    const wsItems = await collectDeepActionItems(wsDir, ws.path, ws.name);
    actionItems.push(...wsItems);
  }

  // Sort action items by modification time (most recent first), falling back to created date
  actionItems.sort((a, b) => {
    if (a.modified != null && b.modified != null) return b.modified - a.modified;
    if (a.modified != null) return -1;
    if (b.modified != null) return 1;
    return (b.created ?? "").localeCompare(a.created ?? "");
  });

  // Today's annotations — all signal types, scoped to current date
  const todayPrefix = new Date().toISOString().slice(0, 10);
  const todayAnnotations: ActionItem[] = [];

  const rootTodayItems = await collectDeepAnnotationsForDate(
    workspaceDir, "_root", rootWs?.name, todayPrefix,
  );
  todayAnnotations.push(...rootTodayItems);

  for (const ws of workspaces) {
    if (!ws.path) continue;
    const wsDir = path.join(workspaceDir, ws.path);
    const wsItems = await collectDeepAnnotationsForDate(
      wsDir, ws.path, ws.name, todayPrefix,
    );
    todayAnnotations.push(...wsItems);
  }

  todayAnnotations.sort((a, b) => {
    if (a.modified != null && b.modified != null) return b.modified - a.modified;
    if (a.modified != null) return -1;
    if (b.modified != null) return 1;
    return (b.created ?? "").localeCompare(a.created ?? "");
  });

  return {
    workspaces,
    arcs,
    navigators,
    views,
    recentNodes,
    subGraphs: [], // Keep for API compatibility, but empty
    actionItems,
    todayAnnotations,
  };
}

// ---------------------------------------------------------------------------
// Git Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the git repository root from a directory.
 * Runs `git rev-parse --show-toplevel` from the given directory.
 * Returns null if the directory is not inside a git repository.
 */
export async function resolveGitRoot(
  fromDir: string,
): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["rev-parse", "--show-toplevel"],
      { cwd: fromDir },
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Write Operations
// ---------------------------------------------------------------------------

export async function saveJournal(
  graphDir: string,
  sections: JournalSection[],
): Promise<{ success: true }> {
  const journalPath = path.join(graphDir, "journal.md");
  const content = sectionsToMarkdown(sections);
  await fs.writeFile(journalPath, content, "utf-8");
  return { success: true };
}

export async function checkpointJournal(
  graphDir: string,
  repoRoot: string,
): Promise<{ success: true; committed: boolean }> {
  const journalPath = path.join(graphDir, "journal.md");
  const relPath = path.relative(repoRoot, journalPath);

  await execFileAsync("git", ["add", relPath], { cwd: repoRoot });

  const { stdout } = await execFileAsync(
    "git",
    ["status", "--porcelain", relPath],
    { cwd: repoRoot },
  );

  if (!stdout.trim()) {
    return { success: true, committed: false };
  }

  await execFileAsync(
    "git",
    ["commit", "-m", `[checkpoint] journal`],
    { cwd: repoRoot },
  );

  return { success: true, committed: true };
}

export async function writeAnnotation(
  graphDir: string,
  nodeId: string,
  signal: AgentSignal,
  body: string,
  target?: string,
): Promise<{ success: true; filename: string }> {
  const graphData = await readJsonFile<GraphData>(
    path.join(graphDir, "graph.json"),
  );

  if (!graphData) {
    throw new Error(`No graph.json found in: ${graphDir}`);
  }

  const nodesDir = resolveNodesDir(graphData);
  const nodeDir = await resolveNodeDir(graphDir, nodesDir, nodeId);
  if (!nodeDir) {
    throw new Error(`Node not found: ${nodeId}`);
  }

  const annotationsDir = path.join(nodeDir, "annotations");

  await fs.mkdir(annotationsDir, { recursive: true });

  const existingFiles = await listDir(annotationsDir);
  const mdFiles = existingFiles.filter((f) => f.endsWith(".md")).sort();
  const nextNum = String(mdFiles.length + 1).padStart(3, "0");

  const now = new Date().toISOString();

  const slug = body
    .slice(0, 40)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  const filename = `${nextNum}-${slug}.md`;
  const targetLine = target ? `target: ${target}\n` : "";
  const normalizedBody = normalizeLlmEscapes(body);
  const content = `---
author: agent
signal: ${signal}
${targetLine}created: ${now}
---
${normalizedBody}
`;

  await fs.writeFile(path.join(annotationsDir, filename), content, "utf-8");
  return { success: true, filename };
}

/**
 * Resolve (update lifecycle status of) an annotation.
 *
 * Reads the annotation file, updates its YAML frontmatter with the new
 * status and resolvedAt timestamp, and writes the file back.
 */
export async function resolveAnnotation(
  graphDir: string,
  nodeId: string,
  filename: string,
  status: "accepted" | "resolved" | "dismissed",
): Promise<{ success: true; meta: AnnotationMeta }> {
  const graphData = await readJsonFile<GraphData>(
    path.join(graphDir, "graph.json"),
  );

  if (!graphData) {
    throw new Error(`No graph.json found in: ${graphDir}`);
  }

  const nodesDir = resolveNodesDir(graphData);
  const nodeDir = await resolveNodeDir(graphDir, nodesDir, nodeId);
  if (!nodeDir) {
    throw new Error(`Node not found: ${nodeId}`);
  }

  const annotationPath = path.join(nodeDir, "annotations", filename);
  const raw = await readTextFile(annotationPath);
  if (!raw) {
    throw new Error(`Annotation not found: ${filename}`);
  }

  const parsed = parseAnnotation(raw);
  if (!parsed) {
    throw new Error(`Failed to parse annotation: ${filename}`);
  }

  // Rebuild frontmatter with updated status
  const resolvedAt = new Date().toISOString().slice(0, 10);
  const updatedMeta: AnnotationMeta = {
    ...parsed.meta,
    status,
    resolvedAt,
  };

  // Reconstruct frontmatter lines from meta object
  const fmLines = [
    `author: ${updatedMeta.author}`,
    `signal: ${updatedMeta.signal}`,
  ];
  if (updatedMeta.target) fmLines.push(`target: ${updatedMeta.target}`);
  fmLines.push(`created: ${updatedMeta.created}`);
  fmLines.push(`status: ${updatedMeta.status}`);
  fmLines.push(`resolvedAt: ${updatedMeta.resolvedAt}`);

  const newContent = `---\n${fmLines.join("\n")}\n---\n${parsed.content}\n`;
  await fs.writeFile(annotationPath, newContent, "utf-8");

  return { success: true, meta: updatedMeta };
}

/**
 * Create a new node in a graph.
 *
 * Atomic three-step write:
 * 1. Write node.json + story.md to nodes/{dir}/
 * 2. Add node entry + edges to graph.json
 * 3. Append echo to journal.md with context marker
 */
export async function createNode(
  graphDir: string,
  opts: {
    id: string;
    dir: string;
    title: string;
    type?: string;
    status?: string;
    story: string;
    edges?: Array<{ target: string; type?: string; context?: string }>;
    view?: { focal: string; includes: string[] };
  },
): Promise<{ success: true; nodeId: string; applied: { status: string } }> {
  const graphPath = path.join(graphDir, "graph.json");
  const graphData = await readJsonFile<GraphData>(graphPath);

  if (!graphData) {
    throw new Error(`No graph.json found in: ${graphDir}`);
  }

  // Check for duplicate via filesystem
  const nodesDir = resolveNodesDir(graphData);
  const existingNodeDir = await resolveNodeDir(graphDir, nodesDir, opts.id);
  if (existingNodeDir) {
    throw new Error(`Node already exists: ${opts.id}`);
  }

  // 1. Write node directory
  const nodeDir = path.join(graphDir, nodesDir, opts.dir);
  await fs.mkdir(nodeDir, { recursive: true });

  const resolvedStatus = opts.status ?? "active";
  const identity: NodeIdentity = {
    title: opts.title,
    ...(opts.type ? { type: opts.type } : {}),
    status: resolvedStatus,
    created: new Date().toISOString().slice(0, 10),
  };
  await fs.writeFile(
    path.join(nodeDir, "node.json"),
    JSON.stringify(identity, null, 2),
    "utf-8",
  );
  await fs.writeFile(
    path.join(nodeDir, "story.md"),
    normalizeLlmEscapes(opts.story),
    "utf-8",
  );

  if (opts.view) {
    await fs.writeFile(
      path.join(nodeDir, "view.json"),
      JSON.stringify(opts.view, null, 2),
      "utf-8",
    );
  }

  // 2. Update graph.json (edges only — nodes are discovered from filesystem)
  let graphChanged = false;

  if (opts.edges) {
    for (const edge of opts.edges) {
      const graphEdge: GraphEdge = {
        source: opts.id,
        target: edge.target,
        ...(edge.type ? { type: edge.type } : {}),
        ...(edge.context ? { context: edge.context } : {}),
      };
      graphData.edges.push(graphEdge);
    }
    graphChanged = true;
  }

  if (opts.view) {
    for (const includeId of opts.view.includes) {
      const curatesEdge: GraphEdge = {
        source: opts.id,
        target: includeId,
        type: "curates",
        ...(includeId === opts.view.focal ? { context: "focal" } : {}),
      };
      graphData.edges.push(curatesEdge);
    }
    graphChanged = true;
  }

  if (graphChanged) {
    await fs.writeFile(graphPath, JSON.stringify(graphData, null, 2), "utf-8");
  }

  // 3. Append echo to journal
  const journalPath = path.join(graphDir, "journal.md");
  const now = new Date().toISOString().slice(0, 10);
  const echo = `\n\n## created: ${opts.title}\n\n<!-- context: node/${opts.id} -->\n\ncreated: ${opts.title}\n→ [${opts.id}](${nodesDir}/${opts.dir}/)\n`;

  try {
    await fs.appendFile(journalPath, echo, "utf-8");
  } catch {
    // Journal may not exist yet — create it
    await fs.writeFile(
      journalPath,
      `## ${now}\n\n<!-- context: session/${now} -->\n${echo}`,
      "utf-8",
    );
  }

  return { success: true, nodeId: opts.id, applied: { status: resolvedStatus } };
}

/**
 * Append a journal entry to a workspace or node-level journal.
 *
 * Creates journal.md if it doesn't exist.
 */
export async function writeJournalEntry(
  graphDir: string,
  opts: {
    context: string;
    body: string;
    nodeId?: string;
  },
): Promise<{ success: true }> {
  let journalDir = graphDir;

  // If nodeId is provided, write to node-level journal
  if (opts.nodeId) {
    const graphData = await readJsonFile<GraphData>(
      path.join(graphDir, "graph.json"),
    );
    if (!graphData) {
      throw new Error(`No graph.json found in: ${graphDir}`);
    }
    const nodesDir = resolveNodesDir(graphData);
    const nodeDir = await resolveNodeDir(graphDir, nodesDir, opts.nodeId);
    if (!nodeDir) {
      throw new Error(`Node not found: ${opts.nodeId}`);
    }
    journalDir = nodeDir;
  }

  const journalPath = path.join(journalDir, "journal.md");
  const normalizedBody = normalizeLlmEscapes(opts.body.trim());
  const entry = `\n\n<!-- context: ${opts.context} -->\n\n${normalizedBody}\n`;

  try {
    await fs.appendFile(journalPath, entry, "utf-8");
  } catch {
    // Journal doesn't exist — create with this entry
    await fs.writeFile(journalPath, entry.trimStart(), "utf-8");
  }

  return { success: true };
}

/**
 * Update a view's focal and includes, syncing curates edges in graph.json.
 *
 * Atomic two-step write:
 * 1. Write updated view.json
 * 2. Remove old curates edges from graph.json, add new ones
 */
export async function updateView(
  graphDir: string,
  nodeId: string,
  opts: { focal: string; includes: string[] },
): Promise<{ success: true }> {
  const graphPath = path.join(graphDir, "graph.json");
  const graphData = await readJsonFile<GraphData>(graphPath);

  if (!graphData) {
    throw new Error(`No graph.json found in: ${graphDir}`);
  }

  const nodesDir = resolveNodesDir(graphData);
  const nodeDir = await resolveNodeDir(graphDir, nodesDir, nodeId);
  if (!nodeDir) {
    throw new Error(`Node not found: ${nodeId}`);
  }
  const viewPath = path.join(nodeDir, "view.json");

  // Verify this is actually a view node
  const existingView = await readJsonFile<ViewData>(viewPath);
  if (!existingView) {
    throw new Error(`Node ${nodeId} is not a view (no view.json)`);
  }

  // 1. Write updated view.json
  const viewData: ViewData = {
    focal: opts.focal,
    includes: opts.includes,
  };
  await fs.writeFile(viewPath, JSON.stringify(viewData, null, 2), "utf-8");

  // 2. Sync curates edges in graph.json
  // Remove old curates edges from this view node
  graphData.edges = graphData.edges.filter(
    (e) => !(e.source === nodeId && e.type === "curates"),
  );

  // Add new curates edges
  for (const includeId of opts.includes) {
    const curatesEdge: GraphEdge = {
      source: nodeId,
      target: includeId,
      type: "curates",
      ...(includeId === opts.focal ? { context: "focal" } : {}),
    };
    graphData.edges.push(curatesEdge);
  }

  await fs.writeFile(graphPath, JSON.stringify(graphData, null, 2), "utf-8");

  return { success: true };
}
