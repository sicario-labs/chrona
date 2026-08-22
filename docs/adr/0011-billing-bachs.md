# ADR-0011: Billing = Bachs.io

- **Status:** Accepted
- **Decision ID:** D9
- **Date:** 2026-08-16

## Context

The product needs Starter (free) / Pro / Enterprise plans with hosted checkout, trials,
proration, metered usage, and webhooks as source of truth. Stripe was considered but Bachs is
already integrated (pricing page "Powered by Bachs.io", `organizations.bachsCustomerId`).

## Decision

**Bachs is the billing backend.** Key semantics (see plan appendix):
- **No direct create-subscription endpoint** — subscriptions exist only after a customer
  completes a recurring-product checkout.
- Money = **decimal string + ISO 4217** (never minor units).
- **Webhooks are the source of truth** — never client-side events/redirects.
- Sandbox `https://sandbox-api.bachs.io` (`sk_sandbox_*`) vs prod `https://api.bachs.io`
  (`sk_live_*`); go-live = key swap after verification.

## Consequences

- Plan gating reads from D1 (webhook-synced), not live Bachs calls (6.5).
- Custom domains gated to Pro; CF-for-SaaS cost $0.10/hostname/mo (ADR-0012).
- Meter `chrona_builds` + `chrona_docs_requests`; do not bill R2 egress (free).
- Full cheat-sheet lives in the plan appendix; keep `pricing.tsx` ($0 / $49/mo per project,
  14-day trial) in sync with the Bachs catalog.