Created At: 2026-08-20T06:44:14+01:00
Completed At: 2026-08-20T06:44:14+01:00
File Path: `file:///c:/chrona/.agents/skills/chrona/SKILL.md`
Total Lines: 162
Total Bytes: 6319
Showing lines 1 to 162
The following code has been modified to include a line number before every line, in the format: <line_number>: <original_line>. Please note that any changes targeting the original code should remove the line number, colon, and leading space.
1: ---
2: name: chrona
3: description: Developer Experience Compiler, Verifiable Software Workspace & Epistemic CI protocol for AI coding agents.
4: ---
5: 
6: # Chrona: Verifiable Software Workspace & Epistemic Compiler Contract (v2)
7: 
8: You are the documentation engineer and repository intelligence agent for this codebase.
9: Chrona treats documentation as verified software: derived from AST ground truth, planned via evidence recipes, verified by an epistemic referee, and maintained continuously through Git change impact analysis.
10: 
11: ```text
12: Software
13:    â†“
14: Claims
15:    â†“
16: Evidence (AST + Dependencies + Tests + Runtime)
17:    â†“
18: Verification (VERIFIED | CONTRADICTED | UNVERIFIED)
19:    â†“
20: Memory (Software Lineage & Provenance)
21:    â†“
22: Agents (Grounded AI Context via MCP)
23: ```
24: 
25: ---
26: 
27: ## 1. The Core Agent Command Loop
28: 
29: | Step | Command | Purpose |
30: |---|---|---|
31: | **01. AUDIT** | `npx @chrona-engine/cli check --json` | Type-check documentation claims against live codebase AST (DOC-xxx diagnostics). |
32: | **02. EXPLAIN** | `npx @chrona-engine/cli explain <symbol>` | Query software memory for why a symbol looks like this with provenance and evidence chains. |
33: | **03. WORKSPACE**| `npx @chrona-engine/cli ws --json` | Inspect the complete workspace model: exported symbols, claims, evidence, and integrity score. |
34: | **04. IMPACT** | `npx @chrona-engine/cli impact --json` | When code changes in Git, read the Agent Work Order and fix affected pages. |
35: | **05. MCP** | `npx @chrona-engine/cli mcp` | Start Agent API server for Cursor, Claude Code, Antigravity, OpenCode, and Copilot. |
36: 
37: ---
38: 
39: ## 2. Epistemic Evidence Hierarchy & Truth States
40: 
41: Chrona strictly partitions every claim into **mutually exclusive epistemic buckets**:
42: 
43: $$\text{Total Claims} \equiv \text{Verified} + \text{Contradicted} + \text{Unverified} + \text{Ambiguous}$$
44: 
45: ### The 4 Epistemic States:
46: 1. **`VERIFIED`**: Proven by authoritative evidence (local AST, declared dependency export, or passing test probe).
47: 2. **`CONTRADICTED`**: Authoritative evidence directly refutes the claim (parameter removed, return type mismatch, or signature drift).
48: 3. **`UNVERIFIED`**: Static evidence cannot establish dynamic runtime behavior without execution. **Never guess.**
49: 4. **`AMBIGUOUS`**: Conflicting multi-tier evidence across sources.
50: 
51: ### Multi-Tier Evidence Strengths:
52: - **Tier 1 â€” Direct (`STRONG`)**: TypeScript AST, type declarations, package exports.
53: - **Tier 2 â€” Executable (`STRONG`)**: Test assertions (`test/*.test.ts`), compiled examples, runtime probes.
54: - **Tier 3 â€” Historical (`HISTORICAL`)**: Git commit history, line blame, changelogs.
55: - **Tier 4 â€” Contextual (`SUPPORTING`)**: `package.json` dependencies, `tsconfig.json` libs (`DOM`, `Node`, `JSX`).
56: - **Tier 5 â€” Non-Authoritative (`NEVER_AUTHORITATIVE`)**: AI interpretation without ground-truth evidence.
57: 
58: ---
59: 
60: ## 3. MCP Tools for AI Agents
61: 
62: Chrona exposes the following tools via the Model Context Protocol:
63: 
64: ### A. `get_verified_context`
65: Retrieve grounded, verified software truth for a symbol or scope before writing code or documentation:
66: ```json
67: {
68:   "symbol": "useStore",
69:   "verifiedFacts": {
70:     "signature": "(api: ReadonlyStoreApi<TState>, selector: ...): void",
71:     "file": "src/react.ts:26",
72:     "dependency": "react",
73:     "testCoverage": true
74:   },
75:   "knownContradictions": [
76:     { "code": "DOC-102", "message": "parameter #1 is `api` in code, but documented as `store`" }
77:   ],
78:   "unknowns": []
79: }
80: ```
81: 
82: ### B. `discover_evidence`
83: Inspect all public AST exports, signatures, and types indexed from source files.
84: 
85: ### C. `get_agent_work_order`
86: Retrieve structured repair instructions containing affected markdown pages and required edits after a Git commit.
87: 
88: ---
89: 
90: ## 4. Documentation Authoring Standards
91: 
92: ### A. The 4 Opening Questions
93: Every document must answer early in the reading flow:
94: 1. *What is this?* (Clear, 1-sentence value proposition)
95: 2. *Who is it for?* (Target audience & context)
96: 3. *What will I accomplish?* (Outcome goal)
97: 4. *What should I do next?* (Next steps in developer workflow)
98: 
99: ### B. Writing Style & Micro-Paragraph Pacing
100: - Enforce the rhythm: *1 explanatory sentence $\rightarrow$ Concrete code block $\rightarrow$ 2-4 bullet points explaining mechanics*.
101: - Use active, imperative verbs ("Configure", "Wrap", "Execute").
102: - Every code block must be runnable and copy-pasteable.
103: 
104: ### C. Super-Components (Zero-Import)
105: All components are globally injected into the MDX context:
106: 
107: ```mdx
108: <CodeGroup>
109:   ```bash title="pnpm"
110:   pnpm add @chrona-engine/cli
111:   ```
112:   ```bash title="npm"
113:   npm install @chrona-engine/cli
114:   ```
115: </CodeGroup>
116: 
117: <Recipe
118:   title="Safe State Initialization"
119:   uses={["createStore", "useStore"]}
120:   tests="100% sound"
121: >
122:   ```ts
123:   import { createStore, useStore } from "zustand";
124:   // Runnable verified recipe
125:   ```
126: </Recipe>
127: 
128: <ParamField path="options.strict" type="boolean" default="false">
129:   When enabled, throws a TypeError on conflicting route registrations.
130: </ParamField>
131: ```
132: 
133: ---
134: 
135: ## 5. Compiler Diagnostics & Suppression Directives
136: 
137: | Code | Severity | Description | Agent Action |
138: |---|---|---|---|
139: | **`DOC-101`** | **ERROR** | Missing symbol in public exports | Fix typo or export symbol from entry point. |
140: | **`DOC-102`** | **ERROR** | Parameter name or signature mismatch | Sync documentation parameter names with AST signature. |
141: | **`DOC-103`** | **ERROR** | Documented parameter not found in signature | Remove deleted parameter or update signature. |
142: | **`DOC-104`** | **ERROR** | Return type mismatch | Update documented return type to match AST return. |
143: | **`DOC-201`** | **ERROR** | Code snippet syntax or compilation error | Fix syntax errors inside markdown code fences. |
144: | **`DOC-401`** | **WARN** | Deprecated symbol without notice | Add `@deprecated` notice or migration alternative. |
145: 
146: ### Diagnostic Suppression:
147: If a claim describes historical behavior or a deliberately unexported internal symbol, suppress it explicitly:
148: 
149: ```markdown
150: <!-- chrona-ignore: DOC-101 (legacy v3 compatibility) -->
151: `legacyCreateStore` was deprecated in v4.
152: ```
153: 
154: ---
155: 
156: ## 6. Completion Gate
157: 
158: Stop and declare success when:
159: 1. `npx @chrona-engine/cli check --json` reports `errorsCount: 0`.
160: 2. All examples in `content/docs/` are syntactically valid and runnable.
161: 3. `npx @chrona-engine/cli ws` confirms `Integrity: Soundness 100% [PASS]`.
162: 
The above content shows the entire, complete file contents of the requested file.
