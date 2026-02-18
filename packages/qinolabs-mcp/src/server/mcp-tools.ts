/**
 * MCP tool registrations for qino-lab protocol operations.
 *
 * Each tool is a thin wrapper around a ProtocolOps method,
 * handling input validation and JSON serialization.
 *
 * The ops abstraction allows tools to be backed by either:
 * - Direct filesystem operations (standalone mode)
 * - HTTP client calls (development mode)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { ProtocolOps } from "./ops.js";

export function registerTools(server: McpServer, ops: ProtocolOps) {
  server.tool(
    "read_config",
    `Read the workspace configuration from .claude/qino-config.json.

WHEN TO USE:
- On arrival — understand workspace conventions
- Before creating nodes — know valid types and statuses
- Checking visual conventions — type colors, status treatments

RETURNS: types (valid node types with colors), statuses (with visual treatments), name, protocol`,
    {},
    async () => {
      const config = await ops.readConfig();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(config, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "read_graph",
    `Read a graph's structure (nodes, edges), parsed journal sections, and per-node agent signals.

WHEN TO USE:
- Arriving at workspace — understand what exists
- Before creating nodes — check for duplicates, find connection targets
- Exploring relationships — see edge network
- Checking agent signals — see annotations across nodes

GRAPHPATH: Omit for root graph. Provide path for sub-graph (e.g., 'nodes/parent-concept').

RETURNS: nodes[], edges[], journalSections[] (parsed from workspace journal.md), agentSignals{}, actionItems[] (open + accepted only — resolved/dismissed are filtered out), _links.nodes{} for deeplinks.

Journal sections may contain user-authored notes between sessions — observations, nudges, or emerging questions. Auto-generated echoes (node creation, structural changes) follow predictable patterns.

Use _links when referencing nodes: [node-name](_links.nodes["node-name"])`,
    {
      graphPath: z
        .string()
        .optional()
        .describe(
          "Relative path from workspace root to a sub-graph directory (e.g. 'qinolabs-repo/implementations/sound-lab/explorations'). Omit for root graph.",
        ),
    },
    async ({ graphPath }) => {
      const graph = await ops.readGraph(graphPath);
      if (!graph) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No graph.json found${graphPath ? ` in: ${graphPath}` : " at workspace root"}`,
            },
          ],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(graph, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "read_node",
    `Read full node detail: identity (node.json), story, content files (discovered), annotations, and journal sections.

WHEN TO USE:
- Exploring a specific node in depth
- Before editing — understand current state
- Checking for sub-graph — node might have facets
- Reading annotations — see what's been noticed about this node
- Reading journal — see user notes and session observations scoped to this node

RETURNS: identity (title, type, status, tags, held_threads), story (the impulse), contentFiles[], annotations[] (each includes meta.status — accepted proposals should be acted on), journalSections[] (parsed from node's local journal.md), hasSubGraph, breadcrumb[].

Journal sections may contain user-authored notes between sessions — observations, nudges, or emerging questions.

Use _links for navigation: [see details](_links.self) or [back to graph](_links.graph)`,
    {
      nodeId: z.string().describe("The node identifier from graph.json"),
      graphPath: z
        .string()
        .optional()
        .describe(
          "Relative path from workspace root to the graph containing this node. Omit for root graph.",
        ),
    },
    async ({ nodeId, graphPath }) => {
      const node = await ops.readNode(nodeId, graphPath);
      if (!node) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Node not found: ${nodeId}`,
            },
          ],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(node, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "write_annotation",
    `Write an agent annotation to a node. Creates a numbered markdown file in the node's annotations/ directory.

WHEN TO USE:
- Noticing something about content worth preserving but not integrating
- Marginal observations during reading
- Tensions or questions that arise while exploring
- Proposals for how content might evolve

SIGNAL TYPES:
- reading: observation made while reading
- connection: noticed link to something else
- tension: something doesn't sit right, needs attention
- proposal: suggestion for change or development

WHEN NOT TO USE:
- Content that belongs in the node itself → edit content directly
- Observations about the workspace → use write_journal_entry
- Thoughts that deserve their own node → use create_node

LIFECYCLE: After acting on an accepted proposal or addressing a tension, use resolve_annotation to mark it as resolved.`,
    {
      nodeId: z.string().describe("The node identifier from graph.json"),
      signal: z
        .enum(["reading", "connection", "tension", "proposal"])
        .describe("The signal type for this annotation"),
      body: z.string().describe("The annotation content"),
      target: z
        .string()
        .optional()
        .describe("Optional target reference (e.g., 'story.md:3' or 'content/arc.md#essence')"),
      graphPath: z
        .string()
        .optional()
        .describe(
          "Relative path from workspace root to the graph containing this node. Omit for root graph.",
        ),
    },
    async ({ nodeId, signal, body, target, graphPath }) => {
      const result = await ops.writeAnnotation({
        nodeId,
        signal,
        body,
        target,
        graphPath,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "create_node",
    `Create a new node in the graph. Writes node.json + story.md, adds entry and edges to graph.json, and appends an echo to journal.md.

WHEN TO USE:
- Thought or observation that can be referenced by other nodes
- Material that may be revisited, extended, or composed
- Insight that deserves a name and identity
- Cross-concept signal during exploration

WHEN NOT TO USE:
- Ephemeral working notes → no persistence needed
- Observations complete in themselves → use write_journal_entry instead

THE TEST: Would this benefit from edges pointing to or from it? If yes → create_node. If no → write_journal_entry.

STORY: The impulse — one or two sentences capturing what this node IS. Not a summary; a seed.

EDGES: Always include when connections are clear. Each needs target, type (sparked-by, references, extends, informs), and context (a sentence explaining why).`,
    {
      id: z.string().describe("Unique node identifier (used in edges)"),
      dir: z
        .string()
        .describe(
          "Directory name for this node under the graph's node directory (default 'nodes/', configurable via nodesDir in graph.json)",
        ),
      title: z.string().describe("Human-readable title"),
      type: z
        .string()
        .optional()
        .describe(
          "Node type from workspace vocabulary (e.g. 'app', 'ecosystem', 'tool')",
        ),
      status: z
        .string()
        .optional()
        .describe("Initial status. Defaults to 'active' if not provided."),
      story: z
        .string()
        .describe(
          "The impulse — why this node exists. Markdown formatted. Brief nodes can be 1-3 sentences; longer research or implementation nodes should use headers, lists, and emphasis for structure.",
        ),
      edges: z
        .array(
          z.object({
            target: z.string().describe("Target node ID"),
            type: z
              .string()
              .optional()
              .describe("Edge type (e.g. 'references', 'sparked-by')"),
            context: z
              .string()
              .optional()
              .describe("Brief context for the connection"),
          }),
        )
        .optional()
        .describe("Edges from this new node to existing nodes"),
      view: z
        .object({
          focal: z
            .string()
            .describe(
              "The focal node ID — the primary subject of this view",
            ),
          includes: z
            .array(z.string())
            .describe(
              "All node IDs included in this view (including the focal)",
            ),
        })
        .optional()
        .describe(
          "View data — creates a curated subset of the graph. Generates curates edges to included nodes.",
        ),
      graphPath: z
        .string()
        .optional()
        .describe(
          "Relative path from workspace root to the graph to add this node to. Omit for root graph.",
        ),
    },
    async ({ id, dir, title, type, status, story, edges, view, graphPath }) => {
      const result = await ops.createNode({
        id,
        dir,
        title,
        type,
        status,
        story,
        edges,
        view,
        graphPath,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "write_journal_entry",
    `Append an entry to the workspace or node-level journal with a context marker.

WHEN TO USE:
- After creating a node — echo the creation (context: node/node-id)
- At session start — note arrival and intent (context: session/YYYY-MM-DD)
- At session end — summarize what happened (context: session/YYYY-MM-DD)
- After structural changes — record what shifted (context: migration)
- For observations that don't need their own node but are worth preserving

WHEN NOT TO USE:
- Content that would benefit from edges → use create_node instead
- Routine file operations → git handles provenance

SCOPE:
- Omit nodeId → writes to root journal (cross-node, workspace-level)
- Include nodeId → writes to that node's local journal`,
    {
      context: z
        .string()
        .describe(
          "Context marker (e.g. 'session/2026-02-03', 'node/node-id', 'migration', 'observation')",
        ),
      body: z.string().describe("The journal entry content (markdown)"),
      nodeId: z
        .string()
        .optional()
        .describe(
          "Write to this node's local journal instead of root journal",
        ),
      graphPath: z
        .string()
        .optional()
        .describe(
          "Relative path from workspace root to the graph. Omit for root graph.",
        ),
    },
    async ({ context, body, nodeId, graphPath }) => {
      const result = await ops.writeJournalEntry({
        context,
        body,
        nodeId,
        graphPath,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "resolve_annotation",
    `Update the lifecycle status of an annotation (proposal or tension).

WHEN TO USE:
- After acting on an accepted proposal → resolve it
- After addressing a tension → resolve it
- To dismiss stale or irrelevant proposals/tensions
- To accept a proposal (marks it as waiting for agent action)

STATUS VALUES:
- accepted: Human approves the proposal — agent should act on it next
- resolved: The annotation has been addressed — no more attention needed
- dismissed: The annotation is no longer relevant — hide from attention lists

WHAT IT DOES:
1. Reads the annotation file
2. Updates YAML frontmatter with new status + resolvedAt date
3. Writes the file back

Resolved and dismissed annotations are filtered out of actionItems in read_graph.`,
    {
      nodeId: z.string().describe("The node identifier from graph.json"),
      filename: z
        .string()
        .describe(
          "The annotation filename (e.g., '001-relational-thinness.md')",
        ),
      status: z
        .enum(["accepted", "resolved", "dismissed"])
        .describe("The new lifecycle status for the annotation"),
      graphPath: z
        .string()
        .optional()
        .describe(
          "Relative path from workspace root to the graph containing this node. Omit for root graph.",
        ),
    },
    async ({ nodeId, filename, status, graphPath }) => {
      try {
        const result = await ops.resolveAnnotation({
          nodeId,
          filename,
          status,
          graphPath,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return {
          content: [
            {
              type: "text" as const,
              text: message,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "read_data",
    `Read structured data files from a node's data/ directory.

WHEN TO USE:
- After seeing dataFiles in read_node — fetch full content of specific data files
- Comparing structured data across nodes (scores, results)
- Loading evaluation data, simulation results, or other structured content

BEHAVIOR:
- If filename is provided, returns that specific file's content
- If filename is omitted, returns ALL data files (excluding schema.json which is returned separately)
- schema.json (if present) is always returned in the schema field

RETURNS: { dataFiles: [{ filename, content }], schema?: string }`,
    {
      nodeId: z.string().describe("The node identifier from graph.json"),
      filename: z
        .string()
        .optional()
        .describe(
          "Specific data file to read (e.g., 'scores.json'). Omit to read all data files.",
        ),
      graphPath: z
        .string()
        .optional()
        .describe(
          "Relative path from workspace root to the graph containing this node. Omit for root graph.",
        ),
    },
    async ({ nodeId, filename, graphPath }) => {
      try {
        const result = await ops.readData({ nodeId, filename, graphPath });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return {
          content: [
            {
              type: "text" as const,
              text: message,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "write_data",
    `Write a structured JSON data file to a node's data/ directory.

WHEN TO USE:
- Storing evaluation results (rubric scores, simulation outputs)
- Attaching structured data to a protocol node
- Writing schema.json to describe the data shape

BEHAVIOR:
- Creates data/ directory if it doesn't exist
- Validates input is valid JSON (parse check) — does NOT validate against schema.json
- Echoes to node journal on FIRST write (when data/ directory is created)
- Subsequent writes to the same node's data/ are silent

RETURNS: { success: true, filename }`,
    {
      nodeId: z.string().describe("The node identifier from graph.json"),
      filename: z
        .string()
        .describe(
          "Data file name (e.g., 'scores.json', 'schema.json'). Must end in .json.",
        ),
      data: z
        .string()
        .describe(
          "The JSON string to write. Must be valid JSON.",
        ),
      graphPath: z
        .string()
        .optional()
        .describe(
          "Relative path from workspace root to the graph containing this node. Omit for root graph.",
        ),
    },
    async ({ nodeId, filename, data, graphPath }) => {
      try {
        const result = await ops.writeData({ nodeId, filename, data, graphPath });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return {
          content: [
            {
              type: "text" as const,
              text: message,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "update_view",
    `Update a curated view's focal node and included nodes. Syncs view.json and curates edges in graph.json.

WHEN TO USE:
- View's composition needs to change as inquiry evolves
- Focal node shifts (different primary subject)
- Nodes added or removed from the curated subset

WHAT IT DOES:
1. Updates view.json with new focal and includes
2. Syncs 'curates' edges in graph.json (adds missing, removes stale)

Views are curated attention subsets — focus on part of a graph without losing the whole.`,
    {
      nodeId: z.string().describe("The view node identifier from graph.json"),
      focal: z
        .string()
        .describe("The focal node ID — the primary subject of this view"),
      includes: z
        .array(z.string())
        .describe("All node IDs to include in this view"),
      graphPath: z
        .string()
        .optional()
        .describe(
          "Relative path from workspace root to the graph containing this view. Omit for root graph.",
        ),
    },
    async ({ nodeId, focal, includes, graphPath }) => {
      const result = await ops.updateView({
        nodeId,
        focal,
        includes,
        graphPath,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );
}
