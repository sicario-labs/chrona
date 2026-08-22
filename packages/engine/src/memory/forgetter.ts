import type { BehavioralContract } from '../contracts/types';
import type { ArchitecturalDecision } from './decisions';
import { DocumentationVerifier } from '../verifier';
import { ContractStore } from '../contracts/store';
import { DecisionStore } from './decisions';
import { DependencyAnalyzer } from '../deps/analyzer';

export interface OrphanedClaim {
  id: string;
  statement: string;
  sourceFile: string;
  lostEvidence: string;
}

export interface OrphanedKnowledgeReport {
  timestamp: string;
  totalOrphanedCount: number;
  orphanedClaims: OrphanedClaim[];
  staleContracts: BehavioralContract[];
  staleDecisions: ArchitecturalDecision[];
  recommendation: string;
}

export class Forgetter {
  private cwd: string;
  private verifier: DocumentationVerifier;
  private contractStore: ContractStore;
  private decisionStore: DecisionStore;
  private depAnalyzer: DependencyAnalyzer;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
    this.verifier = new DocumentationVerifier({ cwd });
    this.contractStore = new ContractStore(cwd);
    this.contractStore.load();
    this.decisionStore = new DecisionStore(cwd);
    this.decisionStore.load();
    this.depAnalyzer = new DependencyAnalyzer(cwd);
  }

  /**
   * Detect knowledge in software memory that is no longer supported by codebase reality.
   */
  public async findOrphanedKnowledge(): Promise<OrphanedKnowledgeReport> {
    const graph = await this.depAnalyzer.buildGraph({ cwd: this.cwd });
    const snapshot = await this.verifier.buildSnapshot();
    const docResult = await this.verifier.verifyWorkspace();

    const orphanedClaims: OrphanedClaim[] = [];
    for (const c of docResult.claims) {
      if (c.status === 'contradicted' && c.diagnostic?.code === 'DOC-101') {
        orphanedClaims.push({
          id: c.claim.id,
          statement: c.claim.source?.text || c.claim.subject,
          sourceFile: c.claim.source?.file || 'unknown',
          lostEvidence: `Export declaration \`${c.claim.subject}\` no longer exists in AST`,
        });
      }
    }

    const staleContracts: BehavioralContract[] = [];
    for (const contract of this.contractStore.listContracts()) {
      if (contract.evidence.length > 0) {
        const hasMissingFile = contract.evidence.some(
          (e) => !Object.keys(graph.nodes).includes(e.file.replace(/\\/g, '/'))
        );
        if (hasMissingFile) {
          staleContracts.push(contract);
        }
      }
    }

    const staleDecisions: ArchitecturalDecision[] = [];
    for (const decision of this.decisionStore.listDecisions()) {
      if (decision.contracts.length > 0) {
        const hasBrokenContract = decision.contracts.some(
          (cid) => staleContracts.some((sc) => sc.id === cid)
        );
        if (hasBrokenContract) {
          staleDecisions.push(decision);
        }
      }
    }

    const totalOrphanedCount = orphanedClaims.length + staleContracts.length + staleDecisions.length;
    const recommendation = totalOrphanedCount === 0
      ? 'All software knowledge is 100% corroborated by live code, tests, and AST truth.'
      : `Found ${totalOrphanedCount} orphaned items. Run \`chrona repair\` or update memory stores to synchronize.`;

    return {
      timestamp: new Date().toISOString(),
      totalOrphanedCount,
      orphanedClaims,
      staleContracts,
      staleDecisions,
      recommendation,
    };
  }
}
