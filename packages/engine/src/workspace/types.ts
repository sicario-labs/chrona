import type { Claim, RepositorySnapshot } from '../claim/types';
import type { CompilerDiagnostic } from '../compiler-types';
import type { ExtractedSymbol } from '../referee/oxc-extractor';

export interface WorkspaceManifest {
  id: string;
  name: string;
  repo?: string;
  root: string;
  commit: string;
  branch: string;
}

export interface WorkspaceSoftwareModel {
  symbolsCount: number;
  exportsCount: number;
  typesCount: number;
  modulesCount: number;
  symbols: Map<string, ExtractedSymbol>;
  types: Map<string, ExtractedSymbol>;
  modules: string[];
}

export interface WorkspaceKnowledgeModel {
  pagesCount: number;
  claimsCount: number;
  verifiedCount: number;
  warningCount: number;
  contradictionCount: number;
  codeClaimsCount?: number;
  codeClaimsVerified?: number;
  claims: Claim[];
  concepts: string[];
  examples: {
    id: string;
    file: string;
    line: number;
    code: string;
    isExecutable: boolean;
  }[];
}

export interface WorkspaceEvidenceModel {
  astEvidence: boolean;
  gitEvidence: boolean;
  packageMetadata: boolean;
  executableExamples: boolean;
  snapshot: RepositorySnapshot;
}

export type RelationshipKind =
  | 'IMPLEMENTED_BY'
  | 'DOCUMENTED_BY'
  | 'USED_IN'
  | 'EXPORTED_FROM'
  | 'CHANGED_BY'
  | 'VERIFIED_BY';

export interface WorkspaceRelationship {
  source: string;
  relation: RelationshipKind;
  target: string;
  metadata?: Record<string, unknown>;
}

export type WorkspaceStatus = 'pass' | 'warn' | 'fail' | 'insufficient_evidence';

export interface WorkspaceIntegrity {
  score: number; // 0.0 to 1.0 (e.g. 0.948)
  scorePercent: string; // "94.8%" or "N/A"
  status: WorkspaceStatus;
  claimCoverage: number; // 0.0 to 1.0
  evidenceCoverage: number; // 0.0 to 1.0
  epistemicBreakdown: {
    verified: number;
    contradicted: number;
    unverified: number;
    ambiguous: number;
    suppressed: number;
  };
  lastVerifiedAt: string;
  diagnostics: CompilerDiagnostic[];
  diagnosticsByCode: Record<string, number>;
}

export interface WorkspaceVerifiedContext {
  scope: string;
  entryPoints: { name: string; file: string; line: number; signature?: string }[];
  publicApi: { name: string; signature: string; returnType?: string }[];
  verifiedExamples: { file: string; line: number; snippet: string }[];
  knownDrift: { code: string; message: string; file: string; line: number }[];
  evidence: {
    astProvenance: boolean;
    packageJson: boolean;
    executableExample: boolean;
    commit: string;
  };
}

export interface WorkspaceExplanation {
  symbol: string;
  implementation: {
    file: string;
    line: number;
    signature: string;
    returnType?: string;
  };
  documentation: {
    totalReferences: number;
    verified: { file: string; line: number; text: string }[];
    contradictions: { file: string; line: number; code: string; message: string }[];
    unverified?: { file: string; line: number; text: string; reason: string }[];
  };
  recentHistory: {
    commit: string;
    branch: string;
    lastVerifiedAt: string;
  };
  verdict: {
    confidence: number;
    status: 'VERIFIED' | 'CONTRADICTED' | 'UNVERIFIED' | 'AMBIGUOUS';
    explanation: string;
  };
  evidenceChain: string[];
  blastRadius?: string[];
}

export interface WorkspaceOverview {
  manifest: WorkspaceManifest;
  sources: {
    symbols: number;
    exports: number;
    types: number;
    modules: number;
  };
  documentation: {
    pages: number;
    claims: number;
    verified: number;
    warnings: number;
    contradictions: number;
    unverified: number;
    suppressed: number;
    codeClaims?: number;
    codeClaimsVerified?: number;
    claimCoveragePercent: string;
    evidenceCoveragePercent: string;
  };
  evidence: {
    ast: boolean;
    git: boolean;
    packageMetadata: boolean;
    executableExamples: boolean;
  };
  integrity: {
    scorePercent: string;
    status: WorkspaceStatus;
    lastVerifiedAt: string;
  };
}

