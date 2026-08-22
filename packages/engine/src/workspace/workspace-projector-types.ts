import type { Claim } from '../claim/types';
import type { BehavioralContract } from '../contracts/types';
import type { ChangeBoundary } from '../change/types';
import type { ClaimCoverage } from './evidence-graph';

export interface WorkspaceProjectionRequest {
  cwd?: string;
  task: string;
  intent?: 'modify' | 'create' | 'delete' | 'investigate' | 'evaluate' | 'refactor';
  target?: string;
  tokenBudget?: number; // Default: 8000
  includeSourceSlices?: boolean; // Default: true
}

export interface TaskWorkspacePacket {
  /** Uniquely identifies this specific task projection */
  workspaceId: string; // e.g. ws_9d72a3b1

  /** Pinned canonical snapshot identity of the underlying repository */
  snapshotId: string; // e.g. snap_1b3f9a8c

  /** ISO timestamp */
  generatedAt: string;

  /** Epistemic manifest detailing boundaries, proof states, and omissions */
  manifest: {
    purpose: string;
    intent: string;
    target: string;
    assumptions: string[];
    unresolvedQuestions: string[];
    claimCoverage: ClaimCoverage[];
    omittedEvidence: Array<{
      item: string;
      reason: string;
    }>;
  };

  /** Machine-readable facts about the bounded task world (What is true) */
  reality: {
    target: {
      file: string;
      line?: number;
      symbol?: string;
      signature?: string;
    };
    architecture: {
      callChain: string[];
      sideEffects: string[];
    };
    dependencies: {
      graphEdges: Array<{ from: string; to: string; symbols: string[] }>;
      transitiveClosure: string[];
      externalPackages: string[];
    };
    contracts: BehavioralContract[];
    config: {
      files: string[];
      envVars: string[];
      dbTables: string[];
    };
    tests: {
      files: string[];
      coverageGaps: string[];
    };
    provenance: {
      created?: { commit: string; date: string; author: string; reason: string };
      recentChanges: number;
      relatedIncidents: string[];
    };
    risks: Array<{
      level: 'HIGH' | 'MEDIUM' | 'LOW';
      description: string;
      mitigation: string;
    }>;
    boundary: ChangeBoundary;
  };

  /** The verified external package reality projected into this task (Third-party dependencies) */
  externalReality?: Record<string, import('../registry/resolver').ExternalPackageReality>;

  /** Selected evidence proving the reality, and bounded source code (Why we believe it) */
  evidence: {
    claims: Claim[];
    gitEvidence: Array<{
      commit: string;
      author: string;
      date: string;
      message: string;
    }>;
    sourceSlices: Array<{
      id: string;
      file: string;
      startLine: number;
      endLine: number;
      content: string;
      role: 'target' | 'dependent' | 'test' | 'config' | 'infrastructure';
      proves: string[];
      confidence: number;
    }>;
  };

  /** Quality and efficiency metrics for this projection */
  projection: {
    quality: 'VALID' | 'DEGRADED' | 'INVALID'; // Quality certificate of the compiled packet
    evidenceSufficiency: number; // 0.0 - 1.0 (Critical requirements directly actionable)
    minimumSufficientBudget: number; // Minimum tokens required to satisfy all critical requirements
    recommendedTokenBudget: number; // Tokens required for full evidence saturation
    missingCriticalEvidence?: Array<{ item: string; tokensNeeded: number }>;
    coverageScore: number; // 0.0 - 1.0 (estimated evidence coverage)
    precisionScore: number; // 0.0 - 1.0 (ratio of relevant to irrelevant context)
    evidenceCompleteness: number; // 0.0 - 1.0
    boundaryCompleteness: number; // 0.0 - 1.0
    contextEfficiency: number; // evidence-covered claims / source tokens
    tokenCount: number; // tokens in materialized source slices
    tokenBudget: number;
    filesInspected: number;
    filesIncluded: number;
  };
}
