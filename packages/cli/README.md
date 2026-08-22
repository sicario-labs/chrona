<div align="center">

# Chrona ⚡

**The Verifiable Software Workspace & Epistemic Truth Engine for Developers and AI Agents.**

[![npm version](https://img.shields.io/npm/v/@chrona-engine/cli.svg?color=blue&style=flat-square)](https://www.npmjs.com/package/@chrona-engine/cli)
[![license](https://img.shields.io/npm/l/@chrona-engine/cli.svg?style=flat-square)](https://github.com/sicario-labs/chrona/blob/main/LICENSE)
[![tests](https://img.shields.io/badge/tests-131%20passing-brightgreen.svg?style=flat-square)](https://github.com/sicario-labs/chrona)
[![latency](https://img.shields.io/badge/median%20latency-340ms-purple.svg?style=flat-square)](https://github.com/sicario-labs/chrona)
[![MCP](https://img.shields.io/badge/MCP-16%2B%20Agents%20Supported-orange.svg?style=flat-square)](https://modelcontextprotocol.io)

</div>

---

## ⚡ The Problem: Software Changes Faster Than Its Knowledge

Documentation and AI coding agents constantly hallucinate stale APIs, deleted parameters, and renamed methods. Linters check syntax; compilers check types; **Chrona verifies software knowledge against ground-truth evidence.**

```text
Repository
    ↓
Chrona Workspace
    ↓
Claims + Software + Evidence + History
    ↓
Epistemic Graph
    ↓
"Why is this true?"
    ↓
Answer with typed AST provenance & runtime traces
```

---

## 🚀 The 3-Command Instant Onboarding

Zero-config setup in under 60 seconds:

```bash
# 1. Initialize your project's workspace & compiler IR
npx @chrona-engine/cli init

# 2. Type-check your documentation against live codebase AST
npx @chrona-engine/cli check

# 3. Deep epistemic explanation with provenance & evidence chain
npx @chrona-engine/cli explain <symbol>
```

---

## 🛠️ Core Capabilities

### 1. Type-Check Documentation (`chrona check`)
Audits all markdown and MDX files against live repository AST, catching stale signatures, missing parameters, and broken recipes:

```bash
$ npx @chrona-engine/cli check

Chrona Documentation Compiler v1

  DOC-102  Signature mismatch in `useStore`: parameter #1 is `api` in code, but documented as `store`
           docs/reference/hooks/use-store.md:34:10
           AST: (api: ReadonlyStoreApi<TState>, selector: ...) => void

  DOC-103  Parameter `storeApi` not found in signature for `useStore`
           docs/reference/hooks/use-store.md:38:5

Found 2 errors, 0 warnings (498 claims verified, 2 contradictions in 340ms)
```

### 2. Software Memory & Provenance (`chrona explain`)
Inspect why a symbol has its current shape, which documentation claims reference it, and why drift occurred:

```bash
$ npx @chrona-engine/cli explain createRouter

Why does createRouter look like this?

Current Implementation:
  src/index.ts:7
  (): RouterContext<T>

Documentation References:
  Total References: 45
  ✓ README.md:30
  ... and 41 more verified references

Epistemic Verdict:
  [VERIFIED] Symbol `createRouter` is implemented in src/index.ts:7.
  All references 100% verified against live AST ground truth.

Evidence Chain:
  • AST: src/index.ts:7 ((): RouterContext<T>)
  • Git: commit 68f6d87 (main)
  • Claims: 45 claim(s) extracted from documentation
```

### 3. The Verifiable Workspace (`chrona ws`)
Inspect your software model, exported symbols, claims, and multi-tier evidence coverage:

```bash
$ npx @chrona-engine/cli ws

Chrona Workspace
────────────────────────────────────────
Project       radix3
Repository    unjs/radix3
Commit        68f6d87 (main)

Sources
  47 symbols
  47 exports
  1 modules

Documentation
  3 pages
  83 claims
  78 verified
  3 contradictions
  2 unverified

Evidence
  ✓ TypeScript AST
  ✓ Git history
  ✓ package metadata
  ✓ executable examples

Integrity
  Soundness:         96.3% [FAIL]
  Claim Coverage:    97.6%
  Evidence Coverage: 100.0%
```

### 4. Universal AI Agent MCP Server (`chrona mcp`)
Connect Chrona to **Claude Code, Cursor, Google Antigravity, OpenCode, Kiro, Windsurf, Zed, JetBrains, and Copilot** to give AI agents verified software context rather than hallucinations:

```bash
# Auto-install MCP configuration for your preferred agent
npx @chrona-engine/cli mcp --install cursor
npx @chrona-engine/cli mcp --install claude
npx @chrona-engine/cli mcp --install antigravity
npx @chrona-engine/cli mcp --install all
```

---

## 🏛️ Epistemic Evidence Hierarchy

Chrona enforces a **multi-tier evidence hierarchy**:

| Tier | Source | Strength | Description |
|---|---|---|---|
| **Tier 1 — Direct** | `typescript-ast`, Type declarations | `STRONG` | Definitive ground truth for symbols and signatures. |
| **Tier 2 — Executable** | Test assertions (`test/*.test.ts`), Runtime probes | `STRONG` | Proves runtime ordering, error throws, and sync behaviors. |
| **Tier 3 — Historical** | Git commits, Line blame, Changelogs | `HISTORICAL` | Provenance for drift timing and temporal lineage. |
| **Tier 4 — Contextual** | `package.json` dependencies, `tsconfig.json` | `SUPPORTING` | Resolves platform globals and third-party dependencies. |
| **Tier 5 — Non-Authoritative** | AI interpretation without test execution | `NEVER_AUTHORITATIVE` | AI helps formulate probes; evidence determines truth. |

> **Brand Promise**: *"Chrona never guesses about software truth."* When static analysis cannot prove dynamic runtime behavior, Chrona outputs `UNVERIFIED` with transparent required evidence rather than inventing a false verdict.

---

## 🚦 CI / CD Gate (GitHub Actions)

Add Chrona to your GitHub Actions pipeline to block pull requests on documentation drift:

```yaml
name: Documentation Truth Gate
on: [push, pull_request]

jobs:
  chrona-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm install -g @chrona-engine/cli
      - run: chrona ci --diff origin/main --format github
```

---

## 📖 CLI Command Reference

| Command | Alias | Description |
|---|---|---|
| `chrona init` | — | Initialize Chrona workspace, Vite docs runtime, and compiler IR |
| `chrona check` | — | Audit documentation claims against live codebase AST |
| `chrona explain <sym>` | — | Deep epistemic explanation for why a symbol looks like this |
| `chrona ws` | `workspace` | Inspect software model, claims, evidence, and integrity scorecard |
| `chrona ci` | — | CI truth gate with strict exit codes and GitHub annotations |
| `chrona impact` | — | Calculate documentation drift caused by git commits / PR diffs |
| `chrona repair` | — | Generate structured Agent Work Orders for AI repairs |
| `chrona discover` | — | Extract public AST exports and types into Evidence Graph |
| `chrona plan` | — | Inspect compiler intermediate representation (DAG tasks) |
| `chrona mcp` | — | Start Model Context Protocol server for AI coding agents |
| `chrona bench` | — | Measure Developer Task Success Rate (DTSR) and integrity metrics |
| `chrona badge` | — | Generate live verification status badge for README.md |
| `chrona dev` | — | Start local Vite documentation runtime with real-time verification |
| `chrona build` | — | Compile static production documentation bundle & `/llms.txt` |
| `chrona deploy` | — | Deploy documentation to edge hosting with rollback support |

---

## 📦 Installation

```bash
# Global installation
npm install -g @chrona-engine/cli

# Local project installation
pnpm add -D @chrona-engine/cli
```

---

## 📄 License

MIT © [Emmanuel Enyi](https://github.com/sicario-labs) / [Sicario Labs](https://github.com/sicario-labs)
