# qinolabs-mcp

MCP server + browser UI for working with [qino-protocol](./PROTOCOL.md) workspaces. Provides Claude Code with tools to read, annotate, and manage graph-structured knowledge bases.

## Setup

### From source

```bash
git clone https://github.com/qinolabs/community.git
cd community
pnpm install
```

Add to your `.mcp.json`:

```json
{
  "mcpServers": {
    "qino-lab": {
      "command": "node",
      "args": [
        "--import", "tsx",
        "/path/to/community/packages/qinolabs-mcp/src/server/index.ts"
      ],
      "cwd": "/path/to/community"
    }
  }
}
```

The `cwd` must point to a directory where `tsx` is installed in `node_modules`.

### Built distribution

Build the server and UI:

```bash
pnpm build
```

This produces `dist/server/index.js` (bundled) and `dist/ui/` (SPA assets).

```json
{
  "mcpServers": {
    "qino-lab": {
      "command": "node",
      "args": ["/path/to/community/packages/qinolabs-mcp/dist/server/index.js"]
    }
  }
}
```

No `cwd`, no `tsx` required.

## Configuration

All options can be set via environment variables or CLI arguments.

| Option | Env var | CLI arg | Default | Description |
|--------|---------|---------|---------|-------------|
| Workspace directory | `WORKSPACE_DIR` | `--workspace-dir` | Auto-detected | Path to qino-protocol workspace |
| HTTP port | `PORT` | `--port` | `4020` | Port for the browser UI and API |
| Skip browser | — | `--no-browser` | `false` | Don't auto-open browser in dev mode |

## Development

```bash
# Server only (auto-restarts on changes)
pnpm dev:server

# Server + browser UI (Vite dev server with HMR)
pnpm dev
```

The dev server runs on `http://localhost:4020` (API) and `http://localhost:3020` (UI with Vite proxy).

## Architecture

```
src/server/
  index.ts          Entry point — mode detection, config, server setup
  mcp-tools.ts      MCP tool registrations (thin wrappers)
  http-api.ts       Hono HTTP routes (thin wrappers)
  ops.ts            Core logic — filesystem operations
  types.ts          Shared types
  open-browser.ts   Browser launch utility
```

The server detects its mode from stdin:
- **Non-TTY** (Claude Code pipes stdio) → MCP server + HTTP server
- **TTY** (terminal) → HTTP server only, opens browser

## MCP Tools

| Tool | Description |
|------|-------------|
| `read_config` | Read workspace configuration |
| `read_graph` | Read graph structure, nodes, edges, journal |
| `read_node` | Read full node detail with annotations |
| `create_node` | Create a new node in the graph |
| `write_annotation` | Write an agent annotation to a node |
| `write_journal_entry` | Append to workspace or node journal |
| `resolve_annotation` | Update annotation lifecycle status |
| `update_view` | Update a curated view's composition |

See [PROTOCOL.md](./PROTOCOL.md) for the workspace structure and [WALKTHROUGH.md](./WALKTHROUGH.md) for a guided tour.
