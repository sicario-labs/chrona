# ADR-0007: Alias registry authority = per-tenant Durable Object (SQLite)

- **Status:** Accepted
- **Decision ID:** D5
- **Date:** 2026-08-16

## Context

The alias map (`prod`/`preview` → `deploy_id`) must flip instantly and consistently. KV is
eventually consistent (~60s skew) and limited to 1 write/s/key — unsafe for "instant flip" and
a correctness hazard under deploy bursts.

## Decision

**One `DeployRegistry` Durable Object per tenant** (`idFromName(tenant)`), SQLite-backed, as
the authority for `aliases` + `deploys`. KV (`CUSTOM_DOMAIN_MAP`) is only a read-cache fallback
for custom-domain hostnames; the in-isolate route cache (10s TTL) sits in front.

## Consequences

- SQLite-backed DOs are on the Workers Free plan (ADR-0002) — no paid tier needed.
- DO writes are serialized → no lost updates on concurrent promote/rollback.
- Control surface RPCs: `promote`, `promotePreview`, `rollback`, `pinVersion`, `getRoute`,
  `list`, `deleteDeploy` (1.5).
- KV read skew is tolerable because KV only mirrors *custom-domain→tenant* mappings, not
  alias→deploy_id; alias flips go through the DO directly.