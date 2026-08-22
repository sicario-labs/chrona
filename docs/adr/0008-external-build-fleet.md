# ADR-0008: Heavy builds on an external fleet (Queues pull-consumer)

- **Status:** Accepted
- **Decision ID:** D6
- **Date:** 2026-08-16

## Context

Real Chrona builds (npm ci + vite + twoslash + openapi/asyncapi) cannot run inside a Worker: no
`child_process`, 128 MB memory, and the 10ms/30s CPU ceiling (ADR-0002). Yet the build pipeline
must feel like a single deploy path.

## Decision

**Workers orchestrate; an external fleet executes.** Build jobs go to a Cloudflare **Queues**
producer; a pool of external agents (Fly/Railway/GH self-hosted runners) act as **pull-consumers**
— lease a job, run the build, stream logs to R2, upload artifacts, and ack. `chrona-builder`
Worker keeps only light jobs (retries, dead-letter, state transitions).

## Consequences

- Queues is now on the Free plan (10k ops/day, 24h retention — ADR-0002), so the queue itself
  is free; only the external fleet costs money, and only when builds run.
- External agents get short-lived (15 min) build tokens, never user tokens (7.4).
- State machine lives in D1 (3.2); crash recovery via stale-job sweep in the BuildScheduler DO (3.4).