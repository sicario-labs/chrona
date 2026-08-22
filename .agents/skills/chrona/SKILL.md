---
name: chrona
description: Developer Experience Compiler, Verifiable Software Workspace & Epistemic Context Compiler for AI coding agents.
---

# Chrona: Developer Experience Compiler & Epistemic Workspace Contract

Chrona is a **Developer Experience Compiler and Epistemic Verification Layer** between a software repository and an AI coding agent.

Chrona does not flood agents with raw files or unstructured search chunks. Instead, Chrona compiles the repository into a **bounded, certified Task Workspace Packet** containing ground-truth AST symbols, dependency boundaries, active behavioral contracts, breakage risks, and contiguous source slices.

```text
Repository
   ↓
Deterministic Snapshot (Pinned Git Commit + AST Cache)
   ↓
Evidence Graph (AST Symbols + Dependencies + Contracts + Tests)
   ↓
Context Compiler (Knapsack Optimizer with Critical Constraints)
   ↓
Epistemic Certification (VALID | DEGRADED | INVALID)
   ↓
Autonomous Agent (Bounded Reality, Zero Interactive Search Overhead)
   ↓
Verification & Proof Receipt
```

---

## 1. The Core Agent Command Suite

| Command | CLI Flag | Purpose & Output |
|---|---|---|
| **01. GET WORKSPACE** | `npx @chrona-engine/cli ws --task "<intent>" [--target <symbol>] [--token-budget <N>]` | **The Primary Agent Primitive**: Compiles a certified `TaskWorkspacePacket` containing the exact slice of reality needed to act. |
| **02. AUDIT / CHECK** | `npx @chrona-engine/cli check --json` | AST-verified type-checker for documentation claims against live codebase exports (`DOC-xxx` diagnostics). |
| **03. WHY ENGINE** | `npx @chrona-engine/cli why <symbol>` | Explains why a symbol exists, its historical provenance, callers, and whether it is safe to delete. |
| **04. CHANGE IMPACT** | `npx @chrona-engine/cli impact --json` | Generates a structured Agent Work Order calculating the blast radius and affected files for a Git diff. |
| **05. ASK ARCHITECTURE**| `npx @chrona-engine/cli ask "<question>"` | Performs grounded semantic & structural architectural reasoning over the codebase truth graph. |
| **06. PROVE CLAIM** | `npx @chrona-engine/cli prove "<claim>"` | Verifies a natural language claim against the live codebase, outputting a PROVEN/DISPROVEN verdict and evidence. |
| **07. UPGRADE** | `npx @chrona-engine/cli upgrade <pkg@from->to>` | Computes the semantic differential between two Registry artifacts, projects it onto local usage, and outputs a deterministic Migration Work Order. |
| **08. VERIFY & RECEIPT** | `npx @chrona-engine/cli verify` | Repository-wide epistemic verification sweep. Generates a signed cryptographic Proof Receipt if all contracts hold. |
| **09. MCP SERVER** | `npx @chrona-engine/cli mcp` | Starts the Model Context Protocol server exposing verified tools to all agent IDEs. |

---

## 2. The Primary Agent Primitive: `GET Workspace`

Before inspecting files or writing code, **always request a compiled workspace packet**.

### A. Invoking via MCP: `get_workspace`
```json
{
  "task": "Add strict route matching option to createRouter",
  "intent": "modify",
  "target": "createRouter",
  "tokenBudget": 8000
}
```

### B. Invoking via CLI: `chrona ws`
```bash
npx @chrona-engine/cli ws --task "Add strict route matching option" --target createRouter --json
```

### C. Packet Structure & Certification
The returned `TaskWorkspacePacket` contains:
- **`snapshotId`**: Deterministic SHA-256 identity of the analyzed repository state.
- **`reality`**: Bounded AST slice of target symbols, transitive dependency boundary, active behavioral contracts, and breakage risks.
- **`externalReality`**: Verified API signatures and contracts extracted from the Chrona Registry for external dependencies, **eliminating the need for interactive dependency archaeology (e.g., grepping `node_modules`).**
- **`manifest`**: Grounded claim coverage mapping requirements to source lines.
- **`slices`**: Pre-sliced, contiguous source blocks for all files in the task boundary.
- **`projection`**: Epistemic Certification banner:
  - `quality`: `'VALID'` (safe to act), `'DEGRADED'` (partial coverage), or `'INVALID'` (critical evidence omitted).
  - `minimumSufficientBudget`: Minimum tokens strictly required for Critical Evidence.
  - `recommendedTokenBudget`: Tokens required for full evidence saturation.
  - `missingCriticalEvidence`: Specific files/symbols omitted if current budget is starved.

### D. The Self-Healing Budget Loop
If `quality === 'INVALID'`, do **not** hallucinate or search randomly. Re-compile using the recommended budget:
$$\text{GET Workspace}(8\text{k}) \longrightarrow \text{INVALID (Recommended: } 14.3\text{k}) \longrightarrow \text{GET Workspace}(16\text{k}) \longrightarrow \text{VALID}$$

---

## 3. Epistemic Evidence Hierarchy & Truth States

Chrona strictly partitions every claim into **mutually exclusive epistemic buckets**:

$$\text{Total Claims} \equiv \text{Verified} + \text{Contradicted} + \text{Unverified} + \text{Ambiguous}$$

### The 4 Epistemic States:
1. **`VERIFIED`**: Proven by authoritative evidence (local AST, declared dependency export, or passing test probe).
2. **`CONTRADICTED`**: Authoritative evidence directly refutes the claim (parameter removed, return type mismatch, or signature drift).
3. **`UNVERIFIED`**: Static evidence cannot establish dynamic runtime behavior without execution. **Never guess.**
4. **`AMBIGUOUS`**: Conflicting multi-tier evidence across sources.

### Multi-Tier Evidence Capabilities:
- **`DISTRIBUTION`**: Extracted directly from compiled packages (npm). Guarantees exact structural reality, exported APIs, signatures, and artifact integrity hashes.
- **`SOURCE`**: Extracted from version control (Git). Guarantees all distribution facts plus source AST, internal dependency graphs, and cryptographic source provenance.
- **`BEHAVIOR`**: Extracted from tests and contracts. Guarantees all source facts plus runtime behavior, invariant validation, and test coverage.
- **`CONTEXTUAL`**: Extracted from configuration boundaries (`package.json`, `tsconfig.json`).
- **`NON_AUTHORITATIVE`**: AI interpretation or speculation without ground-truth evidence. **Never rely on this.**

---

## 4. Four Standard Agent Workflows

### Workflow 1: Feature Implementation & Bug Fixing
1. **Compile**: Call `get_workspace(task, intent="modify", target=...)`.
2. **Verify**: Ensure `projection.quality === 'VALID'`.
3. **Review Contracts**: Inspect `reality.contracts` for preconditions (e.g. `key === "*"`, proto guards).
4. **Implement**: Apply code modifications strictly within the pre-sliced boundary (`reality.target.file` and `reality.affectedFiles`).
5. **Verify**: Run repository tests.

### Workflow 2: Failure & Concurrency Diagnosis
1. **Compile**: Call `get_workspace(task="Diagnose race condition in retry loop", intent="investigate")`.
2. **Zero-Turn Reasoning**: Examine the compiled `reality.contracts` and listener notification patterns directly in the packet.
3. **Formulate Solution**: Deliver root cause and snapshot fix without exploratory round-trips.

### Workflow 3: Deprecation & Subsystem Deletion
1. **Check Lineage**: Run `npx @chrona-engine/cli why <symbol>` to verify deletion safety and dependent blast radius.
2. **Compile Boundary**: Call `get_workspace(task="Remove deprecated helper", intent="delete", target=...)`.
3. **Migrate Callers**: Update all dependent callers identified in `reality.affectedFiles` before removing the declaration.

### Workflow 4: Autonomous Dependency Upgrade
1. **Compute Differential**: Run `npx @chrona-engine/cli upgrade <package@from->to>`.
2. **Review Work Order**: The CLI will fetch Registry Artifacts for both versions, compute the semantic differential (API additions, removals, signature drift), and project them onto the local usage graph.
3. **Execute**: If the status is `MIGRATION_REQUIRED`, iteratively address each numbered task in the generated Migration Work Order.
4. **Verify**: Ensure the project compiles and repository tests pass.

### Workflow 5: Documentation Authoring & Verification
1. **Audit Claims**: Run `npx @chrona-engine/cli check --json`.
2. **Resolve Diagnostics**: Sync parameter names, return types, and code snippets with live AST truth.
3. **Verify Super-Components**: Ensure all MDX super-components (`<CodeGroup>`, `<Recipe>`, `<ParamField>`) are runnable.

---

## 5. MCP Tools Reference

Chrona exposes the following tools via the Model Context Protocol:

### 1. `get_workspace`
Compiles and returns the task-specific `TaskWorkspacePacket`.
```typescript
interface GetWorkspaceParams {
  task: string;                              // Task description or requirement
  intent?: 'modify' | 'create' | 'delete' | 'investigate' | 'evaluate' | 'refactor';
  target?: string;                            // Primary symbol or entry file
  tokenBudget?: number;                       // Default: 8000 tokens
}
```

### 2. `get_verified_context`
Returns grounded factual declarations for a specific symbol.
```typescript
interface GetVerifiedContextParams {
  symbol: string;                             // Exported symbol name
  scope?: string;                             // Target directory scope
}
```

### 3. `discover_evidence`
Lists all public AST exports, signatures, and types indexed from source files.

### 4. `get_agent_work_order`
Returns structured repair work orders after a Git commit.

---

## 6. Compiler Diagnostics & Rules (`DOC-xxx`)

| Code | Severity | Description | Agent Resolution |
|---|---|---|---|
| **`DOC-101`** | **ERROR** | Missing symbol in public exports | Fix typo or export symbol from library index. |
| **`DOC-102`** | **ERROR** | Parameter name or signature mismatch | Sync documentation parameter names with AST signature. |
| **`DOC-103`** | **ERROR** | Documented parameter not found in signature | Remove removed parameter or update AST signature. |
| **`DOC-104`** | **ERROR** | Return type mismatch | Update documented return type to match AST return type. |
| **`DOC-201`** | **ERROR** | Code snippet syntax or compilation error | Fix syntax errors inside markdown code fences. |
| **`DOC-401`** | **WARN** | Deprecated symbol without notice | Add `@deprecated` banner and migration path. |

### Suppressing Intentional Divergences:
```markdown
<!-- chrona-ignore: DOC-101 (legacy v3 compatibility) -->
`legacyCreateStore` was deprecated in v4.
```

---

## 7. Documentation Authoring Standards

### A. The 4 Opening Questions
Every document must answer early in the reading flow:
1. *What is this?* (Clear, 1-sentence value proposition)
2. *Who is it for?* (Target audience & context)
3. *What will I accomplish?* (Outcome goal)
4. *What should I do next?* (Next steps in developer workflow)

### B. Writing Style & Micro-Paragraph Pacing
- Enforce the rhythm: *1 explanatory sentence $\rightarrow$ Concrete code block $\rightarrow$ 2-4 bullet points explaining mechanics*.
- Use active, imperative verbs ("Configure", "Wrap", "Execute").
- Every code block must be runnable and copy-pasteable.

---

## 8. Super-Components (Zero-Import MDX)

Use Chrona super-components for structured, interactive technical documentation:

```mdx
<CodeGroup>
  ```bash title="pnpm"
  pnpm add @chrona-engine/cli
  ```
  ```bash title="npm"
  npm install @chrona-engine/cli
  ```
</CodeGroup>

<Recipe
  title="Safe State Initialization"
  uses={["createStore", "useStore"]}
  tests="100% sound"
>
  ```ts
  import { createStore, useStore } from "zustand";
  // Fully runnable verified snippet
  ```
</Recipe>

<ParamField path="options.strict" type="boolean" default="false">
  When enabled, throws a SyntaxError on malformed JSON inputs.
</ParamField>
```

---

## 9. Completion & Quality Gates

An agent should declare completion only when:
1. `npx @chrona-engine/cli ws` returns `Status: VALID` and `Safe to Reason: YES`.
2. `npx @chrona-engine/cli check --json` reports `errorsCount: 0`.
3. Repository tests pass with zero invariant contract regressions.
4. `npx @chrona-engine/cli verify` succeeds and generates a `PASS` Cryptographic Proof Receipt.

---

## 10. Cryptographic Proof Receipts & Verification

Chrona enables mathematical confidence in codebase integrity through its verification mechanisms:

### `chrona prove "<claim>"`
Use this to prove or disprove a natural language behavioral or structural claim about the repository.
It checks the live AST, known behaviors, and active contracts to return a verdict: `PROVEN`, `DISPROVEN`, or `CONTRADICTORY`.

### `chrona verify` (The Ultimate Quality Gate)
Performs a repository-wide epistemic verification sweep.
- Checks all documented claims.
- Evaluates all known behavioral contracts.
- Checks if structural invariants hold.
- If everything passes, it generates a **Cryptographic Proof Receipt** (a signed checksum representing the verified state of the repository). Agents can use this receipt as proof to humans or CI/CD pipelines that their modifications did not regress any known systemic invariants.
