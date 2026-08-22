# ADR-0010: SaaS console UI = shadcn preset `b1LOZzCAgS` (Vite + TanStack Router)

- **Status:** Accepted
- **Decision ID:** D8 + D8b
- **Date:** 2026-08-16

## Context

The existing platform UI was rejected and deleted (P0). A premium dashboard is a differentiator
(Phase 4). Two candidate bases existed:
1. **Fork `ixartz/SaaS-Boilerplate`** (MIT) and port it onto Vite + TanStack Router.
2. **Scaffold a fresh app with a shadcn preset** and compose the dashboard from preset primitives.

The user explicitly chose **the shadcn preset** and dropped the boilerplate fork.

## Decision

**Build `apps/console` as a new Vite app initialized with `shadcn init --preset b1LOZzCAgS`.**
The preset yields: style **`radix-rhea`** (radix-ui primitives), **phosphor** icon library,
**Oxanium + Figtree** variable fonts, `oklch` stone-neutral design tokens with a `.dark` twin,
`rounded-2xl` component radii, and a no-FOUC `ThemeProvider` — a complete, opinionated design
base. Router = **TanStack Router** (already in repo, file-based via `createFileRoute` +
`@tanstack/router-cli`).

## Consequences

- No third-party boilerplate to sever/diverge or re-license; preset is MIT + our own additions.
- The design base comes "as the preset ships" (D8) — we compose Chrona-specific components
  (`DeploymentRow`, `LiveLogViewer`, `DomainCard`, …) on top of preset primitives (4.7) rather
  than hand-rolling tokens.
- App lives at `apps/console`; `apps/platform` stays API-only (better-auth + Hono + Drizzle).
- Reuses existing Vite + TanStack Router infra; no Next.js runtime anywhere.
- do NOT import the fork's Clerk/Stripe patterns — auth is better-auth (ADR-0009), billing is
  Bachs (ADR-0011).