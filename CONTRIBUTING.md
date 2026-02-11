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
pnpm dev          # Start qinolabs-mcp dev server + UI
pnpm check        # Typecheck + lint
pnpm test         # Run tests
pnpm format:fix   # Auto-format code
```

### Project Structure

```
community/
  packages/
    qinolabs-mcp/       # MCP server + React UI
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

## Maintainers

### Publishing @qinolabs/ui-core

ui-core lives in the private monorepo and is published to npm via [changesets](https://github.com/changesets/changesets).

```bash
# 1. After making changes to packages/ui-core/
pnpm changeset              # describe the change (patch/minor/major)

# 2. When ready to release
pnpm changeset version      # bumps version + generates CHANGELOG
pnpm -F @qinolabs/ui-core build
cd packages/ui-core && pnpm publish --no-git-checks   # requires OTP
```

Dependabot monitors `@qinolabs/ui-core` weekly and opens PRs in this repo when a new version is published.

### Cross-repo development

To test unreleased ui-core changes against this repo before publishing:

```jsonc
// Temporarily add to community/package.json — do NOT commit
{
  "pnpm": {
    "overrides": {
      "@qinolabs/ui-core": "link:../qinolabs-repo/packages/ui-core"
    }
  }
}
```

Then `pnpm install` to pick up the linked version. After verifying, remove the override, publish ui-core, and update the dependency normally.

### Handling Dependabot PRs

When Dependabot opens a ui-core version bump PR:

1. Check the CHANGELOG for breaking changes
2. Verify CI passes (typecheck + tests run automatically)
3. Merge if green

### Architecture overview

```
qinolabs-repo (private)              community (public)
├── packages/ui-core/                ├── packages/qinolabs-mcp/
│   published to npm ──────────────►│   consumes from npm
├── .changeset/                      ├── .github/dependabot.yml
│   version management               │   watches for ui-core updates
└── packages/ui-apps/ (private)      └── tooling/ (self-contained)
```

There is no sync between repos. This repo is the single source of truth for qinolabs-mcp. The private monorepo is the source of truth for ui-core.

## Code Style

This project uses:
- **TypeScript** with strict mode
- **ESLint** for linting
- **Prettier** for formatting (auto-runs on commit via CI)
- **React Compiler** for optimization (no need for useMemo/useCallback)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
