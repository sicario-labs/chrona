# Chrona

**Repository intelligence for your codebase.**

Chrona is a focused repository-intelligence engine that reads your source code
directly — indexing symbols, building a dependency & call graph, and generating
virtual documentation pages and ⌘K symbol search from your own repository.

This workspace is a lean extraction of the Chrona core, trimmed to the packages
that power the docs app:

- `apps/docs` — the Chrona app & demo site (Next.js)
- `packages/engine` — `@chrona/engine` (AST & symbol index)
- `packages/graph` — `@chrona/graph` (dependency & call graph)
- `packages/intelligence` — `@chrona/intelligence` (repository knowledge graph → source)
- `packages/core` — `chrona-core` (page tree & MDX runtime)
- `packages/mdx` — `chrona-mdx` (compiler & plugins)
- `packages/base-ui` — `@chrona/base-ui` (UI components, imported as `chrona-ui`)
- plus `tailwind`, `typescript`, `twoslash`, `openapi`, `story`, `satteri`, etc.

## Getting Started

```bash
pnpm install
pnpm --filter docs dev
```

## Development

```bash
pnpm build        # turbo build across packages & docs
pnpm --filter docs build
pnpm types:check  # turbo typecheck
pnpm lint
pnpm test         # vitest
```

All packages are **ESM only**.

## License

MIT
