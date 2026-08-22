# ADR-0012: Custom domains = Cloudflare for SaaS (Custom Hostnames)

- **Status:** Accepted
- **Decision ID:** D10
- **Date:** 2026-08-16

## Context

Pro tenants attach their own domains (`docs.acme.com`) with automated DNS + SSL. This needs
per-customer cert issuance and proxied routing, plus a fallback origin.

## Decision

**Use Cloudflare for SaaS (Custom Hostnames) on the `chronadocs.xyz` zone with the edge Worker
as the fallback origin.** Verified free-plan facts (2026):
- **Available on the Free plan**; first **100 custom hostnames free**, then $0.10/hostname/mo.
- Hostname **webhooks are Enterprise-only → poll** `GET /custom_hostnames` for `status` + `ssl.status`
  both `active`.
- Needs a fallback origin (proxied A/CNAME on the zone).
- Apex domains require CNAME-flattening; unsupported apex without Enterprise (5.4).
- Cert issuance ~15/min with a lockout window (D0.8 spike).

## Consequences

- Fully free under 100 hostnames — fits ADR-0002 spend cap.
- Gated to Pro (ADR-0011) so the $0.10/hostname cost is covered by revenue.
- Per-hostname `hostMetadata` → project mapping feeds `resolveTenantFromHostname` on the edge.