# Contributing

Thanks for your interest in contributing to Qinolabs Community!

## Development Setup

### Prerequisites

- Node.js >= 20.19
- pnpm >= 10

### Getting Started

```bash
git clone https://github.com/qinolabs/community.git
cd community
pnpm install
```

### Development

```bash
pnpm dev          # Start qino-lab-mcp dev server + UI
pnpm check        # Typecheck + lint
pnpm test         # Run tests
pnpm format:fix   # Auto-format code
```

### Project Structure

```
community/
  packages/
    qino-lab-mcp/       # MCP server + React UI
      src/
        server/         # Hono HTTP + MCP server
        ui/             # React SPA (Vite)
      test/             # Vitest tests
  tooling/
    typescript/         # Shared tsconfig
    eslint/             # Shared ESLint config
    prettier/           # Shared Prettier config
```

### Pull Requests

1. Fork the repo and create a feature branch
2. Make your changes
3. Run `pnpm check && pnpm test` to verify
4. Open a PR against `main`

CI will run typecheck and tests automatically.

## Code Style

This project uses:
- **TypeScript** with strict mode
- **ESLint** for linting
- **Prettier** for formatting (auto-runs on commit via CI)
- **React Compiler** for optimization (no need for useMemo/useCallback)
