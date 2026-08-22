import type { Evidence, EvidenceStrength } from '../claim/types';

export type ContractType =
  | 'invariant'          // Must always hold true (e.g. valid session, balanced state)
  | 'precondition'       // Must hold before an operation (e.g. non-empty token, active connection)
  | 'postcondition'      // Must hold after an operation (e.g. user authenticated, resource created)
  | 'dependency'         // X requires Y (e.g. mobile client depends on session endpoint)
  | 'authorization'      // Role/permission constraint (e.g. admin routes require role=admin)
  | 'persistence'        // State survival (e.g. sessions survive browser refresh)
  | 'compatibility'      // Backward compatibility constraint (e.g. API shape preserved for v1)
  | 'performance'        // Latency or throughput bounds (e.g. timeout < 24h, cache hit rate)
  | 'architectural';     // Explicit system boundary decisions (e.g. shared session across web+mobile)

export type ContractOrigin =
  | 'test-inference'     // Extracted from test assertions (expect(), assert(), etc.)
  | 'code-assertion'     // Extracted from code guards and throw statements
  | 'git-history'        // Inferred from commit patterns and PR discussions
  | 'developer-declared' // Stated explicitly via chrona remember
  | 'ai-proposed';       // Synthesized by AI agent during change planning

export type ContractStatus = 'active' | 'violated' | 'stale' | 'archived';

export interface ContractEvidence {
  source: 'ast-guard' | 'test-assertion' | 'type-constraint' | 'git-commit' | 'runtime-observation' | 'declaration';
  file: string;
  line?: number;
  snippet?: string;
  description: string;
  strength: EvidenceStrength;
  confidence: number;
}

export interface BehavioralContract {
  id: string;                         // CONTRACT-001 or c_auth_01
  type: ContractType;
  statement: string;                  // e.g. "Mobile clients must survive token refresh"
  subject: string;                    // Symbol, module path, or boundary name
  status: ContractStatus;
  confidence: number;                 // 0.0 to 1.0
  origin: ContractOrigin;
  evidence: ContractEvidence[];
  dependents: string[];               // Dependent files, services, modules
  preconditions?: string[];
  postconditions?: string[];
  violationMessage?: string;
  createdAt: string;
  lastVerifiedAt: string;
  sourceCommit?: string;
  metadata?: Record<string, unknown>;
}

export interface ContractVerificationResult {
  contractId: string;
  statement: string;
  status: 'preserved' | 'violated' | 'unverifiable';
  confidence: number;
  evidenceFound: ContractEvidence[];
  diagnostics: string[];
  testedAgainstCommit: string;
  timestamp: string;
}

export interface ContractRegistryData {
  version: 1;
  projectName: string;
  updatedAt: string;
  contracts: Record<string, BehavioralContract>;
}
