# ADR-0003: Control plane database = D1

- **Status:** Accepted and executed (2026-08-17) — control plane migrated to D1 (`chrona-control`, edge worker).
- **Decision ID:** D2.3
- **Date:** 2026-08-16

## Context

The control plane needs a relational DB (tenants, projects, deploys, domains, env_vars,
api_keys, build_jobs, events). Options: Neon/Postgres (already vendored in `apps/platform` with
Drizzle), or Cloudflare D1.

## Decision

**Use D1** (Cloudflare-native, free tier 5 GB / 5M rows read / 100k rows written per day).

## Why not the alternatives

- **Postgres via Hyperdrive**: Hyperdrive requires Workers Paid (ADR-0002) — out of budget.
- **Neon free tier**: a second billable vendor with tight free limits; adds a network hop and
  connection-pooling complexity the Free plan would struggle with.

## Consequences

- Drizzle works with both drivers; swap cost is low if a future paid tier makes Postgres worth it.
- D1 reads/writes carry per-tenant scoping (Phase 7 isolation audit).
- Reuse the `DeployRegistry` DO-SQLite pattern for the token-bucket rate limiter (2.8) rather
  than D1 (which would burn its write quota).