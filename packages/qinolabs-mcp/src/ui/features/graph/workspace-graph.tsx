import type { Edge, Node, NodeTypes } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  MiniMap,
  PanOnScrollMode,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";

import "@xyflow/react/dist/style.css";

import { useNavigate } from "@tanstack/react-router";

import type { GraphNodeData } from "./graph-node";
import type {
  AgentSignal,
  GraphData,
  GraphEdge,
  GraphNodeEntry,
  TypeConfig,
} from "~/server/types";
import { getMinimapColor } from "~/ui/features/_shared/type-config";
import { GraphNode } from "./graph-node";

/** GraphData with nodes guaranteed to be present (always populated from API). */
type PopulatedGraph = GraphData & { nodes: GraphNodeEntry[] };

interface WorkspaceGraphProps {
  graph: PopulatedGraph;
  highlightNodeIds?: string[];
  focusNodeId?: string;
  agentSignals?: Record<string, AgentSignal[]>;
  typeConfig?: Record<string, TypeConfig>;
  /** Workspace identifier from URL path. */
  workspace: string;
  /** Current sub-path within workspace — used to build nested paths on click. */
  subPath?: string;
}

const nodeTypes: NodeTypes = {
  graphNode: GraphNode,
};

function useColorMode(): "dark" | "light" {
  const [mode, setMode] = useState<"dark" | "light">(() =>
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
      ? "dark"
      : "light",
  );

  useEffect(() => {
    const el = document.documentElement;
    const observer = new MutationObserver(() => {
      setMode(el.classList.contains("dark") ? "dark" : "light");
    });
    observer.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return mode;
}

/**
 * Generate a stable, low-saturation hue for a node ID.
 * Uses a simple string hash spread across 360° of hue.
 */
function nodeHue(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return ((hash % 360) + 360) % 360;
}

function edgeColor(sourceId: string, dark: boolean, opacity: number): string {
  const hue = nodeHue(sourceId);
  return dark
    ? `hsla(${hue}, 40%, 60%, ${opacity})`
    : `hsla(${hue}, 35%, 50%, ${opacity})`;
}

/** Approximate dimensions matching GraphNode's min-w-[180px] / py-3 styling. */
const NODE_WIDTH = 200;
const NODE_HEIGHT = 60;
const NODE_SEP_X = 60;
const RANK_SEP_Y = 120;

/** Max nodes per visual row before wrapping into sub-rows. */
const MAX_RANK_WIDTH = 8;
/** Tighter vertical gap between sub-rows within the same rank. */
const SUB_ROW_GAP = 20;
/** Extra vertical gap between connected components. */
const COMPONENT_GAP = 80;

/**
 * Resolve node collisions using iterative separation.
 * Based on React Flow's example algorithm.
 */
interface CollisionOptions {
  maxIterations?: number;
  overlapThreshold?: number;
  margin?: number;
}

function resolveCollisions(
  positions: Map<string, { x: number; y: number }>,
  options: CollisionOptions = {},
): Map<string, { x: number; y: number }> {
  const { maxIterations = 50, overlapThreshold = 0.5, margin = 15 } = options;

  // Convert to boxes for collision detection
  const boxes = [...positions.entries()].map(([id, pos]) => ({
    id,
    x: pos.x - margin,
    y: pos.y - margin,
    width: NODE_WIDTH + margin * 2,
    height: NODE_HEIGHT + margin * 2,
    moved: false,
  }));

  for (let iter = 0; iter < maxIterations; iter++) {
    let moved = false;

    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const A = boxes[i];
        const B = boxes[j];
        if (!A || !B) continue;

        // Calculate center positions
        const centerAX = A.x + A.width * 0.5;
        const centerAY = A.y + A.height * 0.5;
        const centerBX = B.x + B.width * 0.5;
        const centerBY = B.y + B.height * 0.5;

        // Calculate distance between centers
        const dx = centerAX - centerBX;
        const dy = centerAY - centerBY;

        // Calculate overlap along each axis
        const px = (A.width + B.width) * 0.5 - Math.abs(dx);
        const py = (A.height + B.height) * 0.5 - Math.abs(dy);

        // Check if there's significant overlap
        if (px > overlapThreshold && py > overlapThreshold) {
          A.moved = B.moved = moved = true;
          // Resolve along the smallest overlap axis
          if (px < py) {
            const sx = dx > 0 ? 1 : -1;
            const moveAmount = (px / 2) * sx;
            A.x += moveAmount;
            B.x -= moveAmount;
          } else {
            const sy = dy > 0 ? 1 : -1;
            const moveAmount = (py / 2) * sy;
            A.y += moveAmount;
            B.y -= moveAmount;
          }
        }
      }
    }

    if (!moved) break;
  }

  // Convert back to positions map
  const result = new Map<string, { x: number; y: number }>();
  for (const box of boxes) {
    result.set(box.id, {
      x: box.x + margin,
      y: box.y + margin,
    });
  }

  return result;
}

/**
 * Place an array of node IDs in centered rows of MAX_RANK_WIDTH,
 * advancing `y` downward. Returns the next y position after placement.
 */
function placeNodesInGrid(
  nodeIds: string[],
  startY: number,
  rowGap: number,
  positions: Map<string, { x: number; y: number }>,
): number {
  let y = startY;
  const totalRows = Math.ceil(nodeIds.length / MAX_RANK_WIDTH);
  for (let row = 0; row < totalRows; row++) {
    const start = row * MAX_RANK_WIDTH;
    const end = Math.min(start + MAX_RANK_WIDTH, nodeIds.length);
    const rowNodes = nodeIds.slice(start, end);
    const rowWidth = rowNodes.length * (NODE_WIDTH + NODE_SEP_X) - NODE_SEP_X;
    const startX = -rowWidth / 2;

    rowNodes.forEach((id, i) => {
      positions.set(id, {
        x: startX + i * (NODE_WIDTH + NODE_SEP_X),
        y,
      });
    });

    y += NODE_HEIGHT + rowGap;
  }
  return y;
}

/**
 * Compute positions using component-aware layout.
 *
 * 1. Finds connected components (undirected adjacency).
 * 2. Lays out each connected component hierarchically (longest-path ranking),
 *    wrapping wide ranks into sub-rows of MAX_RANK_WIDTH.
 * 3. Places isolated nodes (no edges) in a type-grouped grid below.
 *
 * Nodes with explicit positions in graph.json are skipped.
 */
function computeLayout(
  graphNodes: GraphNodeEntry[],
  graphEdges: GraphEdge[],
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const needsLayout = graphNodes.filter((n) => !n.position);
  if (needsLayout.length === 0) return positions;

  const ids = new Set(needsLayout.map((n) => n.id));

  // ── Find connected components (undirected) ─────────────────────
  const adj = new Map<string, Set<string>>();
  for (const id of ids) adj.set(id, new Set());
  for (const edge of graphEdges) {
    if (ids.has(edge.source) && ids.has(edge.target)) {
      adj.get(edge.source)!.add(edge.target);
      adj.get(edge.target)!.add(edge.source);
    }
  }

  const visited = new Set<string>();
  const components: string[][] = [];
  for (const id of ids) {
    if (visited.has(id)) continue;
    const component: string[] = [];
    const queue = [id];
    visited.add(id);
    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);
      for (const neighbor of adj.get(current)!) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    components.push(component);
  }

  const connectedComponents = components
    .filter((c) => c.length > 1)
    .sort((a, b) => b.length - a.length);

  let globalY = 0;

  // ── Layout connected components hierarchically ─────────────────
  for (const component of connectedComponents) {
    const componentSet = new Set(component);
    const componentEdges = graphEdges.filter(
      (e) => componentSet.has(e.source) && componentSet.has(e.target),
    );

    // Longest-path ranking (directed)
    const incoming = new Map<string, string[]>();
    for (const id of componentSet) incoming.set(id, []);
    for (const edge of componentEdges) {
      incoming.get(edge.target)!.push(edge.source);
    }

    const rank = new Map<string, number>();
    function getRank(id: string): number {
      if (rank.has(id)) return rank.get(id)!;
      rank.set(id, -1); // cycle guard
      const parents = incoming.get(id) ?? [];
      const r =
        parents.length === 0 ? 0 : Math.max(...parents.map(getRank)) + 1;
      rank.set(id, r);
      return r;
    }
    for (const id of componentSet) getRank(id);

    // Group by rank, sort ranks ascending
    const ranks = new Map<number, string[]>();
    for (const [id, r] of rank) {
      if (!ranks.has(r)) ranks.set(r, []);
      ranks.get(r)!.push(id);
    }
    const sortedRanks = [...ranks.keys()].sort((a, b) => a - b);

    // Place each rank, wrapping wide ranks into sub-rows
    for (const r of sortedRanks) {
      const nodeIds = ranks.get(r)!;
      globalY = placeNodesInGrid(nodeIds, globalY, SUB_ROW_GAP, positions);
      // Replace last sub-row gap with full rank gap
      globalY += RANK_SEP_Y - NODE_HEIGHT - SUB_ROW_GAP;
    }

    globalY += COMPONENT_GAP;
  }

  // ── Layout isolated nodes (no edges) in a grid below ─────────────
  const isolatedNodes = components
    .filter((c) => c.length === 1)
    .map((c) => c[0])
    .filter((id): id is string => id !== undefined);

  if (isolatedNodes.length > 0) {
    globalY = placeNodesInGrid(isolatedNodes, globalY, SUB_ROW_GAP, positions);
  }

  // Resolve any remaining collisions from the hierarchical layout
  return resolveCollisions(positions, { margin: 20 });
}

/**
 * Edge type → visual style encoding semantic weight.
 *
 * Intensity hierarchy (highest → lowest):
 *   informed    — generative origin, rare, most interesting to see
 *   extends     — active elaboration / structural growth
 *   maps        — navigational, orienting
 *   references  — citation, connective tissue (most common, quietest)
 */
interface EdgeTypeStyle {
  strokeWidth: number;
  opacity: number;
  dasharray?: string;
}

function getEdgeTypeStyle(edgeType: string | undefined): EdgeTypeStyle {
  switch (edgeType) {
    case "informed":
      return { strokeWidth: 2, opacity: 0.8 };
    case "extends":
      return { strokeWidth: 1.5, opacity: 0.65, dasharray: "8 3" };
    case "maps":
      return { strokeWidth: 1.2, opacity: 0.45, dasharray: "4 3" };
    case "curates":
      return { strokeWidth: 0.8, opacity: 0.2, dasharray: "1 3" };
    default: // "references" and unknown
      return { strokeWidth: 1, opacity: 0.3, dasharray: "2 3" };
  }
}

function buildGraph(
  graph: PopulatedGraph,
  highlightNodeIds: string[],
  agentSignals: Record<string, AgentSignal[]>,
  dark: boolean,
  typeConfig: Record<string, TypeConfig>,
): { nodes: Node[]; edges: Edge[] } {
  const highlightSet = new Set(highlightNodeIds);
  const layoutPositions = computeLayout(graph.nodes, graph.edges);

  const nodes: Node[] = graph.nodes.map((node) => {
    const position = node.position ??
      layoutPositions.get(node.id) ?? { x: 0, y: 0 };

    const isHighlighted = highlightSet.has(node.id);

    return {
      id: node.id,
      type: "graphNode",
      position,
      data: {
        label: node.title,
        status: node.status,
        nodeId: node.id,
        dir: node.dir,
        agentSignals: agentSignals[node.id] ?? [],
        hasSubGraph: node.hasSubGraph,
        hasView: node.hasView,
        hasJournal: node.hasJournal,
      } satisfies GraphNodeData as unknown as Record<string, unknown>,
      className: isHighlighted
        ? "ring-2 ring-purple-400/60 dark:ring-purple-500/40 rounded-lg"
        : "",
    };
  });

  const edges: Edge[] = graph.edges.map((edge) => {
    const ets = getEdgeTypeStyle(edge.type);
    const color = edgeColor(edge.source, dark, ets.opacity);

    return {
      id: `${edge.source}-${edge.target}`,
      source: edge.source,
      target: edge.target,
      animated:
        graph.nodes.find((n) => n.id === edge.target)?.status === "active",
      style: {
        stroke: color,
        strokeWidth: ets.strokeWidth,
        strokeDasharray: ets.dasharray,
      },
      label: edge.type,
      labelStyle: { fontSize: 10, fill: color },
      labelBgPadding: [1, 0.5] as [number, number],
      labelBgBorderRadius: 4,
      labelBgStyle: {
        fill: dark ? "rgba(12, 10, 9, 0.75)" : "rgba(231, 229, 228, 0.8)",
      },
    };
  });

  return { nodes, edges };
}

function WorkspaceGraph({
  graph,
  highlightNodeIds = [],
  focusNodeId,
  agentSignals = {},
  typeConfig = {},
  workspace,
  subPath,
}: WorkspaceGraphProps) {
  const navigate = useNavigate();
  const colorMode = useColorMode();
  const dark = colorMode === "dark";
  const { nodes: initialNodes, edges: initialEdges } = buildGraph(
    graph,
    highlightNodeIds,
    agentSignals,
    dark,
    typeConfig,
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync nodes & edges when colorMode (or graph data) changes
  useEffect(() => {
    const { nodes: updated, edges: updatedEdges } = buildGraph(
      graph,
      highlightNodeIds,
      agentSignals,
      dark,
      typeConfig,
    );
    setNodes(updated);
    setEdges(updatedEdges);
  }, [
    dark,
    graph,
    highlightNodeIds,
    agentSignals,
    typeConfig,
    setNodes,
    setEdges,
  ]);

  // Calculate initial viewport to center on focus node or approximate fit for all nodes
  function computeDefaultViewport() {
    // Focus node case: center on that node
    if (focusNodeId) {
      const focusNode = graph.nodes.find((n) => n.id === focusNodeId);
      if (focusNode?.position) {
        return {
          x: -focusNode.position.x + 400,
          y: -focusNode.position.y + 200,
          zoom: 1.2,
        };
      }
    }

    // General case: compute bounding box center and approximate zoom
    if (initialNodes.length === 0) return undefined;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    for (const node of initialNodes) {
      minX = Math.min(minX, node.position.x);
      maxX = Math.max(maxX, node.position.x + NODE_WIDTH);
      minY = Math.min(minY, node.position.y);
      maxY = Math.max(maxY, node.position.y + NODE_HEIGHT);
    }

    const graphWidth = maxX - minX;
    const graphHeight = maxY - minY;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // Estimate container size (will be refined by onInit fitView)
    const containerWidth = 800;
    const containerHeight = 500;
    const padding = 0.3;
    const paddedWidth = containerWidth * (1 - padding);
    const paddedHeight = containerHeight * (1 - padding);

    const zoom = Math.min(
      paddedWidth / graphWidth,
      paddedHeight / graphHeight,
      1.5, // max zoom
    );

    return {
      x: containerWidth / 2 - centerX * zoom,
      y: containerHeight / 2 - centerY * zoom,
      zoom: Math.max(zoom, 0.1), // min zoom
    };
  }

  const defaultViewport = computeDefaultViewport();

  function getNodeColor() {
    return (node: Node) => {
      const nodeEntry = graph.nodes.find((n) => n.id === node.id);
      const colorName = nodeEntry?.type
        ? typeConfig[nodeEntry.type]?.color
        : undefined;
      const mc = getMinimapColor(colorName);
      return dark ? mc.dark : mc.light;
    };
  }

  function handleNodeClick(_event: React.MouseEvent, node: Node) {
    // Always navigate to node detail; sub-graph navigation is available via button in detail view
    void navigate({
      to: "/$workspace/node/$nodeId",
      params: { workspace, nodeId: node.id },
      search: subPath ? { at: subPath } : {},
    });
  }

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        defaultViewport={defaultViewport}
        onInit={(instance) => {
          if (!focusNodeId) {
            instance.fitView({ padding: 0.3, duration: 300 });
          }
        }}
        proOptions={{ hideAttribution: true }}
        colorMode={colorMode}
        /* ── Figma-like interaction ── */
        panOnScroll
        panOnScrollMode={PanOnScrollMode.Free}
        zoomOnScroll={false}
        zoomOnPinch
        zoomOnDoubleClick={false}
        selectionOnDrag
        panOnDrag={[1, 2]}
        minZoom={0.1}
        maxZoom={4}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          className={"bg-surface!"}
          patternClassName={"fill-stone-600! dark:fill-slate-700!"}
        />
        {/* <MiniMap
          pannable
          zoomable
          nodeColor={getNodeColor()}
          maskColor={dark ? "rgba(12, 10, 9, 0.7)" : "rgba(245, 245, 244, 0.7)"}
          style={{
            backgroundColor: dark
              ? "rgba(28, 25, 23, 0.8)"
              : "rgba(231, 229, 228, 0.8)",
            borderRadius: 8,
            border: "none",
          }}
        /> */}
        <FitViewOnChange graphId={graph.id} skip={!!focusNodeId} />
        <ZoomIndicator />
      </ReactFlow>
    </div>
  );
}

/** Triggers fitView when graph identity changes (after initial mount). */
function FitViewOnChange({ graphId, skip }: { graphId: string; skip?: boolean }) {
  const { fitView } = useReactFlow();
  const prevGraphId = useRef(graphId);

  useEffect(() => {
    if (skip) return;
    if (prevGraphId.current !== graphId) {
      prevGraphId.current = graphId;
      fitView({ padding: 0.3, duration: 300 });
    }
  }, [graphId, skip, fitView]);

  return null;
}

function ZoomIndicator() {
  const { getZoom } = useReactFlow();
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const interval = setInterval(() => {
      setZoom(getZoom());
    }, 100);
    return () => clearInterval(interval);
  }, [getZoom]);

  return (
    <div className="absolute bottom-3 left-3 select-none rounded-md bg-stone-200/80 px-2 py-1 font-mono text-[10px] text-stone-500 dark:bg-stone-800/80 dark:text-stone-400">
      {Math.round(zoom * 100)}%
    </div>
  );
}

export { WorkspaceGraph };
