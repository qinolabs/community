# qino-lab-mcp

MCP server + browser UI for qino-lab research operations. Provides Claude Code with tools to read, annotate, and checkpoint research studies.

## Setup

### From source (monorepo development)

Requires the qinolabs monorepo with dependencies installed (`pnpm install`).

Add to your `.mcp.json`:

```json
{
  "mcpServers": {
    "qino-lab": {
      "command": "node",
      "args": [
        "--import", "tsx",
        "/path/to/qinolabs-repo/mcp/qino-lab-mcp/src/server/index.ts"
      ],
      "cwd": "/path/to/qinolabs-repo",
      "env": {
        "RESEARCH_DIR": "/path/to/research"
      }
    }
  }
}
```

The `cwd` must point to a directory where `tsx` is installed in `node_modules`. In the monorepo, that's the repo root.

### Built distribution (self-contained)

Build the server and UI:

```bash
pnpm -F @qinolabs/qino-lab-mcp build
```

This produces `dist/server/index.js` (bundled, no external deps) and `dist/ui/` (SPA assets).

Add to your `.mcp.json`:

```json
{
  "mcpServers": {
    "qino-lab": {
      "command": "node",
      "args": ["/path/to/qino-lab-mcp/dist/server/index.js"],
      "env": {
        "RESEARCH_DIR": "/path/to/research"
      }
    }
  }
}
```

No `cwd`, no `tsx`, no monorepo required.

## Configuration

All options can be set via environment variables or CLI arguments. CLI arguments take the same precedence as env vars (first match wins).

| Option | Env var | CLI arg | Default | Description |
|--------|---------|---------|---------|-------------|
| Research directory | `RESEARCH_DIR` | `--research-dir` | `./research` (relative to cwd) | Path to research data |
| Git repo root | `REPO_ROOT` | `--repo-root` | Auto-detected from `RESEARCH_DIR` | Git root for checkpoint commits |
| HTTP port | `PORT` | `--port` | `4020` | Port for the browser UI and API |
| Skip browser | — | `--no-browser` | `false` | Don't auto-open browser in dev mode |

### Git repo root

The checkpoint tool commits observation changes to git. It needs to know the repository root to compute relative paths for `git add`.

By default, the server runs `git rev-parse --show-toplevel` from the research directory at startup. This works when the research data lives inside a git repo (the common case).

Override with `REPO_ROOT` when:
- The research directory is outside the git repo
- You want checkpoint commits to go to a different repo
- The auto-detection doesn't find the right root (e.g., nested git repos)

## Development

### Dev mode (HTTP + hot reload)

```bash
# Server only (auto-restarts on changes)
pnpm -F @qinolabs/qino-lab-mcp dev:server

# Server + browser UI (Vite dev server with HMR)
pnpm -F @qinolabs/qino-lab-mcp dev
```

The dev server runs on `http://localhost:4020` (API) and `http://localhost:3020` (UI with Vite proxy).

### Testing changes in Claude Code

MCP stdio mode doesn't support hot reload — the process must restart to pick up changes. After editing source files:

1. Run `/mcp` in Claude Code to reconnect (restarts the server)
2. Test the tools

### Recommended workflow

1. **Iterate** with `pnpm dev:server` — edit code, test via `curl localhost:4020/api/config`
2. **Integrate** — switch to Claude Code, run `/mcp`, test tools in conversation
3. Repeat

The HTTP API mirrors the MCP tools (same `research-ops` functions), so if the HTTP route works, the MCP tool will too.

## Architecture

```
src/server/
  index.ts          Entry point — mode detection, config, server setup
  mcp-tools.ts      MCP tool registrations (thin wrappers)
  http-api.ts       Hono HTTP routes (thin wrappers)
  research-ops.ts   Core logic — pure filesystem operations
  types.ts          Shared types
  open-browser.ts   Browser launch utility
```

The server detects its mode from stdin:
- **Non-TTY** (Claude Code pipes stdio) → MCP server + HTTP server
- **TTY** (terminal) → HTTP server only, opens browser

Both modes start the HTTP server so the browser UI is always available.

## MCP Tools

| Tool | Description |
|------|-------------|
| `read_research_config` | List all studies in the workspace |
| `read_study` | Get study graph structure, observations, and annotation counts |
| `read_experiment` | Get full experiment detail: story, config, results, annotations |
