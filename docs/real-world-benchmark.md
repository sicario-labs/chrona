# Real-World GitHub Repository Reality Validation Matrix

> Uncurated, zero-config benchmark testing Chrona across 10 diverse, popular open-source repositories cloned directly from GitHub.
> Executed on: 2026-08-19.

---

## 1. Executive Summary & Epistemic Invariants

Chrona was executed directly against 10 real-world repositories without prior tuning, custom configuration, or pre-curated fixtures.

### Strict Epistemic Invariant (Mutually Exclusive State Machine)
Every extracted claim is guaranteed to occupy **exactly one primary partition**:
$$\text{Total Claims} \equiv \text{Verified} + \text{Contradicted} + \text{Unverified} + \text{Ambiguous}$$

Across all 10 repositories and 1,538 evaluated claims, this invariant holds with zero drift:
$$754 \text{ Verified} + 426 \text{ Contradicted} + 358 \text{ Unverified} + 0 \text{ Ambiguous} = 1,538 \text{ Total Claims}$$

---

## 2. 10-Repository Reality Validation Matrix

| Repository | Archetype | Target Commit | AST Symbols | Doc Pages | Total Claims | Verified | Contradicted | Unverified | Ambiguous | Soundness | Invariant Check | Latency |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [**unjs/radix3**](https://github.com/unjs/radix3) | URL / Router Engine | `68f6d87` | 47 | 3 | 83 | 78 | 3 | 2 | 0 | **96.3%** | ✓ Exact | 340ms |
| [**colinhacks/zod**](https://github.com/colinhacks/zod) | Schema Validation SDK | `3c9ca1d` | 1,351 | 0 | 0 | 0 | 0 | 0 | 0 | **N/A** | ✓ Exact | 3,078ms |
| [**sindresorhus/ky**](https://github.com/sindresorhus/ky) | HTTP Client Library | `3419113` | 88 | 1 | 147 | 71 | 12 | 64 | 0 | **85.5%** | ✓ Exact | 782ms |
| [**lukeed/ms**](https://github.com/lukeed/ms) | Time Conversion Utility | `552c409` | 2 | 1 | 3 | 3 | 0 | 0 | 0 | **100.0%** | ✓ Exact | 152ms |
| [**motdotla/dotenv**](https://github.com/motdotla/dotenv) | Config / Env Manager | `2fc7eac` | 0 | 2 | 44 | 32 | 0 | 12 | 0 | **100.0%** | ✓ Exact | 253ms |
| [**isaacs/node-glob**](https://github.com/isaacs/node-glob) | File Matcher | `9f70854` | 38 | 3 | 72 | 26 | 1 | 45 | 0 | **96.3%** | ✓ Exact | 276ms |
| [**honojs/hono**](https://github.com/honojs/hono) | Edge Web Framework | `0293343` | 561 | 1 | 39 | 31 | 7 | 1 | 0 | **81.6%** | ✓ Exact | 2,159ms |
| [**pmndrs/zustand**](https://github.com/pmndrs/zustand) | State Management | `b126c33` | 21 | 38 | 1,066 | 498 | 401 | 167 | 0 | **55.4%** | ✓ Exact | 1,295ms |
| [**chalk/chalk**](https://github.com/chalk/chalk) | CLI Terminal Styler | `661317e` | 4 | 1 | 72 | 8 | 2 | 62 | 0 | **80.0%** | ✓ Exact | 271ms |
| [**expressjs/cors**](https://github.com/expressjs/cors) | HTTP Middleware | `5317ebe` | 0 | 1 | 12 | 7 | 0 | 5 | 0 | **100.0%** | ✓ Exact | 185ms |

---

## 3. Latency Distribution Across 10 Repositories

| Metric | Measured Duration | Context |
|---|---|---|
| **Median (P50)** | **340 ms** | Fast sub-second verification across standard libraries (`ms`, `dotenv`, `cors`, `chalk`, `node-glob`, `radix3`) |
| **P95** | **3,078 ms** | Large codebases with hundreds of deep AST files (`hono`, `zod`) |
| **Maximum** | **3,078 ms** | `colinhacks/zod` (1,351 AST declarations parsed in a single sweep) |

---

## 4. Multi-Tier Evidence Architecture

```text
                     DOCUMENTATION CLAIM
                              │
                              ▼
                       Claim Classifier
                              │
                              ▼
                       EVIDENCE PLANNER
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
     Tier 1: AST         Tier 2: Tests        Tier 4: Context
   Local Source Tree    Test Suite Matcher   Dependencies & Platform
  (packages/*/src)       (test/*.test.ts)     (react, immer, web globals)
         │                    │                    │
         └────────────────────┼────────────────────┘
                              ▼
                        EVIDENCE SET
                              │
                              ▼
                      EPISTEMIC VERDICT
             (VERIFIED │ CONTRADICTED │ UNVERIFIED)
                              │
                              ▼
                       CHRONA WORKSPACE
                              │
                              ▼
                      VERIFIED CONTEXT
                              │
                              ▼
                          AI AGENTS
```

### Evidence Hierarchy & Strengths
- **Tier 1 — Direct (`STRONG`)**: TypeScript AST, type declarations, package exports, schemas.
- **Tier 2 — Executable (`STRONG`)**: Test assertions, compiled examples, runtime probes.
- **Tier 3 — Historical (`HISTORICAL`)**: Git commits, line blame, changelogs.
- **Tier 4 — Contextual (`SUPPORTING`)**: `package.json` dependencies, `tsconfig.json` libs (`DOM`, `Node`, `JSX`).
- **Tier 5 — Non-Authoritative (`NEVER_AUTHORITATIVE`)**: AI interpretation without ground-truth evidence.
