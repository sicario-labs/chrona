# Chrona — Company Thesis & Market Experiment Protocol

> "Software changes faster than its knowledge. Chrona maintains a continuously verifiable knowledge model of software."
> Master strategy and pilot execution protocol. Last updated: 2026-08-18.

---

## 1. Company Thesis & The 60-Second YC Narrative

### The Thesis
> **Software changes faster than its knowledge. Chrona maintains a continuously verifiable knowledge model of software.**

### The 60-Second Pitch
> **"Chrona is a compiler for software knowledge. It builds a verifiable model of a codebase and uses it to detect when documentation diverges from reality. We're starting with documentation because it's the simplest place where this problem is painful and measurable. Coding agents are now consuming that same documentation, so stale knowledge doesn't just confuse humans—it causes agents to write incorrect code."**

---

## 2. Company Architecture: From Wedge to Software Memory

```text
                        CHRONA
                          │
             "Continuously verifiable
                software knowledge"
                          │
              ┌───────────┴───────────┐
              │                       │
       CHRONA WORKSPACE         TEMPORAL MEMORY
              │                       │
      ┌───────┼───────┐               │
      │       │       │               │
   Software Knowledge Evidence     Evolution
      │       │       │               │
      └───────┼───────┘               │
              │                       │
              ▼                       ▼
       Documentation            Change Intelligence
        Type Checking                 │
              │                       │
              └──────────┬────────────┘
                         ▼
                 VERIFIED CONTEXT
                         │
                         ▼
                    AI AGENTS
```

1. **The Wedge**: **Documentation type-checking** (`chrona check`, `chrona ci`). Catches code-documentation contradictions before users or agents do.
2. **The Platform**: **Verifiable Workspace** (`chrona ws`). The Workspace is the fundamental unit of truth uniting Software, Knowledge, Evidence, and Relationships.
3. **The Distribution Layer**: **Verified Context for AI Agents** (`chrona mcp`, `get_verified_context`). Agents query Chrona for verified knowledge with AST provenance instead of blindly guessing over stale repository text.
4. **The Long-Term Moat**: **Software Memory** (`chrona ws --explain <symbol>`). Chrona tracks why software looks the way it does through time, which code commit caused documentation drift, and what evidence supports every conclusion.

---

## 3. The Universal Epistemic Object Contract

Every claim, diagnostic, and symbol in Chrona implements this non-negotiable contract:

| Question | Contract Field | Definition |
|---|---|---|
| **What?** | `subject` / `name` | What symbol or claim is being evaluated |
| **Where?** | `file` / `line` | Exact source location and documentation reference |
| **When?** | `lastVerifiedAt` / `commit` | When it was last verified and at which Git commit |
| **Why?** | `reason` / `message` | The exact semantic reason for the verdict |
| **How sure?** | `confidence` / `evidenceChain` | Epistemic confidence backed by AST, Git, and Package evidence |
| **What changed?** | `affectedClaims` / `knownDrift` | Downstream knowledge and documentation impacted |

---

## 4. Ideal First Customer Profile (The Design Partners)

Targeting 10 engineering teams with:
- Developer-facing SDKs, APIs, or libraries
- Substantial Markdown/MDX documentation
- High commit velocity ($>5$ engineers touching public APIs)
- Active CI/CD (GitHub Actions)
- AI coding agents in active use across the team (Cursor, Claude Code, Antigravity)

**Target Archetypes**: SDK companies, developer tools, open-source frameworks, AI infrastructure providers, and internal platform engineering teams.

---

## 5. The 60-Second Activation Moment ("Aha!")

```bash
$ npx chrona check

✖ DOC-103
Your documentation describes an option that does not exist in the current API.

  docs/api-reference.mdx:40
  `createRouter({ routes })`
  Parameter `routes` was removed in commit 68f6d87.
```

The user doesn't care that Chrona indexed their repository. The magic moment is: **"It caught a real, breaking contradiction we didn't know was there."**

---

## 6. The 5 North-Star Metrics + The Trust Rate Guardrail

```text
        10 DESIGN PARTNERS
               │
               ▼
        INSTALL CHRONA
               │
               ▼
       RUN IN REAL CI
               │
               ▼
       COLLECT REAL DRIFT
               │
        ┌──────┴──────┐
        ▼             ▼
    Trust Rate     Real Value
        │             │
        ▼             ▼
   Zero Noise      Monetize
```

### The Trust Rate Guardrail
$$\text{Trust Rate} = \frac{\text{Real Chrona Diagnostics Acted Upon}}{\text{Real Chrona Diagnostics Generated}}$$

Telemetry explicitly categorizes each diagnostic lifecycle:
- `fixed`: Developer updated code or documentation to match.
- `accepted`: Diagnostic acknowledged as true in PR review.
- `ignored`: PR merged without action.
- `suppressed`: Suppressed via `<!-- chrona-ignore -->`.
- `marked false-positive`: Explicitly flagged as engine inaccuracy.

### The 5 North-Star Metrics
1. **Activation**: Time-to-first-contradiction under 60 seconds.
2. **Retention**: 30-day active CI execution rate $>80\%$.
3. **Suppression Rate**: Suppression frequency $<3\%$ (proving high precision).
4. **Drift Prevented**: Aggregate count of stale claims caught before merging to production.
5. **Willingness to Pay**: Converting **3 design partners to paid tier** ($49/mo - $199/mo) to discover the core economic unit.

---

## 7. Current Validation Baseline

- **Validation Corpus**: **98.6% aggregate precision across 10 representative repository archetypes, with zero false alarms in the validation corpus.**
- **Average Latency**: **~25ms per repository audit**.
- **Engine Soundness**: **131 / 131 tests passing (40 test suites)** with 0 TypeScript errors and 0 linter warnings.
- **Roadmap Status**: **Engineering Frozen.** 100% focus on external design partner validation.
