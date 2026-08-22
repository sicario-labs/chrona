# The 10-Team Engineering Pilot Protocol

> **Company Thesis**: Software changes faster than its knowledge. Chrona maintains a continuously verifiable model of what the software knows, what it claims, and what can actually be proven.

---

## 1. Executive Intent & North Star Question

Chrona has achieved algorithmic and epistemic soundness across diverse real-world open-source repositories:
- Zero false positives on unevidenced codebases (`zod` $\rightarrow$ `N/A [INSUFFICIENT EVIDENCE]`)
- Mutually exclusive epistemic partitions ($1,538 = 754 \text{ Verified} + 426 \text{ Contradicted} + 358 \text{ Unverified}$)
- Sub-second median latency ($340\text{ms}$)
- Deep software explanation (`chrona explain <symbol>`)

The next question is not:
> *"Can we build Chrona?"*

The question is:
> **"Does an engineering team become reluctant to remove Chrona once it has learned their software?"**

---

## 2. The 5 Core Pilot Telemetry Metrics

| Metric | Target | Significance | Measurement Method |
|---|---|---|---|
| **1. Time to First Finding** | **< 60 seconds** | Proves the product wedge delivers instant value without configuration burden. | Duration from `npm i -g @chrona-engine/cli` to first `DOC-xxx` finding. |
| **2. CI Gate Adoption** | **> 80%** | Measures willingness to make Chrona a required status check on pull requests. | Presence of `chrona ci` step in `.github/workflows/`. |
| **3. Diagnostic Fix Ratio** | **> 70%** | Determines whether teams fix their documentation or merely suppress findings. | Ratio of code/doc edits vs `<!-- chrona-ignore -->` directives. |
| **4. AI Agent Context Calls** | **> 15 / day / dev** | Measures whether AI agents (Cursor, Claude, Antigravity) query Chrona for verified truth. | Hits to `get_verified_context` tool via MCP. |
| **5. 30-Day Workspace Retention** | **> 90%** | Proves long-term product stickiness and software memory value. | Active `chrona ws` inspections 30 days post-onboarding. |

---

## 3. The 10-Team Pilot Cohort Profiles

To ensure rigorous validation across different codebase archetypes, 10 teams will be onboarded across 4 tiers:

### Tier A: Developer API & SDK Creators (3 Teams)
- **Profile**: Public open-source libraries or commercial SDKs with high documentation stakes.
- **Key Value**: Eliminating stale parameter names and signature drift on breaking releases.

### Tier B: Fast-Moving Monorepo Teams (3 Teams)
- **Profile**: Rapidly iterating product companies with 10–50 engineers sharing internal packages.
- **Key Value**: Preventing cross-package knowledge drift and CI gate automation.

### Tier C: AI-Native Engineering Teams (2 Teams)
- **Profile**: Engineering teams using Claude Code, Cursor, and Antigravity daily.
- **Key Value**: Feeding AI agents grounded, verified context (`chrona mcp`) to stop hallucinated code generation.

### Tier D: High-Compliance & Regulated Software (2 Teams)
- **Profile**: FinTech, HealthTech, or Developer Security platforms.
- **Key Value**: Exact provenance, verifiable AST evidence chains, and audit compliance.

---

## 4. The 3-Step Pilot Onboarding Playbook

```bash
# Step 1: Zero-Config Audit & Workspace Model (Instant Discovery)
$ npx @chrona-engine/cli ws

# Step 2: Instant Software Memory & Explanation
$ npx @chrona-engine/cli explain <core_api_symbol>

# Step 3: Zero-Friction CI Gate Installation
$ npx @chrona-engine/cli init --hook strict
```

---

## 5. Epistemic Brand Promise

> **"Chrona never guesses about software truth."**
> - When Chrona knows an assertion is true, it proves it with typed AST and test evidence.
> - When Chrona detects a contradiction, it identifies the exact line of code and documentation drift.
> - When static analysis is insufficient to prove dynamic runtime behavior, Chrona outputs `UNVERIFIED` with transparent required evidence rather than hallucinating a false verdict.
