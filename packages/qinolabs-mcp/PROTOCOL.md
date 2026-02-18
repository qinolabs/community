# qino-protocol

A structural convention for human-AI collaborative workspaces. The file system carries the context. The protocol prescribes structure; the workspace prescribes vocabulary.

---

## Structural Vocabulary

Every protocol file has a role. Together they describe a node's identity, purpose, substance, structure, and history.

| File | Role | Sentence |
|------|------|----------|
| `node.json` | Identity | "I am this" |
| `story.md` | Impulse | "I exist because of this" |
| `content/` | Substance | "I hold this" |
| `graph.json` | Recursion / containment | "I contain deeper structure" |
| `view.json` | Curation / reference | "Attend to these together" |
| `journal.md` | Timeline | "This happened here" |
| `annotations/` | Signal | "This was noticed" |

Not every node uses every file. A lightweight capture might have only `node.json` + `story.md`. A concept with facets might have all seven. The protocol defines what each file means; the node decides which ones it needs.

---

## Directory Structure

A protocol-compliant workspace:

```
workspace/
  .claude/
    qino-config.json                    # Workspace configuration
  graph.json                            # Root graph — index of nodes + edges
  journal.md                            # Root journal — workspace-level timeline
  nodes/                                # Default name; configurable via nodesDir in graph.json
    a-concept/                          # Node with content and sub-graph
      node.json                         # Identity (authoritative)
      story.md                          # Why this node exists
      content/
        concept.md                      # Primary content document
      graph.json                        # Sub-graph: this node contains deeper structure
      journal.md                        # Node-scoped journal
      nodes/
        facet-one/                      # Sub-graph child node
          node.json
          story.md
          content/
            facet.md
          annotations/
            001-initial-reading.md      # Agent annotation
        facet-two/
          node.json
          story.md
          content/
    a-navigator/                        # Navigator node (orientation, not content)
      node.json
      story.md
      content/
        terrain.md                      # Curated territory map
        reading-order.md                # Sequenced entry path (prose)
      journal.md                        # Session log — the navigator's heartbeat
      annotations/
    a-curated-view/                     # View node (curation, not containment)
      node.json
      story.md
      view.json                         # Focal + included nodes
      journal.md                        # Observations within this frame
      annotations/
```

---

## File Schemas

### graph.json

The graph index. Declares nodes, edges, and enough metadata to render the graph without reading individual node directories.

```json
{
  "id": "workspace-id",
  "title": "Workspace title",
  "nodes": [
    {
      "id": "qino-world",
      "dir": "qino-world",
      "title": "qino World",
      "type": "concept",
      "status": "active"
    },
    {
      "id": "domain-language",
      "dir": "domain-language",
      "title": "Domain Language",
      "type": "ecosystem",
      "status": "active"
    },
    {
      "id": "crossing-naming-tension",
      "dir": "crossing-naming-tension",
      "title": "Crossing as Naming",
      "type": "view",
      "status": "active"
    }
  ],
  "edges": [
    {
      "source": "qino-world",
      "target": "domain-language",
      "type": "references",
      "context": "figures, manifestations, crossings"
    },
    {
      "source": "crossing-naming-tension",
      "target": "qino-world",
      "type": "curates",
      "context": "focal"
    },
    {
      "source": "crossing-naming-tension",
      "target": "domain-language",
      "type": "curates"
    }
  ]
}
```

**Fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Stable identifier for this graph |
| `title` | yes | Human-readable name |
| `nodesDir` | no | Directory name for node directories (default: `"nodes"`). Each graph level can set its own. |
| `nodes[]` | yes | Node entries (see below) |
| `edges[]` | yes | Edge entries (see below) |

**Node entries in graph.json:**

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Stable reference used in edges. Does not change. |
| `dir` | yes | Directory name under the node directory (default `nodes/`, configurable via `nodesDir`). Can be renamed without breaking edges. |
| `title` | yes | Display name (duplicated from `node.json`) |
| `type` | no | Free-form string (duplicated from `node.json`) |
| `status` | no | Free-form string (duplicated from `node.json`) |

**Constraints:**

- `graph.json` is an **index**. It duplicates `title`, `type`, and `status` from each `node.json` so the graph renders without reading every node directory.
- `node.json` is **authoritative**. If values drift between `graph.json` and `node.json`, `node.json` wins.
- `id` and `dir` are separate. `id` is the stable reference used in edges. `dir` is the filesystem directory name. A directory can be renamed without breaking edge references.
- Node creation writes both `graph.json` and `node.json` atomically.
- Containment is structural (sub-graphs via directories), not an edge type.

---

### node.json

Node identity. The authoritative source of truth for a node's metadata.

```json
{
  "title": "qino World",
  "type": "concept",
  "status": "active",
  "created": "2025-12-08"
}
```

**Fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `title` | yes | Display name |
| `type` | no | Free-form string. The workspace defines the vocabulary. |
| `status` | no | Free-form string. The workspace defines the vocabulary. |
| `created` | no | ISO date string |

**Open schema.** Any additional fields the workspace needs are allowed. The protocol defines that `title`, `type`, `status`, and `created` exist and that the renderer and agent voice use them. Everything else is workspace-level.

Example with workspace-level fields (qino-concepts workspace):

```json
{
  "title": "qino World",
  "type": "concept",
  "status": "active",
  "created": "2025-12-08",
  "tags": ["modality", "relational", "crossing"],
  "held_threads": [
    "XR immersion — AR portals, spatial node placement",
    "audio as modality — voice commands, ambient narration"
  ]
}
```

`tags` and `held_threads` are workspace-level. Other workspaces would not use them. The schema is open: unknown keys are preserved.

---

### view.json

Curated view. References existing nodes from anywhere in the graph as a shared attention space.

```json
{
  "focal": "qino-world",
  "includes": ["crossing-threshold", "domain-language"]
}
```

**Fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `focal` | yes | Node `id` of the entry point -- what this view is about |
| `includes[]` | yes | Node `id`s to attend to together |

**Constraints:**

- Both `focal` and `includes` reference node `id` values from the graph (any level).
- The view node itself has its own `node.json`, `story.md`, and optional `journal.md` / `annotations/`.
- `view.json` is **authoritative** for the curation. The `curates` edges in `graph.json` are index duplication (see [Views](#views)).
- A node containing `view.json` is a curated view. A node containing `graph.json` is a sub-graph. These are different structural relationships (see [Views vs. Sub-graphs](#views-vs-sub-graphs)).

---

### story.md

Free-form markdown. The impulse -- why this node exists.

```markdown
The moment of recognition: crossings aren't data transfers.
They're ceremonies where a figure is re-introduced in a new
modality's voice. The name "crossing" captures the functional
act but misses the experiential quality.
```

No required structure. No front matter. The story is the node's reason for being, written in whatever voice fits.

---

### content/

Directory of files that constitute the node's substance. Rendered by file discovery.

| Extension | Rendering |
|-----------|-----------|
| `.md` | Markdown |
| `.json` | Structured display |

Empty or missing `content/` is valid. When absent, `story.md` serves as the content. This is common for lightweight nodes.

The node's `type` affects visual chrome (colors, icons via `qino-config.json`) but does not change how content renders. All content renders by extension, regardless of node type.

---

### data/

Directory of structured JSON files attached to a node. Machine-readable counterpart to `content/` (which is narrative markdown).

```
nodes/eval-threshold-2026-02-18/
  node.json
  story.md
  content/
    analysis.md
  data/
    schema.json      # Optional — describes the data shape (JSON Schema draft 2020-12)
    scores.json      # Structured data file
```

**Convention:**

| File | Role |
|------|------|
| `data/schema.json` | Optional. If present, describes the expected shape of data files. Advisory — not enforced on write. |
| `data/*.json` | Structured data files. File names are descriptive (e.g., `scores.json`, `turns.json`). |

**Relationship to content/:**

- `content/` is narrative (markdown, human-readable)
- `data/` is structured (JSON, machine-readable)
- They coexist — a node can have both

**Discovery:**

The protocol reader discovers `data/` files by listing the directory (same pattern as `content/`). However, unlike content files, data files appear in `readNode()` as a **lightweight index** (filename + size in bytes) rather than full content. This prevents large data files from polluting agent context on every node read.

Full data content is accessed via the `read_data` tool (MCP) or `GET /api/nodes/:nodeId/data` (HTTP).

**Journal echo:**

When `data/` is created for the first time on a node (first `write_data` call), an echo is appended to the node's local journal. Subsequent writes to the same node's data directory are silent.

---

### journal.md

Timestamped entries with context markers. The timeline of attention at a given scope.

```markdown
## 2025-02-01 -- session start

<!-- context: session/2025-02-01 -->

Opened the workspace to explore how facets relate to ecosystem docs.
The crossing-threshold facet feels like it should reference domain-language.

## created: crossing as threshold ceremony

<!-- context: node/crossing-as-threshold -->

created: crossing as threshold ceremony
> [crossing-as-threshold](nodes/crossing-as-threshold/)

The moment came from noticing that crossings aren't just data transfers --
they're ceremonies where a figure is re-introduced in a new modality's voice.

## qino-world observation

<!-- context: node/qino-world -->

Looking at the sub-graph, the facets cluster into two groups:
spatial (positioning, attunement) and relational (crossing-threshold, resonance).

## inside crossing-naming-tension

<!-- context: view/crossing-naming-tension -->

The domain language calls it "crossing" but the threshold facet treats it as ceremony.
There's a tension between the functional name and the experiential reality.
The view makes this visible -- seeing these three nodes together reveals the gap.
```

See [Journal Protocol](#journal-protocol) for the full context marker specification.

---

### annotations/

Numbered markdown files with YAML-like front matter. The agent's signal channel.

**Filename convention:** `{NNN}-{slug}.md` where `NNN` is a zero-padded sequence number.

Example: `001-initial-reading.md`

```markdown
---
author: agent
signal: reading
target: voicing-resonance-001
created: 2025-02-01T14:30:00Z
---

Single-modality substrate. The thinness isn't lens failure -- compare
with experiment 003 where cross-modal substrate produced richer output.
```

**Front matter fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `author` | yes | Always `agent` |
| `signal` | yes | One of: `reading`, `connection`, `tension`, `proposal` |
| `target` | no | Identifier of the specific content this annotation references |
| `created` | no | ISO timestamp |

See [Annotation Protocol](#annotation-protocol) for signal semantics and rendering.

---

## Workspace Configuration

`.claude/qino-config.json` configures workspace-level settings. The renderer reads this on startup.

```json
{
  "name": "qino-concepts",
  "types": {
    "concept":   { "color": "purple" },
    "ecosystem": { "color": "blue" },
    "facet":     { "color": "teal" },
    "arc":       { "color": "rose" },
    "navigator": { "color": "emerald" },
    "view":      { "color": "sky" }
  },
  "statuses": {
    "composted": { "treatment": "faded" }
  }
}
```

**Fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `name` | no | Workspace identity |
| `types` | no | Maps node type strings to visual styles |
| `statuses` | no | Maps status strings to visual treatments |

**Constraints:**

- Unknown types get a default visual style. Unknown statuses get default treatment.
- Unknown config keys are ignored -- forward-compatible.
- Adding a new type to a workspace means adding an entry here. No code changes.
- Future fields (e.g., `voice`, `defaultType`, `defaultStatus`) can be added as needed.

---

## Edge Vocabulary

Edges connect nodes in `graph.json`. Edge `type` and `context` are both optional free-form strings.

### Domain Edges

The workspace defines its own edge vocabulary. Examples across workspace types:

| Workspace | Example edge types |
|-----------|--------------------|
| Concepts | `references`, `sparked-by`, `tensions-with`, `extends` |
| Research | `extends`, `contradicts`, `precedes` |
| Implementation | `depends-on`, `sequences`, `blocks` |

The protocol carries the edge. The workspace names the relationship.

### Curation Edges

`curates` is the convention for view edges. It marks the curation relationship between a view node and the nodes it frames.

```json
{
  "source": "crossing-naming-tension",
  "target": "qino-world",
  "type": "curates",
  "context": "focal"
}
```

- `context: "focal"` marks the view's entry point (the focal node).
- `curates` edges without `context: "focal"` mark included nodes.
- These edges are **index duplication** of `view.json`. `view.json` is authoritative.

### Containment

Containment is structural, not an edge type. A node that has child nodes expresses containment through directory hierarchy (`nodes/` subdirectory + its own `graph.json`). There is no `contains` edge.

---

## Sub-graph Recursion

A node with its own `graph.json` becomes a navigable sub-graph. Same schema at every level.

```
workspace/
  graph.json                          # Level 0: root graph
  nodes/
    qino-world/
      graph.json                      # Level 1: qino-world's facets
      nodes/
        crossing-threshold/
          graph.json                  # Level 2: crossing-threshold's details
          nodes/
            ...                       # Level 3: and so on
```

**Rules:**

- The graph schema is identical at every depth.
- The renderer navigates into sub-graphs by entering the node -- same UI, different scale.
- No depth limit. Recursion stops where the files stop.
- A node's `graph.json` declares its child nodes. The child node directories live under `nodes/` within that node.
- The parent graph.json uses `hasSubGraph: true` (enriched at read time) to signal that a node is navigable.

---

## Views

Views are curated subsets of the graph -- a named neighborhood where both human and agent can point, discuss, and think together.

### Why Views Exist

The full graph has no salience (too broad). A single node loses relational context (too narrow). Views are the middle ground: "think about these things together."

### How Views Work

A view node is a regular node that additionally contains `view.json`:

```
nodes/crossing-naming-tension/
  node.json           # type: "view", status: "active"
  story.md            # Why these nodes belong together
  view.json           # { "focal": "qino-world", "includes": [...] }
  journal.md          # Observations made within this frame
  annotations/        # Agent signals scoped to this view
```

The view references nodes from anywhere in the graph. The referenced nodes do not move -- the view says "attend to these together."

### Index Duplication in graph.json

`view.json` is authoritative. `graph.json` carries `curates` edges as an index so the graph renders views without reading every `view.json`:

```json
{
  "nodes": [
    { "id": "crossing-naming-tension", "dir": "crossing-naming-tension", "title": "Crossing as Naming", "type": "view", "status": "active" }
  ],
  "edges": [
    { "source": "crossing-naming-tension", "target": "qino-world", "type": "curates", "context": "focal" },
    { "source": "crossing-naming-tension", "target": "crossing-threshold", "type": "curates" },
    { "source": "crossing-naming-tension", "target": "domain-language", "type": "curates" }
  ]
}
```

### Views vs. Sub-graphs

| | Sub-graph | View |
|---|---|---|
| Relationship | Containment -- parent owns children | Curation -- references existing nodes |
| Directory | Children live in `nodes/` under the parent | Included nodes live anywhere in the graph |
| File | `graph.json` in the node | `view.json` in the node |
| Edge type | Structural (directory hierarchy) | `curates` (index in `graph.json`) |
| Navigation | Enter the sub-graph (deeper scale) | Filter the graph (same scale, focused) |

### Framing as Communicative Act

Views represent a communicative act: **framing**. The agent's existing speech acts are:
- **Reading**: "I've been here"
- **Annotating**: "I notice this"
- **Creating**: "This should exist"

Views add: **Framing** -- "Let's think about these things together." Proposing a shared context for attention.

### View Lifecycle

A healthy workspace has 2-3 active views. They come and go as lines of inquiry open and close. When a view has served its purpose, it is composted (status change), not deleted. The graph remembers it.

---

## Journal Protocol

The journal is a timestamped trail of attention. Two locations, three scope types.

### Locations

| Location | Scope |
|----------|-------|
| Root `journal.md` | Workspace-level entries |
| `nodes/{id}/journal.md` | Node-scoped entries |

### Context Markers

Each journal entry carries a context marker as an HTML comment:

```markdown
<!-- context: {scope-type}/{identifier} -->
```

**Three scope types:**

| Scope | Format | Meaning |
|-------|--------|---------|
| Session | `session/{date}` | This entry relates to a session |
| Node | `node/{id}` | This entry relates to a specific node |
| View | `view/{id}` | This entry was made while working within a view's frame |

**Example with all three scopes:**

```markdown
## 2025-02-01 -- morning session

<!-- context: session/2025-02-01 -->

Starting a new exploration of how facets relate to ecosystem docs.

## qino-world observation

<!-- context: node/qino-world -->

The facets cluster into spatial and relational groups.

## inside crossing-naming-tension

<!-- context: view/crossing-naming-tension -->

Seeing these nodes together reveals the gap between the
functional name and the experiential quality.
```

### Routing

Context markers enable scoped display:
- Viewing a node in the UI shows entries marked `node/{that-id}` from any journal.
- Inside a view tab, entries marked `view/{that-id}` surface as the view's journal stream.
- Session entries provide the narrative timeline.

### Two Input Surfaces

Both the terminal (agent via MCP tools) and the browser (human via UI) write to the same journal files:

```
Terminal (agent)              Browser (human)
  |                              |
  | creation echoes              | observations
  | session context              | reflections
  |                              |
  +---------- journal.md --------+
              (same file)
```

Neither surface is primary. Both persist to the file system. Git tracks the evolution.

---

## Annotation Protocol

Annotations are the agent's signal channel. Numbered markdown files with front matter, stored in a node's `annotations/` directory.

### Signal Types

Ordered from quietest to most active:

| Signal | What it communicates | Character |
|--------|---------------------|-----------|
| `reading` | Agent interpreted the content | Quiet -- "I've been here" |
| `connection` | Agent found a link to another node | Navigational -- "this relates" |
| `tension` | Something unexpected or in productive conflict | Alerting -- "this doesn't fit" |
| `proposal` | Agent suggests what to try next | Actionable -- "there's a next step" |

Each answers a different question when scanning the graph:
- **reading**: Has the agent looked at this?
- **connection**: Does this link to something I should know about?
- **tension**: Is something worth attending to here?
- **proposal**: Is there a suggested move?

### File Format

`annotations/001-initial-reading.md`:

```markdown
---
author: agent
signal: reading
created: 2025-02-01T14:30:00Z
---

The resonance lens produced generic output despite rich substrate.
All substrate items came from a single modality -- cross-modal
diversity may be the missing variable.
```

With inline target:

```markdown
---
author: agent
signal: connection
target: crossing-threshold
created: 2025-02-01T15:00:00Z
---

The naming pattern here echoes what crossing-threshold describes
as ceremony. The functional name hides the experiential quality.
```

### Inline Rendering

Annotations with a `target` field render inline with the content they reference, placed after the target element in the reading flow. Annotations without a `target` render as general notes about the node.

### Graph-Level Signal Indicators

Nodes with annotations show small signal indicators in the graph view. A node can carry multiple signals (e.g., reading + proposal). Visual treatment is compact -- the graph stays scannable.

```
  +---------------------+
  | A Concept           | <> <>     reading + connection
  | active              |
  +---------------------+

  +---------------------+
  | Another Node        | <>        proposal
  | active              |
  +---------------------+
```

### Evolvability

Adding a new signal type means:
1. A new value in the signal vocabulary
2. A visual style entry in the renderer's signal config

No structural changes to the annotation format, graph component, or node data shape.

---

## Node Lifecycle

Nodes are not deleted. They transition through statuses defined by the workspace.

### Common Lifecycle Pattern

```
proposed  -->  active  -->  composted
   |                           ^
   +------ dormant -----------+
```

- **Active**: The default. Renders clean in the graph.
- **Proposed**: A possible future node. Renders with dashed treatment.
- **Dormant**: Not currently active but preserved for later. Renders dimmed.
- **Composted**: Has served its purpose. Fading -- recedes from the graph but stays in the file system as history.

### Status as Deviation

Only non-default statuses get visual treatment. Active nodes render clean. This keeps the graph uncluttered -- you notice what's different, not what's normal.

### Views Compost Too

When a view has served its purpose, it compostes like any other node. The curation remains in the file system. The graph remembers it but no longer foregrounds it.

---

## Voice Table

The protocol prescribes structure. Only the voice varies per workspace type.

| Aspect | Research | Concepts | Implementation |
|--------|----------|----------|----------------|
| Node = | Experiment | Concept / facet / arc | Feature / iteration |
| Story = | Hypothesis, motivation | What is this, why it matters | What problem, what approach |
| Content = | Config + results | Concept doc + facets | Code references + specs |
| Edges = | Experiment lineage | Cross-references, arc links | Dependencies, sequences |
| Agent voice | Analytical (signals, evidence) | Facilitative (threads, resonance) | Constructive (next steps, gaps) |
| Journal tone | Lab notebook | Reflective inquiry | Build log |

The structural protocol -- graph, journal, nodes, annotations -- is shared. The agent voice is the **only** thing that needs dedicated instructions per workspace type.

---

## Three Surfaces

All three surfaces wrap the same protocol reader. The reader handles all filesystem operations. Each surface is a thin wrapper translating between its transport and the reader's function signatures.

```
Protocol Reader (filesystem operations)
  |-- MCP Tools    (agent surface -- stdio JSON-RPC)
  |-- HTTP API     (browser surface -- Hono)
  +-- React UI     (human surface -- Vite SPA)
```

### MCP Tools (Agent)

| Tool | Purpose |
|------|---------|
| `read_graph` | Read root or sub-graph `graph.json` with node summaries and agent signals |
| `read_node` | Read full node detail: identity, story, content listing, annotations, view data |
| `read_config` | Read `.claude/qino-config.json` (workspace identity, type vocabulary) |
| `write_annotation` | Write an annotation to a node |
| `create_node` | Create a node directory, update `graph.json`, echo in journal |
| `write_journal_entry` | Append entry to root or node journal with context marker |

### HTTP API (Browser)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/config` | GET | Workspace config |
| `/api/graph` | GET | Root graph |
| `/api/graph/*path` | GET | Sub-graph by node path |
| `/api/nodes/:nodeId` | GET | Node detail |
| `/api/nodes/:nodeId/view` | GET | View data (focal + includes) |
| `/api/nodes` | POST | Create node |
| `/api/nodes/:nodeId/annotations` | POST | Write annotation |
| `/api/journal` | PUT | Save root journal |
| `/api/nodes/:nodeId/journal` | PUT | Save node journal |
| `/api/journal/checkpoint` | POST | Git commit journal changes |

### React UI (Human)

| Route | Purpose |
|-------|---------|
| `/` | Workspace index -- renders root `graph.json` as interactive graph |
| `/node/$id` | Node detail -- story, content, annotations, journal |

Sub-graph navigation: clicking a node with its own `graph.json` enters the sub-graph. View tabs: clicking a view filters the graph to focal + included nodes.

---

## Creating a Protocol-Compliant Workspace

Minimal workspace setup:

1. Create the root directory.
2. Add `.claude/qino-config.json` with `name` and optional `types`/`statuses`.
3. Add `graph.json` with `id`, `title`, empty `nodes[]` and `edges[]`.
4. Add `journal.md` (can be empty).
5. Create `nodes/` directory.
6. Add nodes: each is a directory under `nodes/` with at least `node.json` containing a `title`.

**Minimal `graph.json`:**

```json
{
  "id": "my-workspace",
  "title": "My Workspace",
  "nodes": [],
  "edges": []
}
```

**Minimal `node.json`:**

```json
{
  "title": "My First Node"
}
```

**Minimal `.claude/qino-config.json`:**

```json
{
  "name": "my-workspace"
}
```

When a node is added to the workspace:
1. Create `nodes/{name}/node.json` (+ optional `story.md`, `content/`).
2. Add a node entry to `graph.json` with matching `id` and `dir`.
3. Add edges to `graph.json` connecting the new node to existing nodes.
4. Optionally append an echo to `journal.md` with a context marker.

---

## Research-to-Protocol Migration Reference

For qino-lab's transition from research viewer to protocol reader:

| Research naming (iterations 01-03) | Protocol naming (iteration 04+) |
|------------------------------------|----------------------------------|
| `study.config.json` | `graph.json` |
| `observations.md` | `journal.md` |
| `experiments/*/` | `nodes/*/` |
| `experiment.config.json` | `node.json` |
| `story.md` | `story.md` (unchanged) |
| `config.json` + `results/` | `content/` |
| `annotations/` | `annotations/` (unchanged) |
| `read_research_config` | `read_graph` + `read_config` |
| `read_study` | `read_graph` |
| `read_experiment` | `read_node` |
| annotation signal `anomaly` | `tension` |
