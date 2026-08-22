/**
 * Chrona Developer Experience Compiler — Versioned Data Models (v1)
 *
 * Epistemic Hierarchy:
 * - REPOSITORY: Source of Truth (Source code, tests, Git history)
 * - DX GRAPH: Persistent Compiler Intermediate Representation (IR) / Cache
 * - PROJECTIONS: Rendered MDX (Fumadocs), Agent Context (llms.txt), CI Gates
 */

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export type DiagnosticCode =
  | 'DOC-101' // MISSING_SYMBOL / MISSING_EXPORT
  | 'DOC-102' // SIGNATURE_MISMATCH
  | 'DOC-103' // PARAMETER_MISMATCH / MISSING_PARAMETER
  | 'DOC-104' // CONTRADICTED_CLAIM
  | 'DOC-107' // TYPE_MISMATCH
  | 'DOC-201' // BROKEN_EXAMPLE / RECIPE_EXECUTION_FAILURE
  | 'DOC-202' // RECIPE_REGRESSION
  | 'DOC-301' // CROSS_DOC_CONTRADICTION
  | 'DOC-401' // DEPRECATED_WITHOUT_NOTICE
  | 'DOC-501'; // TASK_DEGRADATION

export * from './claim/types';

export interface CompilerDiagnostic {
  code: DiagnosticCode;
  severity: DiagnosticSeverity;
  message: string;
  file: string;
  line?: number;
  claim?: string;
  evidence?: string[];
  suggestedAction?: string;
}

export interface CompilerVerificationReport {
  schemaVersion: 'v1';
  status: 'pass' | 'warn' | 'fail';
  errorsCount: number;
  warningsCount: number;
  infoCount: number;
  diagnostics: CompilerDiagnostic[];
}

/**
 * Discovery Evidence Graph (v1) — Emitted by `chrona discover --json`
 */
export interface EvidenceGraph {
  schemaVersion: 'v1';
  repository: string;
  sourceCommit: string;
  exports: Array<{
    name: string;
    signature: string;
    file: string;
    line: number;
    isDeprecated?: boolean;
  }>;
  types: Array<{
    name: string;
    definition: string;
    file: string;
  }>;
  tests: Array<{
    name: string;
    file: string;
    targetSymbol?: string;
  }>;
  cliCommands: Array<{
    command: string;
    description: string;
    options: string[];
  }>;
  generatedAt: string;
}

/**
 * Developer Experience Graph (DX Graph IR)
 */
export type DXNodeType =
  | 'task'
  | 'prerequisite'
  | 'api'
  | 'type'
  | 'example'
  | 'recipe'
  | 'error'
  | 'cli_command'
  | 'configuration'
  | 'test'
  | 'doc_page'
  | 'next_task';

export interface DXGraphNode {
  id: string;
  type: DXNodeType;
  name: string;
  data: Record<string, unknown>;
}

export interface DXGraphEdge {
  from: string;
  to: string;
  relationship:
    | 'solves'
    | 'requires'
    | 'composes'
    | 'exemplifies'
    | 'projects_to'
    | 'handles'
    | 'leads_to';
}

export interface DeveloperExperienceGraph {
  nodes: Record<string, DXGraphNode>;
  edges: DXGraphEdge[];
  lastCalculatedAt: string;
}

export interface DXGraphCache {
  schemaVersion: 'v1';
  sourceCommit: string;
  sourceFingerprint: string;
  generatedAt: string;
  graph: DeveloperExperienceGraph;
}

/**
 * 4-Stage Sandboxed Recipe Lifecycle:
 * candidate → static_safe → executable → behaviorally_verified
 */
export type RecipeStatus = 'candidate' | 'static_safe' | 'executable' | 'behaviorally_verified';

export type EpistemicClassification =
  | 'ast_fact'
  | 'recipe_behavior'
  | 'developer_usefulness'
  | 'authorial_intent';

export type UnverifiedKind =
  | 'narrative_claim'
  | 'recipe_intent'
  | 'behavioral_assumption'
  | 'incomplete_evidence'
  | 'ambiguous_api';

export interface TaskRecipe {
  id: string;
  goal: string;
  task: string;
  inputs: string[];
  apis: string[];
  constraints: string[];
  steps: RecipeStep[];
  example: TaskExample;
  verification: SuccessCriterion[];
  evidence: TaskEvidence[];
  harness?: RecipeTestHarness;
  provenance: {
    origin: 'agent_composition';
    status: RecipeStatus;
    epistemicClassification: EpistemicClassification;
    confidenceReason?: string;
  };
}

export interface RecipeTestCase {
  name: string;
  input: unknown;
  expected: unknown;
  passed?: boolean;
}

export interface RecipeTestHarness {
  recipeId: string;
  cases: RecipeTestCase[];
  executedAt?: string;
  allPassed?: boolean;
}

export interface RecipeStep {
  id: string;
  instruction: string;
  api: string;
}

export interface DocumentationTask {
  id: string;
  goal: string;
  audience: string;
  prerequisites: string[];
  steps: TaskStep[];
  successCriteria: SuccessCriterion[];
  recipes?: TaskRecipe[];
  pages: string[];
  evidence: TaskEvidence[];
  examples: TaskExample[];
  nextTasks: string[];
}

export interface TaskStep {
  id: string;
  instruction: string;
  evidence: TaskEvidence[];
  examples: string[];
}

export type VerificationType = 'ast' | 'execution' | 'link' | 'agent' | 'manual';

export interface SuccessCriterion {
  description: string;
  verification: VerificationType;
}

export interface TaskEvidence {
  claim: string;
  sourceFile: string;
  line?: number;
  kind: 'symbol' | 'type' | 'export' | 'cli' | 'test';
}

export interface TaskExample {
  title: string;
  code: string;
  sourceFile: string;
  runnable: boolean;
}

/**
 * Structured Actions for Agent Work Order (v1)
 */
export type WorkOrderActionType =
  | 'update_claims'
  | 'rerun_examples'
  | 'repair_recipe'
  | 'document_new_export'
  | 'add_deprecation_notice'
  | 'recheck';

export interface WorkOrderAction {
  type: WorkOrderActionType;
  targets?: string[];
  description: string;
}

/**
 * Agent Work Order (v1) — Emitted by `chrona impact --json`
 */
export interface AgentWorkOrder {
  schemaVersion: 'v1';
  status: 'clean' | 'needs_repair';
  commit: string;
  changeSummary: string;
  affectedTasks: string[];
  affectedRecipes: string[];
  affectedPages: string[];
  affectedExamples: string[];
  affectedClaimsCount: number;
  requiredActions: WorkOrderAction[];
  unaffected: {
    tasksCount: number;
    pagesCount: number;
    claimsCount: number;
  };
}

/**
 * DX Evaluation Result (v1) — Emitted by `chrona bench --json`
 */
export interface DXEvaluationResult {
  schemaVersion: 'v1';
  repository: string;
  dtsr: number; // Developer Task Success Rate (e.g. 100%)
  ttfstSeconds: number; // Time to First Successful Task (e.g. 132s)
  dxIntegrity: number; // Overall DX Integrity score %
  tasksEvaluated: number;
  tasksPassed: number;
  tasksFailed: number;
  discoveryCoverage: number;
  executableExamplesRate: number;
  contradictedClaims: number;
  unverifiedNarrative: number;
  diagnostics: {
    errors: number;
    warnings: number;
    info: number;
  };
}
