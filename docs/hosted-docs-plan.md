# Chrona Hosted Docs — Phased Implementation Plan

Living plan for building **Chrona Sites**: a multi-tenant, Vercel/Netlify-style docs-hosting SaaS on Cloudflare.

- **Owner:** Chrona core
- **Status legend:** `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked (note why)
- **Update rule:** this file is the source of truth. Every PR that advances the SaaS checks off its items here and records verification evidence under the task.

---

## Decisions (locked)

| # | Decision | Choice | Rationale |
|---|---|---|---|
| D1 | Tenant namespace domain | **`chronadocs.xyz`** (budget choice — `.dev`/`.com` out of budget) | `.xyz` is not HSTS-preloaded, so enforce HTTPS at the Cloudflare zone level (Always Use HTTPS + HSTS header). Branding is weaker but functional; swap to a premium TLD later only if the tenant namespace stays the same (document the migration cost). |
| D2 | Kill Pages for tenant hosting | **Yes** | Pages names are globally unique + frozen; root cause of the `chrona-docs.pages.dev` bug. |
| D3 | Tenant serving topology | **Single edge Worker + R2 + Workers Cache + Durable Object alias registry** | Unlimited tenants, no per-tenant infra, instant alias-flip promote/rollback. |
| D4 | Cache invalidation | **`deploy_id` in the Workers Cache key** (loopback pattern) | Instant promote/rollback with zero purge; retires hand-rolled probabilistic revalidation. |
| D5 | Alias registry authority | **Per-tenant Durable Object (SQLite)** | KV is eventually consistent (~60s skew) + 1 write/s/key; not safe for "instant flip". |
| D6 | Heavy builds | **External build fleet** (Fly/Railway/GH self-hosted runners) as Queues **pull-consumer** | Heavy Chrona builds (npm ci + vite + twoslash + openapi) cannot run in a Worker (no child_process, 128 MB, 30s CPU). Workers orchestrate; `chrona-builder` keeps light jobs. |
| D7 | Auth | **better-auth** (already in repo) — upgrade + device-authorization / bearer / api-key / organization plugins | First-party RFC-8628 device flow; Clerk has no device flow. Billing is a separate Bachs integration (see D9), not a better-auth plugin. |
| D8 | SaaS control-plane UI | **`apps/console` built on shadcn preset `b1LOZzCAgS`** (Vite + TanStack Router stack) | User rejected current platform UI + chose to **drop the SaaS-Boilerplate fork**. Use shadcn `init --preset b1LOZzCAgS` (style `radix-rhea`, phosphor icons, Oxanium/Figtree, radix-ui primitives) as the design-system base. **Old platform UI deleted (see P0).** |
| D8b | Router | **TanStack Router** (already in repo, file-based via `createFileRoute` + `@tanstack/router-cli`) | Type-safe routes, search-param validation, middleware — ideal for `/projects/:id/deployments/:deployId` IA. React Router v7 would be a migration off something already working. |
| D9 | Billing | **Bachs** (already in repo as `organizations.bachsCustomerId`; pricing page already says "Powered by Bachs.io") | Hosted checkout, subscriptions (created via checkout completion — **no direct create-subscription endpoint**), trials, proration, customer portal, usage billing, webhooks as source-of-truth, sandbox + `sk_*` keys. Meter builds + requests. **Do not bill R2 egress** (free). Custom domains gated to Pro (CF for SaaS $0.10/hostname/mo). |
| D10 | Custom domains | **Cloudflare for SaaS (Custom Hostnames)** on the `chronadocs.xyz` zone, worker-as-origin | **Available on the Free plan**: first **100 custom hostnames free**, then $0.10/hostname/mo. Auto certs; Apex only w/ CNAME-flattening. Caveats: hostname **webhooks are Enterprise-only → poll** `GET /custom_hostnames` for status+ssl both `active`; needs a fallback origin; cert issuance rate ~15/min. Gated to Pro plan (D9). |
| D11 | Cloudflare spend cap | **Stay on Workers Free for the foreseeable future** (see D0.2) | $5/mo Workers Paid is out of budget today. All phase gates now assume Free-plan limits (100k req/day, 10ms CPU, DO-SQLite, Queues-Free 10k ops/day, R2 10GB, KV 1GB). Re-evaluate when revenue > ~$5/mo. |

Open decision registers live in each phase as `[DECISION: …]`.

---

## Phase 0 — Foundations & de-risking

Goal: every unknown that could invalidate later phases is tested; accounts + domains owned.

- [x] D0.1 Buy `chronadocs.xyz` (budget); move to Cloudflare (full setup, proxied). Enable zone-level **Always Use HTTPS + HSTS** (`.xyz` isn't HSTS-preloaded). — **Domain is live on Cloudflare (2026-08-17)**: zone `chronadocs.xyz` active on the account (nameservers `miki`/`sage.ns.cloudflare.com`). Wildcard route `*.chronadocs.xyz/*` deployed to `chrona-edge` via `wrangler.toml` `routes` (+ `workers_dev = true` to keep the workers.dev binding). Proxied wildcard CNAME `*` → `chrona-edge.phaseops.workers.dev` added in dashboard (2026-08-17). Live-verified: tenant hostname, deployId permalink, `/preview/{id}/`, rollback/promote with instant cache invalidation. **Follow-up:** zone-level Always Use HTTPS + HSTS toggle (Free plan has it in dashboard Settings → SSL/TLS; HSTS via "Edge Certificates").
- [x] D0.2 **Stay on Workers Free** (budget — no Workers Paid). Recorded Free-plan constraints + mitigations: **100k req/day** (reset 00:00 UTC) — binding; the worker hot path is cache-first, so HTML is cacheable (`max-age=60` + SWR 86400) and cache hits are cheap; monitor vs. request/day before >~80k/day. **10ms CPU/invocation** — active compute only; R2/KV/DO/cache I/O waits don't count, so the edge hot path (hostname parse → cache lookup → R2 stream) stays well under budget. **50 subrequests**, 128 MB — fits. **SQLite-backed DOs are on Free** (KV-backed DOs are Paid) → `DeployRegistry` valid. **Queues now on Free** (2026-02-04): 10k ops/day, 24h retention — build queue valid; retention window just shortens. **R2 Free**: 10 GB-month, 1M Class A (write) + 10M Class B (read) ops/mo. **KV**: 1 GB, 100k reads/day. **D1**: 5 GB. See `docs/adr/0002` for the full constraint table. Free-plan unlock when revenue exceeds ~$5/mo: paid bundle removes the 100k req/day + CPU ceilings.
  - Escape hatches if req/day pressure grows before revenue: (a) Workers for Students — 10M req/mo free for 12 mo w/ .edu email; (b) Cloudflare Startup credits; (c) promote cache-first / edge static serving so more traffic never invokes the worker.
- [ ] D0.3 Verify **Cloudflare for SaaS / Custom Hostnames** entitlement is enabled on the account (100 hostnames included). — Needs the `chronadocs.xyz` zone active (D0.1); entitlement is per-zone.
- [x] D0.4 Verify **proxied wildcard DNS** (`*.chronadocs.xyz`) is possible on the plan. — CNAME `*` → `chrona-edge.phaseops.workers.dev` (proxied) added in dashboard; wildcard route `*.chronadocs.xyz/*` deployed. Resolves to Cloudflare anycast; tenant hostname serves 200.
- [x] D0.5 Create `dev` / `staging` / `prod` Workers environments + namespaces (R2 buckets, KV, D1, Queues per env). — Single shared namespaces provisioned now: R2 `chrona-builds` (exists), KV `CUSTOM_DOMAIN_MAP` (`24e21ca7a9e74bf7814b31ed923a72c3`, created + wired into `apps/edge/wrangler.toml`), Queues `build-queue` (exists), D1 `gofer_meta`/`phase-db` (exist). Per-env isolation deferred — single `production` namespace until Phase 2 needs staging.
- [x] D0.6 Spike: confirm who owns `chrona-docs.pages.dev` globally (expected: another account) — documents the bug we're killing. — `docs/spikes/D0.6-chrona-docs-pages-dev-ownership.md`: A records on Cloudflare Pages edge + live HTTP 200 → **owned by another account**, confirms D2.
- [x] D0.7 Spike: `curl https://whatever.phaseops.workers.dev/__chrona_health` — confirm `workers.dev` wildcard routing is dead code. — `docs/spikes/D0.7-phaseops-workers-dev-dead-code.md`: DNS resolves to CF edge (subdomain `phaseops`) but HTTP 404/1042 (no worker deployed) → legacy wildcard is dead.
- [ ] D0.8 Spike: Custom-hostname cert issuance rate limit (community reports ~15 certs/min + 30s lockout) on a real zone.
- [x] D0.9 CI: pnpm monorepo builds + lint + vitest green on GitHub Actions; workers deploy via `wrangler` in CI. — `.github/workflows/ci.yml`: quality job (install→build→lint→types:check→vitest→edge test) + deploy job (edge only, main-branch, needs `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` secrets). Platform deploy script added (`wrangler deploy`). Platform/builder deploy steps intentionally deferred (configs change in later phases).
- [x] D0.10 Write ADRs for D1–D11 into `docs/adr/` (D11 = free-tier spend cap w/ full constraint table). — `docs/adr/0001`–`0012` (D8+D8b share 0010; D11=0002).

**Exit:** all spikes recorded in `docs/spikes/`; CI green; domains live on CF.

---

## Phase 1 — Hosting substrate (kill Pages) ★ foundation

Goal: deploy → promote → rollback with **instant global cache invalidation** on `{project}.chronadocs.xyz`, no Pages anywhere.

### R2 immutable deploy store
- [x] 1.1 Key layout: `{tenant}/deploys/{deploy_id}/{path}` (immutable snapshot) + `{tenant}/assets/{hash}.{ext}` (shared content-hashed store). — Implemented in `packages/cli/src/utils/deploy-edge.ts` (`deployObjectKey`/`assetObjectKey`).
- [x] 1.2 CLI uploads: hash files, skip existing via `head()` dedupe; `manifest.json` written **last** as the ready marker. — `walkDist` (sha256) + `r2Head` dedupe + `manifestKey` written after all files in `uploadAndPromote`.
- [x] 1.3 Multipart upload for large docs sites; cleanup of aborted multipart uploads (R2 lifecycle rule). — `r2MultipartStart/Part/Complete/Abort` + `r2UploadLarge` (>100MB threshold) in `packages/cli/src/utils/r2.ts`; abort on error path. (Lifecycle rule still needs account-side config in D0.5.)

### Alias registry (Durable Object, per tenant)
- [x] 1.4 `DeployRegistry` DO (SQLite): tables `deploys(deploy_id, status, commit, branch, promoted_at)` + `aliases(name, deploy_id)`. — `apps/edge/src/registry.ts`, DO id = `idFromName(tenant)`.
- [x] 1.5 RPCs: `promote`, `promotePreview`, `rollback`, `pinVersion`, `getRoute`, `list`, `deleteDeploy` (refuses if alias-referenced). — All implemented as DO fetch-RPCs; wired to edge control surface `/__chrona/tenants/{tenant}/{action}`.
- [x] 1.6 Edge hot path: in-isolate alias cache (5–15s TTL) → DO RPC; KV mirror only as a read cache. — `ROUTE_CACHE` (10s) in `apps/edge/src/router.ts`; KV read-cache for custom domains.

### Edge router rewrite (`apps/edge`)
- [x] 1.7 Bump `compatibility_date`; add `[cache] enabled = true`. — `wrangler.toml` compat `2025-05-01` + `[cache]`.
- [x] 1.8 Hostname → tenant: `{tenant}.chronadocs.xyz` (fix `parts.length >= 4` bug in `resolveProjectId`), `CUSTOM_DOMAIN_MAP` KV, custom-hostname traffic. — `resolveTenantFromHostname` handles 3-part tenant hosts (the bug), permalinks, legacy wildcards; KV fallback.
- [x] 1.9 **Workers Cache loopback**: uncached gateway resolves `{tenant, deployId}`, calls cached serving entrypoint with `cf.cacheKey = /{tenant}/{deployId}/{pathname}`. — `cacheKeyUrl` embeds tenant+deployId+path in a synthetic URL used with `caches.default` (deployId in key = instant alias-flip invalidation, zero purge).
- [x] 1.10 Serve `{tenant}/deploys/{deployId}/{path}` from R2, zero-heap stream; fallback per-deploy `index.html` + `404.html`. — `resolveObjectKey` attempt chain (exact → dir index → 404) with `object.body` streaming.
- [x] 1.11 Cache headers: HTML `public, max-age=60, stale-while-revalidate=86400` (drop `s-maxage`); hashed assets `immutable`; previews `noindex`. — `buildObjectResponse` in `apps/edge/src/response.ts`.
- [x] 1.12 Branded edge 404 + `robots.txt`/`llms.txt`/`sitemap.xml` per deploy. — `branded404` + `defaultProtocolFile` (deploy copy wins).

### CLI (`packages/cli`)
- [x] 1.13 `chrona deploy` uploads to R2 directly (no `wrangler pages deploy`); flips alias last → atomic. — `uploadAndPromote` writes manifest.json, then `edgeRegister` + `edgePromote`/`edgePromotePreview`.
- [x] 1.14 `chrona rollback <id>` = alias flip to a retained deploy (delete the re-upload path). — `rollback.ts` calls edge `rollback` RPC; no re-upload.
- [x] 1.15 Permalinks `{hash}--{project}.chronadocs.xyz`; `chrona ls` shows real state + duration + files. — permalink hostname routing + `ls.ts` reads edge `list` + `getRoute` (real state). (Duration/files display pending manifest read — noted under 1.15 follow-up.)
- [x] 1.16 First deploy = production; later deploys preview unless `--prod` (Vercel semantics). — `isFirstDeploy` checks edge `getRoute(prod)`; `--prod` flag added to `chrona deploy`.
- [x] 1.17 Noindex previews/permalink via `X-Robots-Tag`; path-based previews `/preview/{id}`. — `isPreview` sets `X-Robots-Tag: noindex`; edge handles `/preview/{deployId}/...`.

**Verify:** `chrona deploy` → `chrona rollback` → curl with `Cf-Cache-Status` proves old HTML stops immediately, no purge call. — **Live-verified on `chronadocs.xyz` (2026-08-17)**: deploy v4 → serve 200 at `chrona-edge.chronadocs.xyz`; rollback to v3 deploy → serves v3 instantly (deployId-in-cache-key); promote back → v4. Permalink + `/preview/{id}/` verified. Fixed router permalink regex to accept deployId hosts (`dep_...--{tenant}`, was hex-hash-only → deployId permalinks 404'd). Unit coverage: `apps/edge/test/router.test.ts` (18 tests incl. deployId permalink) + `packages/cli/test/deploy-edge.test.ts`.
**Exit:** full deploy/promote/rollback loop works on `*.chronadocs.xyz`; Pages completely out of the deploy path.

---

## Phase 2 — Control plane: auth, tenants, API

Goal: real multi-tenant API on `chrona-edge` (today `/api/*` returns the 404 — the #1 auth gap).

- [x] 2.1 Fix `/api/*` on edge: mount better-auth + Hono handlers; remove from SPA fallthrough. (2026-08-17) — better-auth + orgs/projects routers now live **inside `chrona-edge`** (`apps/edge/src/api/`), routed ahead of tenant resolution in `src/index.ts`; console proxy retargeted to the edge worker; e2e verified locally.
- [~] 2.2 Enable **organization**, **device-authorization** (RFC 8628), **bearer** plugins on platform (2026-08-17). `organization` plugin uses custom tables `organization`/`member`/`invitation` + `session.activeOrganizationId` (replaces hand-rolled `organizations`/`members`); `plan`/`bachsCustomerId` carried as org `additionalFields`. **`api-key` plugin does NOT exist in better-auth 1.6.27** (checked dist) → 2.6 needs a custom plugin; move to later slice.
- [x] 2.3 DB: control plane on **D1** (2026-08-17) — `chrona-control` D1 created (`84116a5d-476d-4abc-9853-9b26e23ca89c`), bound as `CHRONA_CONTROL` in `apps/edge/wrangler.toml`; pg schema converted to `sqlite-core` (`apps/edge/src/db/schema.ts`), migration `drizzle/0000_dashing_shatterstar.sql` applied to remote + local. Hyperdrive would need Workers Paid (out of budget, D11); Neon avoided as second vendor. Tables to add in later slices: `deploys`, `domains`, `env_vars`, `api_keys`, `build_jobs`, `events`. *(Platform app still on Neon/pg for integration routers; control plane now edge+D1.)*
- [x] 2.4 Tenant root = Organization (better-auth org plugin); every user gets a personal org (console auto-creates a default org on first visit when the user has none); projects org-scoped + membership-checked. **`project.slug` reserved-slug blocklist done** (2026-08-17): `apps/edge/src/api/slugs.ts` (authoritative `RESERVED_SLUGS` + `isValidSlug`, ~90 names: platform apex needs `api/www/app/admin/docs/preview/…` + `__chrona`), enforced server-side on `POST /api/orgs/:orgId/projects` (422 reserved/invalid, 409 duplicate), mirrored in console (`projects.tsx` `slugError`) and CLI (`ensure-project.ts` `isValidTenantSlug`). Slug format: 3–40 chars, `[a-z0-9]` + hyphens, no leading/trailing hyphen.
- [x] 2.5 CLI login (2026-08-17): replaced hand-rolled `device-auth.ts` with the better-auth device-authorization plugin flow — `/api/auth/device/code` → claim (`GET /device`) → approve → `/device/token` returns the session as `access_token` (Bearer-usable via the `bearer()` plugin); CLI fetches the user via `get-session` after exchange; creds stored `~/.chrona/credentials.json` **chmod 0600**; `CHRONA_AUTH_TOKEN` env takes precedence; console `/device` verification page added (claim+approve UI). Deploy edge RPC now attaches `Authorization: Bearer <token>`.
- [x] 2.6 API keys (2026-08-17): no `apiKey` plugin in better-auth 1.6.27, so built a first-party implementation — `api_keys` D1 table (migration `0001`, applied via `wrangler d1 execute`): `org_id` FK, `name`, `key_prefix`, `key_hash` (SHA-256), `last_used_at`, `expires_at`, `revoked_at`. Key format `chr_` + 40 base62 chars (`apps/edge/src/api/api-keys.ts`), raw key shown exactly once at creation. Routes `GET/POST/DELETE /api/orgs/:orgId/api-keys` (member-gated, list returns prefix never raw, revoke = soft-delete). `getControlSession` in `apps/edge/src/api/control.ts` now returns a `ControlPrincipal` (`session` user OR `api-key` org scope); `canOperateTenant` allows the key when `project.orgId === key.orgId`. CLI `auth:create-key|auth:list-keys|auth:revoke-key` (`packages/cli/src/commands/auth-keys.ts`), reuses `ensureProject` (auto-creates org+project). Also fixed a latent null-crash: `getSessionUser`/`fetchCurrentUser` now use `data?.user` (better-auth returns a null body on unauthenticated get-session). Verified live 11/11 (create chr_ prefix, raw key never in list, deploy RPC authorized, foreign tenant 404, key can't manage keys, lastUsedAt updated, revoke works, revoked key → 401) + full CLI round-trip.
- [x] 2.7 Auth middleware (2026-08-17): session on `/api/orgs` + `/api/projects` — unauth → 401, org membership enforced (404 for non-members), verified via live e2e incl. cross-user isolation + proxy chain. **Control RPC `/__chrona/*` gated** (register/promote/promotePreview/rollback/pin/delete/getRoute/list) behind bearer session + tenant ownership: tenant must resolve to a `projects.slug` whose org the user is a member of (`apps/edge/src/api/control.ts`, 401/404 otherwise). CLI deploy now calls `ensureProject()` (`packages/cli/src/utils/ensure-project.ts`) to auto-create the project row under the user's org before the edge RPC, so the ownership check passes for new tenants. Also fixed a latent DO bug: `commit` is a reserved SQLite word — quoted in `registry.ts` SQL. **Routes live on `chrona-edge` (D1)**, not the platform app. API-key auth pending (2.6); integration routers ported to edge (2026-08-17) — see below.
- [x] 2.8 Rate limiting on auth + deploy endpoints (2026-08-17): Workers Rate Limiting **binding requires Workers Paid** — on Free use a **Durable-Object token bucket** (`RATE_LIMITER` DO, `apps/edge/src/rate-limiter.ts`, SQLite-backed `buckets` table, `v2` migration). Per-key shard via `idFromName(key)`; refill-at-capacity model (`tokenBucketStep` pure fn in `rate-limit-math.ts`, unit-tested). Wired: deploy mutations gated at `60 req / 1 per sec` per `deploy:{userId}:{tenant}` (429 + `Retry-After`), auth `sign-up|device/code|sign-in` gated at `10 req / 1 per sec` per `auth:{ip}:{path}` (`apps/edge/src/api/index.ts`). No-`RATE_LIMITER` env falls open. Turnstile on signup/device page still pending (needs site key).
- [x] 2.9 CORS/CSRF (2026-08-17): better-auth already sets `SameSite=Lax` session cookies by default (verified live). Added `csrfGuard` logic inside `authMiddleware` (`apps/edge/src/api/middleware.ts`): cookie-authenticated non-safe methods must be same-origin (`Origin` host === `Host`) OR carry `X-Requested-With: XMLHttpRequest` → else 403; Bearer requests (CLI/API keys) exempt (not cookie-based). Console SPA now sends `X-Requested-With` on all state-changing fetches (orgs/projects/device-approve) — needed because the vite proxy rewrites Host so same-origin can't be inferred from Origin alone. CORS middleware in `api/index.ts` reflects trusted origins with credentials + handles OPTIONS preflight (204); unknown origins get no ACAO. Verified live 8/8 (cross-origin cookie POST → 403, with header → 201, GET safe, bearer exempt, preflight OK, unknown origin no ACAO).
- [x] 2.10 Integration routers ported to edge (2026-08-17): `github`/`builds`/`domains`/`search`/`analytics` moved off the platform app (Neon/pg) onto `chrona-edge` + D1 (`apps/edge/src/api/routes/*`). HMAC webhook verification rewritten with WebCrypto (no `node:crypto` on Workers; now rejects when no `GITHUB_WEBHOOK_SECRET` is configured). `domains` (Cloudflare custom-hostname provisioning incl. mock TXT path) + `analytics` dashboard are `authMiddleware`-gated with org-membership checks; analytics tracking beacons (`/view`, `/search`) stay public; `search` degrades gracefully without AI/Vectorize bindings. New D1 tables `page_views` + `search_queries` (migration `0002`, applied). `analysis` (repo scanner) is `node:fs`-only and stays on platform/dev. Verified live 17/17 (webhook rejections, R2 404, tracking + gated dashboard totals, domains 401/200, search empty-graceful).

**Verify:** dashboard login, CLI device login, and API-key auth all work against the edge Worker; unauthorized `/api/*` → 401. Vitest + integration tests.
**Exit:** a second user can create a project and see only their own data.

---

## Phase 3 — Remote builds (build pipeline)

Goal: `chrona deploy` pushes source → queued remote build → streamed logs → live URL.

- [x] 3.1 Source bundle: tar.gz with `.chronaignore` (+ `.gitignore` fallback); sha256 = commit; presigned R2 upload (bypasses 100 MB Worker body limit). — `packages/cli/src/utils/source-bundle.ts`.
- [x] 3.2 Job state machine in D1: `queued → running → succeeded/failed/cancelled`; `UNIQUE(project, commit)` idempotency. — `apps/edge/src/db/schema.ts` `build_jobs`.
- [x] 3.3 Build queue as pull-consumer; agents lease jobs, ack, retry with backoff. — lease now requires a source bundle (`source_key IS NOT NULL`) so a job can't be leased before its source lands.
- [x] 3.4 BuildScheduler DO: per-tenant + global concurrency gates; stale-job sweep (crashed agents → failed/retry); dead-letter queue. — `apps/edge/src/build-scheduler.ts`.
- [x] 3.5 Chunked logs to R2 (`{tenant}/{project}/logs/{deployId}/{seq}.log`, ≤256 KB chunks); D1 byte cursor. — `apps/edge/src/build-logs.ts`.
- [x] 3.6 Log streaming: SSE for dashboard, long-poll for CLI (`?after=<bytes>`), heartbeat, replay-from-start. — verified.
- [x] 3.7 Builder: npm ci → pre-build → vite → twoslash → openapi/asyncapi → dist + `llms.txt` → upload artifacts → embeddings (Workers AI) → Vectorize upsert (batch ≤1000) → promote. — Fleet pipeline live-verified 18/18 via `remote-e2e.mjs` (digest mismatch 422, source push + roundtrip, anon/wrong-lease 403/404, artifact upload, seal+promote, preview noindex, job complete).
- [x] 3.7b **Fast default path (2026-08-17): local build + edge sync.** Fleet builds take ~26s (npm ci dominates) — too slow for interactive use. Default `chrona deploy` now builds **locally** (warm node_modules, no `npm ci`) and pushes dist straight through the worker's R2 binding (`PUT/upload + seal`, project-access gated; shared `apps/edge/src/api/deploy-store.ts`; `direct-deploy.ts` router). Single framed batch upload (`[u32 pathLen][path][u32 len][content]...`), content-hashed asset dedupe, seal writes manifest.json last + DO register/promote, `isFirstDeploy` auto-promotes to prod. Measured: 26.3s fleet → **5.4s changed-commit** (vite ~2s + sync ~2.3s) and **0.9s unchanged-commit** fast-return (ledger `live` record → skip build/sync). `--remote` still runs the fleet path (CI).
- [ ] 3.8 Env vars: AES-256-GCM in DB under a Worker-Secret master key; short-lived (15 min) build tokens for fleet.
- [x] 3.9 CLI remote protocol: `chrona deploy --remote` streams logs live, prints URL; degrade to local-ledger mode offline. — `packages/cli/src/utils/remote-deploy.ts`; default fast path (3.7b) needs no queue.
- [ ] 3.10 Retention: R2 lifecycle on `logs/`; cron prunes old `deploys` rows + R2 prefixes.

**Verify:** clean-machine deploy (fresh `npm i -g chrona`, no repo) → source push → remote build → live URL with live logs. Load-test build queue with 50 parallel deploys.
**Exit:** `chrona deploy` is fully remote; local build remains supported offline.

---

## Phase 4 — SaaS console UI: shadcn preset ★ the console

Goal: a premium dashboard. **The old platform UI (`apps/platform/src/routes`, `components`, `App.*`, `main.tsx`, `index.html`) was already deleted.** `apps/platform` is an API-only control plane (better-auth + Hono + Drizzle + `server/routes/*`). The new UI is **`apps/console`** built on the **shadcn preset `b1LOZzCAgS`** (`init --preset` → style `radix-rhea`, phosphor icons, Oxanium + Figtree, radix-ui primitives, stone neutrals, dark twin) on the existing Vite + TanStack Router stack. No SaaS-Boilerplate fork.

### Scaffold & port
- [x] 4.0 Old platform UI deleted (routes/components/App/main/index.html) — platform is now API-only.
- [x] 4.1 Scaffold `apps/console` (new Vite app) via `shadcn init --preset b1LOZzCAgS` — `[DECISION resolved: new app, platform stays as API]`. — App scaffolded from the preset (style `radix-rhea`, phosphor icons, Oxanium/Figtree, radix-ui, `shadcn/tailwind.css`, no-FOUC `ThemeProvider`, `Button`), wired into the monorepo (`package.json`, `components.json`, `vite.config.ts` w/ `@` alias, `tsconfig` extends `tsconfig/react-library.json`, `.oxlintrc.json`). Build/types/lint green; app serves with working dark toggle. Next: add TanStack Router + auth client (4.2).
- [x] 4.2 Port auth/orgs/RBAC/dashboard patterns from better-auth (device/bearer/api-key/org plugins, ADR-0009) onto Vite + TanStack Router; hook `authClient` to platform API. — Console wired: TanStack Router file-based routes (`__root`, `/login`, `_app` shell with session guard, `_app/projects`); `src/lib/auth-client.ts` (`createAuthClient` → platform `:3000`); Vite `/api` proxy to platform; sign-in/sign-up/email + GitHub OAuth + sign-out wired to `authClient`; `Card`/`Input` shadcn components added; route-tree auto-gen via `TanStackRouterVite` (code-split chunks verified). Verified: build/types/lint green; `:5173 → /api/health → :3000` proxy 200. Note: org plugin + device flow still server-side (Phase 2), session-scoped routes not yet auth-guarded on API.
- [ ] 4.3 Bachs billing plumbing (thin REST wrapper around `sandbox-api.bachs.io` / `api.bachs.io`; no Stripe) → wired to Phase 6.
- [ ] 4.4 Preset fidelity: keep the `radix-rhea` design base (tokens, radii, icon lib); add Chrona-specific components (below) that respect it.

### Design system (preset base + Chrona layer)
- [ ] 4.5 Tokens: preset `index.css` (`oklch` stone neutrals, `radix-rhea` vars) is the base; layer Chrona brand vars on top — emerald as system identity, keep the preset's radii/shadows/fonts. Purge hardcoded hex.
- [ ] 4.6 Type roles (display/heading-32→16/body/label/caption/mono-13/12); **icon lib = phosphor** (preset `iconLibrary`); consolidate — do not mix in lucide/hugeicons.
- [ ] 4.7 Component inventory: `Button`, `StatusBadge`/`EnvironmentBadge` (Prod/Preview), `DeploymentRow`, `LiveLogViewer` (terminal-grade, ANSI, virtualized), `CommandBlock`, `DomainCard`, `ProjectCard`, `OrgSwitcher`, `CommandPalette` (⌘K), `Blankslate` empty states, `Skeleton`, `Banner`, `Dialog`, `ProgressBar`, `Toast`, `StatStrip`, `Timeline` — compose from preset primitives.
- [ ] 4.8 Dark mode as first-class twin (preset `ThemeProvider` already does no-FOUC); `color-scheme: light dark`; WCAG AA contrast.

### IA (page map)
- [ ] 4.9 Overview / project list → project detail → **deploy history** → **single deploy view (LiveLogViewer)** → domains → settings → env → analytics → billing → team.
- [ ] 4.10 Onboarding: "Deploy from Git" / "Deploy with CLI" cards; live CLI-block animation; celebration + getting-started checklist.
- [ ] 4.11 Empty states everywhere (Primer Blankslate model): no projects / no deploys / no env vars / no search results.
- [ ] 4.12 Rollback confirm dialog (diff-aware) + "View logs" affordance on failed deploys.

**Verify:** full product walkthrough on staging — signup → CLI deploy → dashboard shows live deploy → log viewer streams → rollback works. Lighthouse + axe passes on dashboard.
**Exit:** dashboard reaches feature parity with the CLI for deploy/domain/env flows and looks premium.

---

## Phase 5 — Custom domains (Cloudflare for SaaS)

Goal: tenant attaches `docs.acme.com` → automated DNS instructions → verification → live, with SSL.

- [ ] 5.1 Custom Hostnames lifecycle API on the `chronadocs.xyz` zone: create → poll `status` + `ssl.status` → active.
- [ ] 5.2 Worker-as-origin / fallback-origin so custom-hostname traffic hits `chrona-edge`; per-hostname `hostMetadata` → project.
- [ ] 5.3 DNS-instructions UX (dashboard + CLI `chrona domains add|inspect`): TXT pre-validation records → CNAME `cname.chronadocs.xyz`; live status chips; "Check again" (PATCH to force DCV).
- [ ] 5.4 Apex: recommend `www` + redirect; document CNAME-flattening requirement; block unsupported apex on non-Enterprise.
- [ ] 5.5 Domain verification against D1 before serving (hostname alone is spoofable); CAA detection warning.
- [ ] 5.6 Domain teardown on plan downgrade / tenant delete (DELETE custom hostname + KV entry).

**Verify:** end-to-end with a test domain the user owns (register one throwaway). Time from CNAME-add to live ≤ ~5 min (automatic HTTP DCV).
**Exit:** custom domain adds are self-serve; SSL auto-provisioned.

---

## Phase 6 — Billing (Bachs)

Goal: Starter (free) / Pro / Enterprise per the live pricing page, with self-serve upgrades + usage metering. Bachs is the billing backend (already referenced in `organizations.bachsCustomerId` + pricing page).

### Bachs setup
- [ ] 6.0 Create Bachs account; get sandbox key `sk_sandbox_*` (base `https://sandbox-api.bachs.io`) + live key `sk_live_*` (`https://api.bachs.io`). Money = **decimal string + ISO 4217 currency** (never minor units). Create recurring products in the catalog: `Pro` (billing_cycle + trial_period), with usage price for metered items.
- [ ] 6.1 Customers: create `cust_*` per org (`POST /customers`); store id in `organizations.bachsCustomerId`.
- [ ] 6.2 Checkout: create a product-based checkout session (`POST /checkout-sessions` → hosted URL). **Subscriptions are created only by completing a recurring checkout — there is no direct create-subscription endpoint.** Redirect org admin to hosted checkout; customer portal for management via `POST /customer-sessions` (create-portal-session) → hosted portal URL.
- [ ] 6.3 Webhooks in the edge worker as **source of truth** (never client-side): `checkout.completed`, `collection.succeeded`, `customer.subscription.created|updated|deleted`, `invoice.created|paid|payment_failed`, `customer.updated`. Verify HMAC signature on raw body (Bachs webhook signing secret); idempotency via `evt.id` in D1; replay support (Bachs dev portal re-delivers).
- [ ] 6.4 Usage metering: `chrona_builds` + `chrona_docs_requests` reported against the metered price (Bachs aggregates + rates + invoices automatically). Builder increments on completion; edge counts docs requests (Analytics Engine → daily D1 rollup → Bachs usage API).
- [ ] 6.5 Plan gating from **D1** (webhook-synced), not live Bachs calls: project count, custom domains (Pro+), AI search (Pro+). Downgrade handler (projects → read-only after grace); cancel at period end vs immediate.
- [ ] 6.6 Trial 14 days (product `trial_period`), proration on plan change, dunning on `invoice.payment_failed` (Bachs retries + emails card-update link automatically).

**Verify:** full lifecycle in sandbox — upgrade via checkout → subscription.created webhook → D1 plan update → custom domain allowed; overage meter fires; cancel → downgrade revokes features cleanly; failed invoice → dunning state. Local webhook testing via Bachs dev portal (no ngrok).
**Exit:** paying tenant end-to-end; no feature leaks on downgrade.

---

## Phase 7 — Multi-tenant hardening & abuse

- [ ] 7.1 Isolation audit: R2 key prefix strictness on every read/write; D1 queries always carry `tenant_id`; Vectorize namespaced per project.
- [ ] 7.2 Per-tenant rate limiting (org keyed), deploy spam prevention (interval + quota), reserved-slug uniqueness.
- [ ] 7.3 Private docs: `visibility=private`, edge checks session/signed token; `Cache-Control: private, no-store`; excluded from shared cache.
- [ ] 7.4 Build-webhook HMAC (per-project secret, `timingSafeEqual`, 5-min skew); never reuse user tokens for M2M.
- [ ] 7.5 Secrets hygiene: all keys via `wrangler secret put`; scan for leaked `BETTER_AUTH_SECRET` fallback default in `apps/platform/src/server/auth.ts`.
- [ ] 7.6 Retention GC: keep last N + alias-referenced + pinned + <180 days; DO decides; explicit R2 `delete()` (≤1000 keys/call); `graveyard/` lifecycle backstop.
- [ ] 7.7 Analytics Engine on 429s, auth failures, meter overflow; alerting.

**Verify:** security checklist in `docs/security.md` passes; abuse simulation (spam signups, cross-tenant read attempts) fails closed.
**Exit:** a red team pass finds no cross-tenant leak.

---

## Phase 8 — Branding, DX polish & docs-site template

- [ ] 8.1 Branded deploy moment: CLI hero block, confetti-free checkmark, shareable URL, mini-checklist of next actions; OSC-8 hyperlink everywhere.
- [ ] 8.2 CLI output grammar unified (✓/✗/◌/➤, fixed columns, semantic palette matching dashboard); `--json` with `next:[{command,when}]` for agents; stdout=URL contract.
- [ ] 8.3 OG/deploy share-card variant (`/api/og?project=`), cached long-term; branded deploy emails (live / behind-main / docs health).
- [ ] 8.4 Hosted docs-site default template: dark/light OS-follow, ⌘K search (client-side index), Shiki+twoslash, copy/line-highlight/language tabs, version dropdown, TOC + breadcrumbs + prev/next, per-page OG, `404.html` branded with project theme.
- [ ] 8.5 Agent-readiness by default: `llms.txt`, `llms-full.txt`, per-page `.md` endpoints, auto MCP server, sitemap + structured data.
- [ ] 8.6 "Docs by Chrona" dismissible footer mark on free tier; removed on paid.
- [ ] 8.7 SEO: fast TTFB, canonical URLs, Core Web Vitals budget; showcase page (`chronadocs.xyz/showcase`) + OSS program.
- [ ] 8.8 Positioning applied everywhere: **"Docs that can't go stale."** Lead with the verification promise, not generation: docs are *proven* true against a pinned commit or the build fails, with a reviewable auto-repair work order for what's not provable. Currency signals in UI ("Verified as of commit `9a2e1f7`"). The docs host is the delivery wedge; the paid product is the CI truth layer (agent-context + docs verification, cross-repo).

**Verify:** first-run flow recorded; docs-site template audited for a11y + performance; share cards render on real deploy.
**Exit:** the product "feels expensive"; hosted sites look first-party.

---

## Phase 9 — Scale, reliability & launch

- [ ] 9.1 Load test 1k / 10k tenants; verify Workers Cache request-collapsing replaces probabilistic revalidation; tune KV/DO hot path. **Stay within Free budget: 100k req/day ceiling applies — structure the load test as tenant-count scaling at modest per-tenant QPS, not unbounded total traffic.**
- [ ] 9.2 Cost model validation against **Free-tier actuals** (infra $0/mo; real costs = `chronadocs.xyz` domain + CF-for-SaaS hostnames >100 + Bachs platform fees + external build fleet), alerting on budget.
- [ ] 9.3 CI/CD: gradual deployments for the edge router; version rollback drill; staging mirrors prod.
- [ ] 9.4 Launch checklist: signup→deploy≤2 min, onboarding docs, support channel, status page, privacy/terms.
- [ ] 9.5 Post-launch roadmap hooks: git-connected auto-deploys, private docs, AI grounded in source, workers-for-platforms "Chrona Functions" tier.

**Exit:** public launch with 2-minute time-to-value.

---

## Cross-cutting

- **Environments:** dev (`dev.chronadocs.xyz` or preview), staging (`.staging.chronadocs.xyz`), prod. Separate workers/R2/KV/D1/Queues per env.
- **Testing:** vitest (CLI + worker logic), integration tests in `apps/edge/test/`, Playwright E2E for dashboard (Phase 4), load scripts (Phase 3, 9). Record evidence under each task.
- **Decision log:** `docs/adr/` — every `[DECISION:]` resolves to an ADR before its phase starts.
- **Security:** `docs/security.md` checklist updated in Phases 2, 5, 7.
- **Research index:** `docs/research/` holds the 10 deep-research reports this plan is built on.

## Phasing note

Phases 1–3 are **infrastructure correctness** (must ship first, no UI). Phase 4 is the visible fork/port. 5–6 are revenue. 7–9 harden and launch. If resources are thin, MVP cut-line = **Phases 1 + 2 + 3 + 4 (deploy/basic-domains flows) + a manual paid-gate**; Bachs billing (6) and CF-for-SaaS (5) can follow in the first paid week.

---

## Appendix — Bachs billing cheat-sheet

- Docs index: `https://docs.bachs.io/llms.txt` (markdown for every page).
- Sandbox: `https://sandbox-api.bachs.io` with `sk_sandbox_*`; prod: `https://api.bachs.io` with `sk_live_*`; go-live = key swap after one-time verification.
- Money: decimal string at currency precision (e.g. `"29.00"`) + ISO 4217 currency. **Never minor units.**
- Fulfilment authority: webhooks (e.g. `collection.succeeded`) — never client-side events/redirects.
- **No direct create-subscription endpoint** — subscriptions exist only after a customer completes a checkout for a recurring product.
- Resource ID prefixes: `cust_`, `prod_`, `sub_`, `chk_`, `inv_`, `ref_`; timestamps ISO 8601 UTC.
- Webhook events: `checkout.completed|expired`, `collection.succeeded|failed|underpaid`, `customer.subscription.created|updated|deleted`, `invoice.created|paid|payment_failed`, `payout.*`, `refund.*`, `dispute.*`, `conversion.*`, `customer.created|updated`.
- Webhook dev portal: per-endpoint delivery metrics, event inspect/replay, local webhook testing (no ngrok).
- Scoped/rotatable/revocable API keys; REST idempotency keys; cursor pagination.
- SDKs: Node.js, Python, Go (`@bachs/*` on npm); hosted checkout + overlay checkout (`bachs.js`); Connect for platform splits (not needed for v1).
- Pricing (per `apps/docs/src/routes/_home/pricing.tsx`): Starter $0, Pro **$49/mo per project** (14-day trial), Enterprise custom. Keep this page in sync with the Bachs catalog.
