# ADR-0006: Cache invalidation via `deploy_id` in the Workers Cache key

- **Status:** Accepted
- **Decision ID:** D4
- **Date:** 2026-08-16

## Context

Promote/rollback must take effect globally and instantly. Cloudflare's cache purge is slow and
region-coordinated; per-URL purge calls on every deploy are expensive and racy. Hand-rolled
"probabilistic revalidation" (TTL jitter) gave stale-window semantics.

## Decision

**Put `deploy_id` in the Workers Cache key** (`cf.cacheKey = /{tenant}/{deployId}/{pathname}`).
The router resolves the *current* alias to a `deploy_id`, then serves from a cache partition
keyed by that id. Promoting = writing a new alias → old deploy_id's cached entries are
automatically orphaned and replaced on the next request.

## Consequences

- Zero purge calls; rollback is just another alias write (ADR-0005).
- Cache key URL is synthetic (not fetchable) — used only as a partition key with `caches.default`.
- Implemented as the "cache loopback" in `apps/edge/src/router.ts` (1.9).