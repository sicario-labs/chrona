# Chrona Agent Context Benchmark (CACB) - Specification v1.0

## Status: FROZEN (Immutable Protocol)
**Release Date:** August 2026  
**Identifier:** CACB-1.0.0-PROT  
**Protocol Hash:** `sha256:cacb1_0_protocol_frozen_standard`

---

## 1. Abstract & Scope

The Chrona Agent Context Benchmark (CACB-1.0) is a standardized, reproducible evaluation harness measuring autonomous coding agent performance across three distinct information-access paradigms:
1. **Arm A (Raw Baseline)**: Interactive, unassisted filesystem discovery.
2. **Arm B (Search / RAG Index)**: Ranked hybrid lexical/vector chunk retrieval.
3. **Arm C (Chrona Developer Experience Compiler)**: Deterministic epistemic context compilation (`GET Workspace`).

CACB-1.0 evaluates whether context compilation allows coding agents to achieve equal or superior task completion and test pass rates while collapsing interactive exploratory overhead and eliminating invariant regressions.

---

## 2. Experimental Environment & System Freezing

To guarantee bit-for-bit external reproducibility, all benchmark trials must execute under the following frozen operational configuration:

```yaml
environment:
  node_version: "22.20.0"
  pnpm_version: "10.4.1"
  os: "Windows 11 / Linux Ubuntu 22.04 LTS"
  typescript_version: "5.7.3"

agent_harness:
  model: "claude-3-5-sonnet-20241022" # or gpt-4o-2024-08-06
  temperature: 0.0
  top_p: 1.0
  seed: 42
  max_turns: 30
  turn_timeout_sec: 120
  tokenizer: "cl100k_base"

pricing_model:
  input_per_mtok: 3.00
  output_per_mtok: 15.00
  tool_call_latency_cost: 0.008
```

---

## 3. Operational Definitions of Experimental Arms

### Arm A: Raw Baseline (Unassisted Exploration)
- **Initial Context**: The agent receives ONLY the repository root path and task prompt.
- **Allowed Tools**: `list_dir`, `view_file`, `grep_search`, `find_by_name`.
- **Discovery**: Agent must manually traverse the filesystem, locate target symbols, identify dependencies, and infer invariant contracts.

### Arm B: Search / RAG Index (Hybrid Retrieval Baseline)
- **Indexing Pipeline**:
  - Chunking: Line-aware fixed chunks of 512 tokens with 64-token overlap.
  - Hybrid Index: 50% BM25 lexical term frequency + 50% dense vector cosine similarity (`text-embedding-3-small`).
  - Retrieval Depth: Top-$k = 10$ chunks injected into context per query turn.
  - Query Formulation: Automatic extraction of entity keywords and task intent from prompt.
- **Constraints**: No AST boundary graph, no behavioral contract tracking, no dependency closure calculation, and no critical evidence guarantee.

### Arm C: Chrona Developer Experience Compiler (`GET Workspace`)
- **Compilation Pipeline**:
  - Pinned snapshot construction (`SnapshotBuilder`).
  - AST symbol indexing & transitive dependency boundary computation.
  - Behavioral invariant contract extraction & git provenance linking.
  - Marginal-value knapsack optimizer with mandatory **Critical Evidence Constraint** and **Epistemic Quality Certification**.
- **Delivery**: A bounded `TaskWorkspacePacket` containing the epistemic manifest, machine-readable reality, active invariant contracts, breakage risks, and contiguous source slices.

---

## 4. Benchmark Metrics & Calculation Rules

1. **Tool Calls to First Action ($\text{TC}_1$)**:
   - Total interactive round-trip tool calls executed before the agent emits its **First Action**.
   - *Operational Definition of First Action*: The first externally observable task-solving action produced by the agent (either a code modification tool call or a final diagnostic proof output), strictly excluding receipt/initialization of benchmark context.
2. **Prompt Tokens to First Action ($\text{Tokens}_{\text{in}}$)**:
   - Total input tokens consumed up to the moment of First Action.
3. **First-Action Latency ($T_1$)**:
   - Total wall-clock seconds elapsed from task initialization to the First Action.
4. **Context Escape Rate ($\text{CER}$)**:
   $$\text{CER} = \frac{\text{Tool Calls inspecting files outside the pre-compiled boundary}}{\text{Total Inspection Tool Calls}} \times 100\%$$
5. **Task Success Rate ($\text{TSR}$)**:
   - Percentage of tasks where the agent produces a syntactically correct and semantically valid solution addressing the prompt.
6. **Invariant Regression Rate ($\text{RR}$)**:
   - Percentage of tasks where an edit violates an existing behavioral contract, invariant assertion, or unreferenced sibling dependency.
7. **Final Test Pass Rate ($\text{TPR}$)**:
   - Percentage of tasks that pass the entire repository test suite with zero regression failures ($\text{TPR} = \text{TSR} \times (1 - \text{RR})$).

---

## 5. Statistical Inference Protocol

1. **Paired Continuous Variables ($\text{TC}_1, T_1, \text{Tokens}$)**:
   - Evaluated via non-parametric **Wilcoxon Signed-Rank Test** for matched pairs with standard tie-correction.
   - Report: Paired Mean Difference ($\Delta$), 95% Confidence Interval on $\Delta$, Paired Median Difference, Test Statistic ($W, Z$), and two-tailed $p$-value.
2. **Paired Binary Proportion Variables ($\text{RR}, \text{TPR}$)**:
   - Descriptive single-arm uncertainty: **Wilson Score 95% Confidence Intervals**.
   - Inferential comparison between matched arms: **McNemar's Exact Test** on discordant pairs ($b, c$).

---

## 6. Core Product Thesis

> **"Search reduces retrieval overhead. Chrona reduces context reconstruction overhead."**  
> *"Chrona doesn't make agents better at searching software. It reduces how much searching an agent has to do before it can safely reason about software."*
