import type { BehavioralContract } from '../contracts/types';
import type { ImpactBoundary } from '../deps/types';

export interface CommitProvenance {
  commit: string;
  author: string;
  date: string;
  message: string;
  prNumber?: number;
  reason?: string;
}

export interface SymbolProvenanceTrace {
  symbol: string;
  file: string;
  line: number;
  created: CommitProvenance;
  evolution: Array<{
    commit: string;
    date: string;
    signature: string;
    breaking: boolean;
    reason?: string;
  }>;
  contracts: BehavioralContract[];
  evidenceSources: {
    commitCount: number;
    testsCount: number;
    dependentsCount: number;
    runtimeProbesCount: number;
  };
}

export interface WhyExplanation {
  target: string;
  status: 'ACTIVE' | 'DEPRECATED' | 'ORPHANED' | 'CRITICAL';
  created: {
    commit: string;
    date: string;
    author: string;
    reason: string;
  };
  evidenceSummary: {
    commitMessage: boolean;
    prReference?: string;
    codeReferences: number;
    tests: number;
    runtimeProbes: number;
  };
  dependents: {
    modulesCount: number;
    servicesCount: number;
    clientsCount: number;
    modules: string[];
  };
  activeContracts: BehavioralContract[];
  deletionSafety?: {
    safeToDelete: boolean;
    confidence: number;
    warningMessage?: string;
    blockingContracts: BehavioralContract[];
    recommendation: string;
  };
  lastVerifiedAt: string;
}
