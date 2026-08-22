import type { BehavioralContract } from '../contracts/types';
import type { ArchitecturalDecision } from './decisions';
import { MemoryStore } from './store';
import { ContractStore } from '../contracts/store';
import { DecisionStore } from './decisions';
import { DocumentationVerifier } from '../verifier';

export interface EpistemicDelta {
  subject: string;
  kind: 'CLAIM' | 'CONTRACT' | 'DECISION' | 'SIGNATURE';
  change: 'NEW' | 'LOST' | 'MODIFIED' | 'STRENGTHENED' | 'WEAKENED';
  description: string;
}

export interface EpistemicDiffReport {
  timestamp: string;
  summary: {
    newKnowledgeCount: number;
    lostKnowledgeCount: number;
    modifiedCount: number;
    soundnessChangePercent: string;
  };
  deltas: EpistemicDelta[];
  contracts: {
    established: string[];
    broken: string[];
  };
  decisions: {
    upheld: string[];
    challenged: string[];
  };
}

export class EpistemicDiffer {
  private cwd: string;
  private memoryStore: MemoryStore;
  private contractStore: ContractStore;
  private decisionStore: DecisionStore;
  private verifier: DocumentationVerifier;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
    this.memoryStore = new MemoryStore(cwd);
    this.memoryStore.load();
    this.contractStore = new ContractStore(cwd);
    this.contractStore.load();
    this.decisionStore = new DecisionStore(cwd);
    this.decisionStore.load();
    this.verifier = new DocumentationVerifier({ cwd });
  }

  /**
   * Compute epistemic difference in the software's self-understanding across commits/verification cycles.
   */
  public async computeDiff(): Promise<EpistemicDiffReport> {
    const currentResult = await this.verifier.verifyWorkspace();
    const snapshots = this.memoryStore.getSnapshots();
    const previous = snapshots.length > 1 ? snapshots[snapshots.length - 2] : null;

    const deltas: EpistemicDelta[] = [];
    const establishedContracts: string[] = [];
    const brokenContracts: string[] = [];

    // Contracts inspection
    for (const contract of this.contractStore.listContracts()) {
      if (contract.status === 'active') {
        establishedContracts.push(contract.statement);
        deltas.push({
          subject: contract.id,
          kind: 'CONTRACT',
          change: 'NEW',
          description: `Contract established: "${contract.statement}"`,
        });
      } else if (contract.status === 'violated') {
        brokenContracts.push(contract.statement);
        deltas.push({
          subject: contract.id,
          kind: 'CONTRACT',
          change: 'LOST',
          description: `Contract violated: "${contract.statement}" (${contract.violationMessage || 'assertion failed'})`,
        });
      }
    }

    // Diagnostics & drift
    for (const d of currentResult.diagnostics) {
      deltas.push({
        subject: d.claim || d.file,
        kind: 'CLAIM',
        change: 'LOST',
        description: `[${d.code}] ${d.message}`,
      });
    }

    // Decisions inspection
    const decisions = this.decisionStore.listDecisions();
    const upheld = decisions.filter((d) => d.status === 'active').map((d) => d.statement);
    const challenged = decisions.filter((d) => d.status === 'stale').map((d) => d.statement);

    const newCount = establishedContracts.length + currentResult.summary.claimsVerified;
    const lostCount = brokenContracts.length + currentResult.summary.contradictionsFound;

    const prevSoundness = previous ? (previous.summary.claimsVerified / Math.max(1, previous.summary.totalClaims)) * 100 : 98.7;
    const currSoundness = (currentResult.summary.claimsVerified / Math.max(1, currentResult.claims.length)) * 100;
    const soundnessDiff = currSoundness - prevSoundness;
    const soundnessChangePercent = `${soundnessDiff >= 0 ? '+' : ''}${soundnessDiff.toFixed(1)}%`;

    return {
      timestamp: new Date().toISOString(),
      summary: {
        newKnowledgeCount: establishedContracts.length,
        lostKnowledgeCount: lostCount,
        modifiedCount: deltas.length,
        soundnessChangePercent,
      },
      deltas,
      contracts: {
        established: establishedContracts,
        broken: brokenContracts,
      },
      decisions: {
        upheld,
        challenged,
      },
    };
  }
}
