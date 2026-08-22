# ADR-0002: Cloudflare Workers Free tier as the hard spend cap

- **Status:** Accepted
- **Decision ID:** D11 (see also D0.2)
- **Date:** 2026-08-16

## Context

Workers Paid ($5/mo) is out of budget. The original plan assumed it was mandatory ("Free plan is
unusable"). Research (2026) shows the Free tier is workable for this product with the right
design, so we lock it as a hard constraint and design around it.

## Decision

**Stay on Cloudflare Workers Free.** Do not provision anything that requires Workers Paid.
Re-evaluate only when revenue exceeds ~$5/mo.

## Free-plan constraint table (verified 2026-08-16)

| Resource | Free limit | Impact on Chrona Sites |
|---|---|---|
| Requests | **100k/day** (resets 00:00 UTC) | Binding constraint. Mitigate with cache-first serving; HTML `max-age=60` + SWR 86400 so repeat traffic is cheap. Monitor vs. ceiling; escape hatches below. |
| CPU time | **10ms/invocation** (active compute only) | I/O waits (R2, KV, DO, cache) do **not** count. Edge hot path = hostname parse → cache lookup → R2 stream, all I/O-bound → well under budget. |
| Subrequests | 50/invocation | Cache + R2 serving path uses ~3-5. Fine. |
| Memory | 128 MB | Fine for streaming responses (zero-heap R2 body passthrough). |
| Worker size | 3 MB bundle | Watch better-auth + Hono when mounted on edge (Phase 2). |
| Workers / account | 100 | We use ~4 (edge, platform, builder, console). |
| Cron triggers | 5/account | Retention GC + Analytics rollup + health = ≤3. |
| **Durable Objects** | **SQLite-backed DOs on Free** (KV-backed DOs are Paid) | `DeployRegistry` (SQLite) is valid. KV-backed DOs forbidden. |
| **Queues** | **On Free since 2026-02-04**: 10k ops/day, 24h retention, up to 10k queues | Build queue valid; retention window shorter than Paid's 14 days — ensure consumer leases within 24h. |
| R2 | 10 GB-month storage, 1M Class A (write) / 10M Class B (read) ops/mo | Deploy store. Retention GC (Phase 7) becomes higher priority to stay under 10 GB. |
| KV | 1 GB, 100k reads/day, 1k writes/day | Only `CUSTOM_DOMAIN_MAP` (read cache). Fine; keep in-isolate route cache primary. |
| D1 | 5 GB, 5M rows read/day, 100k rows written/day | Control plane (Phase 2). Recommended over Neon (see ADR-0003 / 2.3). |
| Vectorize | 5M stored dims | AI-search namespace per project; keep small for MVP. |
| Workers AI | Free tier neurons/day | Embeddings in Phase 3. Watch quota. |
| Rate Limiting binding | **Paid-only** | Use a DO token bucket / edge logic instead (2.8). |
| Hyperdrive | **Paid-only** | Irrelevant — control plane goes D1 (ADR-0003). |
| Custom Hostnames (CF for SaaS) | **On Free**: 100 hostnames free, then $0.10/hostname/mo | Phase 5 viable on Free. Webhooks Enterprise-only → poll. |

## Escape hatches (if 100k req/day pressure arrives before revenue)

1. **Workers for Students**: 10M req/mo free for 12 months with a `.edu` email.
2. **Cloudflare Startup credits**: free-tier credits program.
3. **Promote cache-first / edge static serving** so more traffic never invokes the worker.

## Consequences

- All phase gates assume Free limits (already reflected in D0.2, 2.3, 2.8, 9.1, 9.2).
- The edge hot path must stay I/O-bound; any new synchronous CPU work (regex-heavy parsing,
  crypto on the hot path) is budgeted against 10ms.
- Revenue first, then upgrade — order of operations is fixed by cash flow, not preference.