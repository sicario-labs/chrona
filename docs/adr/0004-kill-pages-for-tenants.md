# ADR-0004: Kill Cloudflare Pages for tenant hosting

- **Status:** Accepted
- **Decision ID:** D2
- **Date:** 2026-08-16

## Context

Pages was used to host tenant docs. Root cause of the `chrona-docs.pages.dev` bug: Pages
**project names are globally unique and frozen after creation** — a name collision (likely
another account owning `chrona-docs`) broke the namespace and there was no recovery path.

## Decision

**Remove Pages entirely from the tenant hosting path.** Tenant sites are served by a single
edge Worker + R2 + Workers Cache + Durable Object alias registry (ADR-0005).

## Consequences

- No globally-frozen names in the tenant namespace; `{project}.chronadocs.xyz` is fully ours (ADR-0001).
- CLI no longer calls `wrangler pages deploy`; uploads go straight to R2 via SigV4 (1.13).
- D0.6 spike documents the `chrona-docs.pages.dev` ownership as the bug we killed.