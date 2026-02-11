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

## Pull Requests

1. Fork the repo
2. Create a feature branch (`git checkout -b my-feature`)
3. Make your changes
4. Run `pnpm check && pnpm test` to verify
5. Push to your fork and open a PR against `main`

CI will run typecheck and tests automatically.

## UI Components

This project uses [`@qinolabs/ui-core`](https://www.npmjs.com/package/@qinolabs/ui-core), a generic component library built on Base UI + Tailwind CSS. It's maintained in a separate repository and published to npm.

If you need a new component or changes to an existing one, please [open an issue](https://github.com/qinolabs/community/issues) describing the need.

## Local Development with ui-core

When testing unreleased ui-core changes against qino-lab-mcp locally, you can use pnpm overrides to link to a local checkout:

```jsonc
// In community/package.json — add temporarily, do NOT commit
{
  "pnpm": {
    "overrides": {
      "@qinolabs/ui-core": "link:../path-to/ui-core"
    }
  }
}
```

Then run `pnpm install` to pick up the linked version. Remember to remove the override before committing.

## Code Style

This project uses:
- **TypeScript** with strict mode
- **ESLint** for linting
- **Prettier** for formatting (auto-runs on commit via CI)
- **React Compiler** for optimization (no need for useMemo/useCallback)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
