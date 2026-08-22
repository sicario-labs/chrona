# ADR-0009: Auth = better-auth (device authorization, bearer, api-key, organization)

- **Status:** Accepted
- **Decision ID:** D7
- **Date:** 2026-08-16

## Context

The CLI needs a headless login flow; the dashboard needs sessions; machines need API keys; and
teams need orgs. Clerk (the boilerplate's default) has **no device-authorization flow** (RFC
8628) — the exact mechanism needed for `chrona login` on a dev machine. better-auth is already
vendored in `apps/platform` with GitHub OAuth + Neon working.

## Decision

**Standardize on better-auth** and enable the **device-authorization**, **bearer**, **api-key**,
and **organization** plugins. Billing stays a separate Bachs integration (ADR-0011), not a
better-auth plugin.

## Consequences

- `chrona login` uses the RFC-8628 device flow: user pastes a code on the dashboard, grants,
  the CLI polls and stores creds `chmod 0600`.
- API keys (`chr_` prefix, SHA-256 at rest) feed M2M deploys from CI.
- Session *or* API-key auth on every `/api/*` route (2.7); tenant scoping via orgs (2.4).