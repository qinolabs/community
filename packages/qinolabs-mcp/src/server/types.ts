// ---------------------------------------------------------------------------
// Graph & Node Types (protocol-level)
// ---------------------------------------------------------------------------

/** Edge in a graph — connects two nodes with optional type and context. */
export interface GraphEdge {
  source: string;
  target: string;
  type?: string;
  context?: string;
}

/**
 * Node entry as declared in graph.json.
 * This is the index-level view — enough to render the graph without reading
 * each node directory. node.json is authoritative if values drift.
 */
export interface GraphNodeEntry {
  id: string;
  dir: string;
  title: string;
  type?: string;
  status?: string;
  position?: NodePosition;
  hasSubGraph?: boolean;
  hasView?: boolean;
  hasJournal?: boolean;
  created?: string;
  /** Epoch ms — latest file modification time in the node directory. */
  modified?: number;
}

/** View data — a curated subset of the graph as a shared attention space. */
export interface ViewData {
  focal: string;
  includes: string[];
}

/** The full graph.json shape. */
export interface GraphData {
  id: string;
  title: string;
  /** Override the default node directory name ("nodes"). Each graph level can set its own. */
  nodesDir?: string;
  nodes?: GraphNodeEntry[];
  edges: GraphEdge[];
}

/** graph.json enriched with journal and per-node agent signals. */
export interface GraphWithJournal extends GraphData {
  /** Always populated from filesystem discovery (overrides optional GraphData.nodes). */
  nodes: GraphNodeEntry[];
  journal: string | null;
  journalSections: JournalSection[];
  agentSignals: Record<string, AgentSignal[]>;
  /** Action items (proposals, tensions) from nodes in this graph. */
  actionItems: ActionItem[];
}

// ---------------------------------------------------------------------------
// Node Detail (reading a single node)
// ---------------------------------------------------------------------------

/** node.json — authoritative identity for a node. Open schema beyond required fields. */
export interface NodeIdentity {
  title: string;
  type?: string;
  status?: string;
  created?: string;
  /** Any additional workspace-level fields. */
  [key: string]: unknown;
}

/** A content file discovered in a node's content/ directory. */
export interface ContentFile {
  filename: string;
  content: string;
}

/**
 * A single item in the navigation breadcrumb trail.
 * Represents an ancestor of the current node (workspace or parent nodes).
 */
export interface BreadcrumbItem {
  /** Node ID, or null for workspace root */
  id: string | null;
  /** Display title */
  title: string;
  /** The `at` param to navigate to this item (undefined = workspace root) */
  at?: string;
}

/** Full detail for a single node — everything the UI needs to render. */
export interface NodeDetail {
  id: string;
  identity: NodeIdentity | null;
  story: string | null;
  contentFiles: ContentFile[];
  annotations: Annotation[];
  hasSubGraph: boolean;
  /**
   * Path to the node's sub-graph relative to the current graph directory.
   * Only present when hasSubGraph is true.
   * Example: "explorations/nodes/paths-overview"
   */
  subGraphPath?: string;
  /**
   * Title of the node's sub-graph (from its graph.json).
   * Only present when hasSubGraph is true.
   */
  subGraphTitle?: string;
  /**
   * Title of the graph this node belongs to.
   * Provides context for navigation (e.g., "Implementations", "Concepts").
   */
  graphTitle: string;
  /**
   * Full breadcrumb trail from workspace root to parent node.
   * Does NOT include the current node (that's what we're viewing).
   *
   * Example for node at `?at=concepts/qino-lab`:
   *   [{ id: null, title: "Concepts", at: undefined }]
   *
   * Example for deeply nested node:
   *   [
   *     { id: null, title: "Concepts", at: undefined },
   *     { id: "qino-lab", title: "qino-lab", at: undefined },
   *   ]
   */
  breadcrumb: BreadcrumbItem[];
  /**
   * @deprecated Use breadcrumb instead. Kept for backward compatibility.
   */
  parentNodeId?: string;
  /**
   * @deprecated Use breadcrumb instead. Kept for backward compatibility.
   */
  parentNodeTitle?: string;
  /**
   * @deprecated Use breadcrumb instead. Kept for backward compatibility.
   */
  parentAt?: string;
  view: ViewData | null;
  /** Parsed sections from this node's local journal.md (if it exists). */
  journalSections: JournalSection[];
  /** Epoch ms — latest file modification time in the node directory. */
  modified?: number;
}

// ---------------------------------------------------------------------------
// Workspace Config
// ---------------------------------------------------------------------------

export interface TypeConfig {
  color?: string;
}

export interface StatusConfig {
  treatment?: string;
}

export interface WorkspaceConfig {
  repoType?: string;
  name?: string;
  types?: Record<string, TypeConfig>;
  statuses?: Record<string, StatusConfig>;
  workspaces?: Record<string, { path: string }>;
}

/** A child workspace mapped in the root config. */
export interface WorkspaceEntry {
  name: string;
  path: string;
  repoType?: string;
  nodeCount?: number;
}

/** A discovered sub-graph within a workspace. */
export interface SubGraphEntry {
  /** Graph id from graph.json */
  id: string;
  /** Human-readable title from graph.json */
  title: string;
  /** Relative path from workspace root to this graph's directory */
  path: string;
  /** Number of nodes in this sub-graph */
  nodeCount: number;
  /** Epoch ms — most recent node modification time */
  modified?: number;
}

/** A node entry with optional workspace path for cross-workspace linking. */
export interface RecentNode extends GraphNodeEntry {
  graphPath?: string;
  /** Epoch ms — latest file modification time in the node directory. */
  modified?: number;
  /** For sub-graphs: number of nodes contained within. */
  nodeCount?: number;
  /** For sub-graphs: parent workspace path for repoType lookup. */
  workspacePath?: string;
  /** For sub-graphs: parent workspace display name. */
  workspaceName?: string;
  /** For sub-graphs: app name extracted from path (e.g., "sound-lab"). */
  appName?: string;
}

/** Navigator entry for landing page — includes workspace path for navigation. */
export interface NavigatorEntry extends GraphNodeEntry {
  graphPath?: string;
}

/** View entry for landing page — includes workspace path for navigation. */
export interface ViewEntry extends GraphNodeEntry {
  /** Path to the workspace containing this view (for navigation). */
  graphPath?: string;
  /** Display name of the workspace. */
  workspaceName?: string;
}

/** An item requiring human attention — surfaced from annotations or node status. */
export interface ActionItem {
  source: "annotation" | "status";
  signal: AgentSignal | "proposed";
  nodeId: string;
  nodeTitle: string;
  graphPath?: string;
  workspaceName?: string;
  annotationFilename?: string;
  /** First non-empty line of annotation body, truncated. */
  preview: string;
  /** ISO date from annotation meta or node.json. */
  created?: string;
  /** Epoch ms — file modification time for precise timestamp display. */
  modified?: number;
  /** From annotation meta. */
  target?: string;
  /** Annotation lifecycle status — undefined means "open". */
  status?: AnnotationStatus;
}

/** Landing page data — composed from root graph + child workspace discovery. */
export interface LandingData {
  workspaces: WorkspaceEntry[];
  arcs: GraphNodeEntry[];
  navigators: NavigatorEntry[];
  views: ViewEntry[];
  recentNodes: RecentNode[];
  /** Discovered sub-graphs within workspaces (e.g., explorations, studies) */
  subGraphs: SubGraphEntry[];
  /** Nodes needing human attention — proposals, tensions, proposed-status nodes. */
  actionItems: ActionItem[];
}

// ---------------------------------------------------------------------------
// Shared Types
// ---------------------------------------------------------------------------

export interface NodePosition {
  x: number;
  y: number;
}

export type AgentSignal = "reading" | "connection" | "tension" | "proposal";

export type AnnotationStatus = "open" | "accepted" | "resolved" | "dismissed";

export interface AnnotationMeta {
  author: "agent";
  signal: AgentSignal;
  target?: string;
  created: string;
  status?: AnnotationStatus;
  resolvedAt?: string;
}

export interface Annotation {
  filename: string;
  meta: AnnotationMeta;
  content: string;
}

/**
 * JSON-safe record type for serialization.
 */
export type JsonRecord = Record<string, JsonValue>;
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface JournalSection {
  context: string;
  body: string;
}

// ---------------------------------------------------------------------------
// Response Links (Hypermedia)
// ---------------------------------------------------------------------------

/** Links for graph responses — self link and per-node deeplinks. */
export interface GraphLinks {
  self: string;
  nodes: Record<string, string>;
}

/** Links for node responses — self link and parent graph link. */
export interface NodeLinks {
  self: string;
  graph: string;
}

/** Graph response with hypermedia links. */
export interface GraphWithLinks extends GraphWithJournal {
  _links: GraphLinks;
}

/** Node detail response with hypermedia links. */
export interface NodeDetailWithLinks extends NodeDetail {
  _links: NodeLinks;
}
