# ADR-0005: Tenant serving topology — single edge Worker + R2 + Workers Cache + DO alias registry

- **Status:** Accepted
- **Decision ID:** D3
- **Date:** 2026-08-16

## Context

Tenant sites must support unlimited tenants without per-tenant infrastructure, with instant
promote/rollback. Alternatives: per-tenant Pages (killed, ADR-0004), per-tenant Workers
(too many workers), pure KV routing (eventual consistency).

## Decision

**One edge Worker (`chrona-edge`) serves all tenants.** Deploy snapshots live in R2
(`{tenant}/deploys/{deploy_id}/{path}`). A per-tenant Durable Object (SQLite) is the alias
registry authority. Responses are cached via Workers Cache with `deploy_id` in the cache key.

## Consequences

- Hostname→tenant resolution happens in the Worker (router.ts); `{tenant}.chronadocs.xyz` and
  custom hostnames converge on the same worker (Phase 5).
- Aliases flip atomically via DO RPC → next request under the old cache key misses (ADR-0006).
- Hot path is I/O-bound (cache + R2), staying inside the 10ms Free CPU budget (ADR-0002).