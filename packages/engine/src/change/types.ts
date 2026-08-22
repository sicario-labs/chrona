import type { BehavioralContract } from '../contracts/types';
import type { Evidence } from '../claim/types';

export interface ChangeBoundary {
  sourceModules: string[];
  apiEndpoints: string[];
  databaseTables: string[];
  tests: string[];
  documentationPages: string[];
  environmentVariables: string[];
  deploymentConfigs: string[];
}

export interface HistoricalConstraint {
  subject: string;
  introducedDate: string;
  introducedCommit: string;
  reason: string;
}

export interface BreakageRisk {
  level: 'HIGH' | 'MEDIUM' | 'LOW';
  subject: string;
  description: string;
  affectedConsumer: string;
  mitigation: string;
}

export interface MigrationStep {
  order: number;
  title: string;
  description: string;
  targetFiles: string[];
  requiredChecks: string[];
}

export interface ChangeModel {
  id: string;
  workspaceId?: string;              // Linked workspace projection (e.g. ws_b069cbd446da)
  snapshotId?: string;               // Linked canonical snapshot (e.g. snap_f7ee3b25b369d591)
  request: string;
  boundary: ChangeBoundary;
  historicalConstraints: HistoricalConstraint[];
  behavioralContracts: BehavioralContract[];
  breakageRisks: BreakageRisk[];
  migrationSteps: MigrationStep[];
  evidenceSummary: {
    codeReferences: number;
    tests: number;
    historicalCommits: number;
    runtimeObservations: number;
  };
  confidence: number;
  generatedAt: string;
}

export interface VerificationReceipt {
  id: string;                        // e.g. CHRONA-PROOF-9D72A3...
  changeId: string;
  workspaceId?: string;              // Linked workspace projection (e.g. ws_b069cbd446da)
  snapshotId?: string;               // Linked canonical snapshot (e.g. snap_f7ee3b25b369d591)
  request: string;
  timestamp: string;
  commit: string;
  branch: string;

  summary: {
    filesChanged: number;
    testsExecuted: number;
    behavioralProbes: number;
    documentationUpdated: number;
  };

  claims: {
    preChange: number;
    invalidated: number;
    reVerified: number;
    newContradictions: number;
  };

  contractsPreserved: Array<{
    id: string;
    statement: string;
    status: 'preserved';
  }>;

  contractsViolated: Array<{
    id: string;
    statement: string;
    status: 'violated';
    diagnostic: string;
  }>;

  evidenceCoverage: number;          // 0.0 to 1.0 (e.g. 0.987 = 98.7%)
  hash: string;                      // Deterministic SHA-256 payload checksum
  signature: string;                 // Cryptographic signature
  publicKey?: string;
  verifiedStatus: 'PASS' | 'FAIL';
}
