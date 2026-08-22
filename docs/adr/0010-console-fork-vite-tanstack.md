# ADR-0010: SaaS console UI = fork SaaS-Boilerplate → port to Vite + TanStack Router

- **Status:** Accepted
- **Decision ID:** D8 + D8b
- **Date:** 2026-08-16

## Context

The existing platform UI was rejected and deleted (P0). A premium dashboard is a differentiator
(Phase 4), but building auth/orgs/RBAC/dashboard patterns from scratch is slow. Router must be
type-safe for `/projects/:id/deployments/:deployId` IA.

## Decision

**Fork `ixartz/SaaS-Boilerplate` (MIT) into `apps/console` and port it onto the existing Vite +
TanStack Router stack.** Old platform UI is gone; `apps/platform` stays API-only (better-auth +
Hono + Drizzle control plane). Router = **TanStack Router** (already in repo, file-based via
`createFileRoute` + `@tanstack/router-cli`).

## Consequences

- Fork is "harvest-don't-track": copy the patterns we need, diverge immediately; document
  borrowed files with license headers (4.4).
- Do NOT import the Next.js runtime; port Clerk → better-auth (ADR-0009), Drizzle models.
- Reuses existing Vite + TanStack Router infra instead of a second migration (React Router v7
  would be a migration off something working).