# qino-lab Protocol Walkthrough

Manual feature walkthrough for testing the qino-lab browser UI and simulated agent interactions. Uses the `qino-concepts` workspace as the test case.

## Setup

### 1. Start the dev server

From the `qinolabs-mcp` directory:

```bash
pnpm dev
```

This starts:
- **Vite UI** on `http://localhost:3020` (opens automatically)
- **Hono API** on `http://localhost:4020` (proxied from Vite via `/api/`)

The `WORKSPACE_DIR` env var points to `../../../qino-concepts` (the qino-concepts workspace).

### 2. Verify the API is responding

```bash
curl http://localhost:4020/api/config
```

Expected: JSON with workspace config (or `{}` if no `.claude/qino-config.json` exists in qino-concepts).

```bash
curl http://localhost:4020/api/graph | jq '.title, (.nodes | length)'
```

Expected: `"qino concept space"` and `7`.

---

## Part 1: Browser UI Walkthrough

### 1.1 Graph View (landing page)

**Open** `http://localhost:3020`

**Verify:**

- [ ] Header bar shows **"qino concept space"** as the workspace title
- [ ] Header shows **"7 nodes"** count
- [ ] **Journal toggle** button is visible in the header (should be active by default)
- [ ] **Theme toggle** (sun/moon icon) works — switches between light and dark mode
- [ ] Graph renders with **7 nodes** arranged by React Flow auto-layout
- [ ] Nodes display their **title** and **status badge** (all should show "active" with green styling)
- [ ] **Edges** are visible connecting nodes (should be 10 edges total)
- [ ] Nodes are **draggable** (click and drag to reposition)
- [ ] **Zoom** works (scroll wheel or pinch)
- [ ] **Pan** works (click and drag on empty space)

**Node types to verify:**
| Node | Type | Expected color |
|------|------|----------------|
| qino World | concept | default style (neutral) |
| Domain Language | ecosystem | default style (neutral) |
| Ecosystem Design Principles | ecosystem | default style (neutral) |
| Emergence Lab | navigator | default style (neutral) |

> **Note:** All types except `completed`, `active`, `proposed`, `dormant` use the default status style. Since all nodes are `"active"`, they should display the active style (green indicator dot, "active" label).

### 1.2 Node Detail — Concept Node

**Click** the **"qino World"** node in the graph.

**Verify:**

- [ ] URL changes to `/node/qino-world`
- [ ] **Breadcrumb** shows `graph / qino World`
- [ ] Breadcrumb `graph` link navigates back to `/`
- [ ] **Prev/next arrows** (← →) appear in the breadcrumb bar
- [ ] **Title** displays "qino World"
- [ ] **Status badge** shows "active" with green styling
- [ ] **Metadata row** shows: date (if set), type "concept", any tags
- [ ] **Story section** renders the story.md as markdown (should contain the concept impulse text)
- [ ] **Content section** appears with heading "Content"
- [ ] Content includes **concept.md** rendered as markdown (the full concept document)

### 1.3 Node Detail — Navigator Node

**Navigate** to **"Emergence Lab"** node.

**Verify:**

- [ ] Story section renders the navigator's purpose/territory description
- [ ] Content section shows multiple files if present (terrain.md, reading-order.md)
- [ ] Each content file renders with appropriate formatting

### 1.4 Prev/Next Navigation

From any node detail view:

- [ ] **← arrow** navigates to the previous node in graph.nodes order
- [ ] **→ arrow** navigates to the next node
- [ ] **First node** has no ← arrow
- [ ] **Last node** has no → arrow
- [ ] Navigation preserves scroll position (starts at top of new node)

### 1.5 Journal Panel

**Navigate** back to the graph view (`/`). Ensure the journal toggle is active.

**Verify:**

- [ ] **Right panel** (340px wide) shows the journal
- [ ] Journal heading shows "Journal"
- [ ] **Sections** from journal.md are displayed:
  - "2026-02-02 — seeding: what we learned" section should be visible
- [ ] Section content renders as **markdown** (headings, bold, lists)
- [ ] **Context markers** (`<!-- context: session/2026-02-02 -->`) are parsed and used for context routing (not displayed as raw HTML)
- [ ] **Add section** functionality works — click to add a new journal section
- [ ] **Editing** a section allows you to modify the markdown content
- [ ] **Save** persists changes (writes to journal.md on disk)

### 1.6 Journal Context Routing

- [ ] On the **graph view** (`/`), journal shows entries with context "graph"
- [ ] On a **node view** (`/node/qino-world`), journal highlights entries whose context matches `node/qino-world`
- [ ] Context markers in journal.md (`<!-- context: node/qino-world -->`) control which entries highlight per route

### 1.7 Journal Toggle

- [ ] Click the **"journal"** button in the header to **hide** the journal panel
- [ ] URL gains `?journal=false` parameter
- [ ] Content area expands to **full width**
- [ ] Click again to **show** the journal panel
- [ ] URL loses the `?journal=false` parameter

### 1.8 Theme Toggle

- [ ] Click the **theme toggle** icon
- [ ] All UI elements switch between light and dark mode
- [ ] Graph nodes, edges, badges, journal panel all respect the theme
- [ ] Preference persists on page reload

---

## Part 2: Simulated Agent Interactions (Terminal)

These simulate what happens when a qino agent interacts with the workspace via MCP tools. Since we can't invoke MCP tools directly from the terminal, we use the HTTP API (which calls the same `protocol-reader` functions).

### 2.1 Agent Reads the Graph

```bash
curl -s http://localhost:4020/api/graph | jq '{
  title: .title,
  nodeCount: (.nodes | length),
  edgeCount: (.edges | length),
  nodeTypes: [.nodes[].type] | unique,
  journalSections: (.journalSections | length)
}'
```

Expected:
```json
{
  "title": "qino concept space",
  "nodeCount": 7,
  "edgeCount": 10,
  "nodeTypes": ["concept", "ecosystem", "navigator"],
  "journalSections": 1
}
```

### 2.2 Agent Reads a Specific Node

```bash
curl -s http://localhost:4020/api/nodes/qino-world | jq '{
  id: .id,
  title: .identity.title,
  type: .identity.type,
  hasStory: (.story != null),
  contentFiles: [.contentFiles[].filename],
  annotationCount: (.annotations | length),
  hasSubGraph: (.identity.hasSubGraph // false)
}'
```

Expected:
```json
{
  "id": "qino-world",
  "title": "qino World",
  "type": "concept",
  "hasStory": true,
  "contentFiles": ["concept.md"],
  "annotationCount": 0,
  "hasSubGraph": false
}
```

### 2.3 Agent Reads a Sub-Graph

```bash
curl -s "http://localhost:4020/api/graph?path=nodes/qino-world" | jq '{
  title: .title,
  nodes: [.nodes[] | {id, title, type}],
  edges: (.edges | length)
}'
```

Expected:
```json
{
  "title": "qino World facets",
  "nodes": [
    {"id": "crossing-threshold", "title": "Crossing Threshold", "type": "facet"},
    {"id": "attunement", "title": "Attunement", "type": "facet"},
    {"id": "crossing", "title": "Crossing", "type": "facet"},
    {"id": "positioning", "title": "Positioning", "type": "facet"}
  ],
  "edges": 2
}
```

### 2.4 Agent Reads a Sub-Graph Node

```bash
curl -s "http://localhost:4020/api/nodes/crossing-threshold?path=nodes/qino-world" | jq '{
  id: .id,
  title: .identity.title,
  type: .identity.type,
  hasStory: (.story != null),
  contentFiles: [.contentFiles[].filename]
}'
```

Expected:
```json
{
  "id": "crossing-threshold",
  "title": "Crossing Threshold",
  "type": "facet",
  "hasStory": true,
  "contentFiles": ["crossing-threshold.md"]
}
```

### 2.5 Agent Writes a "reading" Annotation

This is the key bidirectional test. The agent writes an annotation to a node, then we verify it appears in the browser.

```bash
curl -s -X POST http://localhost:4020/api/nodes/qino-world/annotations \
  -H "Content-Type: application/json" \
  -d '{
    "signal": "reading",
    "body": "The three-layer separation (graph.json → node.json → story.md) mirrors how the concept itself thinks about identity: not stored, but recognized through multiple encounters at different scales."
  }' | jq .
```

Expected: JSON with `filename` (e.g., `001-reading.md`) and `path` to the created file.

**Verify in browser:**

1. Navigate to `/node/qino-world` (or refresh if already there)
2. An **"Agent Notes"** section should now appear below the content
3. The annotation should display with:
   - [ ] **"reading"** signal badge (blue styling)
   - [ ] The annotation body text rendered as markdown
   - [ ] The agent attribution label

**Verify on disk:**

```bash
cat ../../../qino-concepts/nodes/qino-world/annotations/001-reading.md
```

Expected frontmatter with `signal: reading`, followed by the body text.

### 2.6 Agent Writes a "connection" Annotation

```bash
curl -s -X POST http://localhost:4020/api/nodes/ecosystem-modality-tension/annotations \
  -H "Content-Type: application/json" \
  -d '{
    "signal": "connection",
    "body": "This node holds the same insight that ecosystem-design-principles names as \"boundaries of meaning\" — but from the opposite direction. Where the principle says \"don'\''t collapse levels,\" this node shows what it feels like to *hold* the levels apart.",
    "target": "ecosystem-modality-tension.md"
  }' | jq .
```

**Verify in browser:**

1. Navigate to `/node/ecosystem-modality-tension`
2. Since `target` points to a content filename:
   - [ ] The annotation appears **inline below that content file** (not in the general "Agent Notes" section)
   - [ ] Signal badge shows **"connection"** (purple styling)

### 2.7 Agent Writes a "tension" Annotation

```bash
curl -s -X POST http://localhost:4020/api/nodes/emergence-lab/annotations \
  -H "Content-Type: application/json" \
  -d '{
    "signal": "tension",
    "body": "The navigator maps territory for *building*, but the protocol gives no way to express cross-workspace edges. The file references from the original navigator (pointing into qinolabs-repo) are lost in translation. This tension between protocol legibility and cross-workspace reach is real."
  }' | jq .
```

**Verify in browser:**

1. Navigate to `/node/emergence-lab`
2. **Agent Notes** section shows:
   - [ ] **"tension"** signal badge (amber/orange styling)
   - [ ] The annotation body as markdown

### 2.8 Agent Writes a "proposal" Annotation

```bash
curl -s -X POST http://localhost:4020/api/nodes/qino-domain-language/annotations \
  -H "Content-Type: application/json" \
  -d '{
    "signal": "proposal",
    "body": "## Proposal: Add Protocol Vocabulary\n\n```json\n{\n  \"action\": \"extend\",\n  \"target\": \"domain-language\",\n  \"additions\": [\"node\", \"graph\", \"edge\", \"annotation\", \"signal\", \"journal\"]\n}\n```\n\nThe protocol introduces vocabulary (node, graph, edge, signal) that overlaps with but differs from the domain language. \"Node\" in protocol-space is a container; in domain-space it doesn'\''t exist. Propose adding a protocol vocabulary section that acknowledges both uses."
  }' | jq .
```

**Verify in browser:**

1. Navigate to `/node/qino-domain-language`
2. **Agent Notes** shows a **proposal card**:
   - [ ] Proposal card renders with distinct visual treatment
   - [ ] JSON config block is parsed and displayed as structured content
   - [ ] The reasoning text renders as markdown

### 2.9 Agent Signals Appear on Graph Nodes

**Navigate** back to the graph view (`/`).

- [ ] Nodes with annotations now show **signal indicators** on their graph cards
- [ ] `qino-world` shows a reading signal indicator
- [ ] `ecosystem-modality-tension` shows a connection signal indicator
- [ ] `emergence-lab` shows a tension signal indicator
- [ ] `qino-domain-language` shows a proposal signal indicator
- [ ] Nodes without annotations show no signal indicators

> **Note:** You may need to refresh the page to see updated graph data after writing annotations, since the graph view fetches data on mount.

---

## Part 3: Journal Bidirectional Channel

### 3.1 Human Writes in UI → File Updates

1. In the browser, ensure the journal panel is visible
2. **Add a new section** or edit the existing one
3. Add text like: `Testing human → file write at [current time]`
4. **Save** the journal

**Verify on disk:**

```bash
cat ../../../qino-concepts/journal.md | head -20
```

- [ ] New content appears in the file
- [ ] Existing sections are preserved
- [ ] Markdown formatting is maintained

### 3.2 Journal Checkpoint (Git Commit)

If the qino-concepts workspace is a git repo:

```bash
curl -s -X POST http://localhost:4020/api/journal/checkpoint | jq .
```

- [ ] Returns success with commit info
- [ ] A git commit is created in the qino-concepts repo with journal changes

**Verify:**

```bash
cd ../../../qino-concepts && git log --oneline -3
```

### 3.3 Agent Observation → UI Reflects

Simulate an agent appending to the journal by directly editing the file, then refreshing the UI:

```bash
cat >> ../../../qino-concepts/journal.md << 'EOF'

## 2026-02-02 — agent observation: testing protocol

<!-- context: node/qino-world -->

The protocol reader handles all 7 root nodes and the qino-world sub-graph with 4 facets. Content file discovery works — concept.md renders as markdown, story.md provides the impulse. Annotation writing creates the expected directory structure. The signal taxonomy (reading, connection, tension, proposal) maps cleanly to the visual treatments in the UI.
EOF
```

**Verify in browser:**

1. **Refresh** the page (or navigate away and back)
2. New journal section should appear: **"2026-02-02 — agent observation: testing protocol"**
3. When on `/node/qino-world`, this section should be **highlighted** (its context marker matches)
4. When on the graph view, this section should still be visible but not highlighted

---

## Part 4: Edge Cases

### 4.1 Missing Node

```bash
curl -s http://localhost:4020/api/nodes/nonexistent-node | jq .
```

- [ ] Returns `404` with `{"error": "Node not found"}`
- [ ] Browser shows error message if navigated to `/node/nonexistent-node`

### 4.2 Invalid Sub-Graph Path

```bash
curl -s "http://localhost:4020/api/graph?path=nodes/nonexistent" | jq .
```

- [ ] Returns `404` with `{"error": "No graph.json found"}`

### 4.3 Invalid Annotation Signal

```bash
curl -s -X POST http://localhost:4020/api/nodes/qino-world/annotations \
  -H "Content-Type: application/json" \
  -d '{"signal": "invalid-signal", "body": "test"}' | jq .
```

- [ ] Returns `400` error (signal validation rejects unknown values)

### 4.4 Empty Content Node

Some lightweight nodes may have no content files — only story.md.

- [ ] Navigate to a node without content files
- [ ] No "Content" section heading appears (or it's empty gracefully)
- [ ] Story section still renders correctly

### 4.5 Unknown Status String

If a node had a custom status like `"archived"` (not in the known set):

- [ ] Status badge uses **default neutral styling** (no crash)
- [ ] Label shows the status string as-is

### 4.6 Annotation with Orphaned Target

Write an annotation targeting a filename that doesn't exist in the node's content:

```bash
curl -s -X POST http://localhost:4020/api/nodes/qino-world/annotations \
  -H "Content-Type: application/json" \
  -d '{
    "signal": "reading",
    "body": "This annotation targets a non-existent file.",
    "target": "nonexistent-file.md"
  }' | jq .
```

**Verify in browser:**

1. Navigate to `/node/qino-world`
2. The orphaned-target annotation should appear in the **"Agent Notes"** section (with general/untargeted annotations)
3. It should NOT cause an error or missing content

---

## Part 5: Cleanup

After testing, you may want to remove test artifacts:

```bash
# Remove annotations created during testing
rm -rf ../../../qino-concepts/nodes/qino-world/annotations/
rm -rf ../../../qino-concepts/nodes/ecosystem-modality-tension/annotations/
rm -rf ../../../qino-concepts/nodes/emergence-lab/annotations/
rm -rf ../../../qino-concepts/nodes/qino-domain-language/annotations/

# Restore journal.md to its original state
cd ../../../qino-concepts && git checkout journal.md
```

---

## Summary of Surfaces Tested

| Surface | Tested Via | Sections |
|---------|-----------|----------|
| **Graph rendering** | Browser | 1.1 |
| **Node detail (concept, navigator)** | Browser | 1.2, 1.3 |
| **Navigation (prev/next, breadcrumbs)** | Browser | 1.2, 1.4 |
| **Journal panel (read, edit, save)** | Browser | 1.5, 1.6, 1.7 |
| **Theme toggle** | Browser | 1.8 |
| **Agent reads graph** | curl → HTTP API | 2.1 |
| **Agent reads node** | curl → HTTP API | 2.2 |
| **Agent reads sub-graph** | curl → HTTP API | 2.3, 2.4 |
| **Agent writes annotation (4 signal types)** | curl → HTTP API | 2.5, 2.6, 2.7, 2.8 |
| **Annotations render in UI** | Browser after curl | 2.5–2.8 |
| **Signal indicators on graph** | Browser | 2.9 |
| **Human → file (journal save)** | Browser + disk check | 3.1 |
| **Journal checkpoint (git)** | curl → HTTP API | 3.2 |
| **File → UI (journal refresh)** | Disk edit + browser | 3.3 |
| **Error handling** | curl + browser | 4.1–4.6 |
