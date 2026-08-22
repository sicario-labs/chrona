# ADR-0001: Tenant namespace domain = `chronadocs.xyz`

- **Status:** Accepted
- **Decision ID:** D1
- **Date:** 2026-08-16

## Context

Chrona Sites needs a tenant namespace domain (`{project}.<domain>`). `chronadocs.dev` is the
ideal (HSTS-preloaded, dev-branded) but costs more than budget allows. `.com` is likewise out of
budget. The namespace is the single hardest-to-migrate asset: every deployed URL embeds it.

## Decision

Use **`chronadocs.xyz`**. Enforce HTTPS at the Cloudflare zone level (Always Use HTTPS + HSTS
header) because `.xyz` is **not HSTS-preloaded** — we cannot rely on browser-forced HTTPS.

## Consequences

- Branding is weaker; acceptable for a budget launch.
- Any future TLD upgrade (e.g. `chronadocs.dev`) must keep the same tenant namespace to avoid
  rewriting every customer URL. Document that migration cost now; do not promise a domain change.
- Zone must be set to **Full (Strict)** TLS with a valid origin cert.
- HSTS: serve `Strict-Transport-Security` on the zone (via header rule) so browsers upgrade to
  HTTPS even though `.xyz` lacks a preload entry.