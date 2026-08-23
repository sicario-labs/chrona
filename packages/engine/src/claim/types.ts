import type { ExtractedSymbol } from '../referee/oxc-extractor';
import type { CompilerDiagnostic } from '../compiler-types';
import type { RepositoryIndex } from '../types';

export type SubjectScope =
  | 'workspace'   // Symbol defined within the current repository source tree
  | 'dependency'  // Symbol provided by external npm dependencies (e.g. react, immer, redux)
  | 'platform'    // Built-in globals (e.g. Map, Set, Promise, fetch, Response, Request, process)
  | 'runtime'     // Dynamic runtime environment context
  | 'external'    // Known external ecosystem references
  | 'unknown';

export type ClaimType =
  | 'symbol'        // foo() exists
  | 'signature'     // foo(x: string): void
  | 'parameter'     // foo accepts { name: string } or foo(a, b)
  | 'return'        // foo returns Promise<User>
  | 'behavior'      // updates subscribers synchronously, pure function, etc.
  | 'ordering'      // call init() before dispatch()
  | 'side_effect'   // mutates state, emits event, writes to disk
  | 'error'         // throws TypeError on invalid input
  | 'async'         // returns Promise or executes asynchronously
  | 'default'       // default timeout is 5000ms
  | 'dependency'    // requires react >= 18
  | 'example'       // code snippet compiles
  | 'command'       // chrona check --json works
  | 'configuration' // chrona.config.ts accepts `rules`
  | 'link'          // this URL / internal link resolves
  | 'version';      // this API exists in v19

export type ClaimStatus =
  | 'verified'      // evidence confirms this claim
  | 'contradicted'  // evidence contradicts this claim
  | 'unverified'    // no evidence found (neutral, not an error)
  | 'ambiguous';    // evidence is conflicting or unclear

export interface ClaimSource {
  file: string;
  line: number;
  column?: number;
  startOffset?: number;
  endOffset?: number;
  text: string;
}

export type EvidenceSource =
  | 'typescript-ast'
  | 'platform-builtin'
  | 'dependency-export'
  | 'dependency-types'
  | 'test-assertion'
  | 'runtime-probe'
  | 'package-json'
  | 'compiled-example'
  | 'git-commit'
  | 'link-check'
  | 'manual'
  | 'import-graph'
  | 'behavioral-contract'
  | 'git-provenance'
  | 'deployment-config'
  | 'environment-variable';

export type EvidenceStrength =
  | 'STRONG'              // Local AST, Type declarations, exact test assertion, executable probe
  | 'SUPPORTING'          // Package metadata, dependency exports, tsconfig lib
  | 'HISTORICAL'          // Git commit history, changelog
  | 'WEAK'                // Loose heuristic or markdown link match
  | 'NEVER_AUTHORITATIVE'; // AI interpretation without ground-truth execution

export interface Evidence {
  source: EvidenceSource;
  file: string;
  line?: number;
  data: unknown;
  confidence: number; // 0.0 - 1.0, derived from evidence quality
  strength?: EvidenceStrength;
  description?: string;
}

export interface Claim {
  id: string;
  type: ClaimType;
  source: ClaimSource;
  subject: string;
  subjectScope?: SubjectScope;
  metadata?: Record<string, unknown>;
  evidence: Evidence[];
  status: ClaimStatus;
}

export interface RepositorySnapshot {
  commit?: string;
  files: Map<string, string>;
  symbols: Map<string, ExtractedSymbol>;
  astIndex?: RepositoryIndex;
  claims?: Claim[];
}

export interface VerificationConfig {
  rules?: Record<string, 'error' | 'warning' | 'info' | 'off'>;
  paths?: string[];
  strict?: boolean;
}

export interface ClaimResult {
  claim: Claim;
  status: ClaimStatus;
  evidence: Evidence[];
  diagnostic?: CompilerDiagnostic;
}

export interface VerificationResult {
  schemaVersion?: 'v1';
  status: 'pass' | 'warn' | 'fail';
  errorsCount: number;
  warningsCount: number;
  infoCount: number;
  claims: ClaimResult[];
  diagnostics: CompilerDiagnostic[];
  summary: {
    claimsVerified: number;
    contradictionsFound: number;
    unverifiedCount: number;
    ambiguousCount: number;
    suppressedCount?: number;
    verificationTimeMs: number;
  };
}

