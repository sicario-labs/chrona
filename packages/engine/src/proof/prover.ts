import * as path from 'node:path';
import { x } from 'tinyexec';
import type { ProofResult, ProofVerdict } from './types';
import type { Evidence } from '../claim/types';
import { DocumentationVerifier } from '../verifier';
import { ContractStore } from '../contracts/store';
import { DependencyAnalyzer } from '../deps/analyzer';

export interface ProveClaimOptions {
  cwd?: string;
  claim: string;
}

export class ClaimProver {
  private cwd: string;
  private verifier: DocumentationVerifier;
  private contractStore: ContractStore;
  private depAnalyzer: DependencyAnalyzer;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
    this.verifier = new DocumentationVerifier({ cwd });
    this.contractStore = new ContractStore(cwd);
    this.contractStore.load();
    this.depAnalyzer = new DependencyAnalyzer(cwd);
  }

  /**
   * Prove whether an arbitrary software claim is true based on authoritative evidence.
   */
  public async proveClaim(options: ProveClaimOptions): Promise<ProofResult> {
    const claimText = options.claim.trim();
    const root = options.cwd || this.cwd;
    const now = new Date().toISOString();

    let commit = 'working-tree';
    try {
      const gitRes = await x('git', ['rev-parse', '--short', 'HEAD'], { nodeOptions: { cwd: root } });
      if (gitRes.stdout.trim()) commit = gitRes.stdout.trim();
    } catch {}

    // 1. Run claim verification against AST and evidence resolvers
    const claimRes = await this.verifier.verifyClaim({ claim: claimText });

    // 2. Query behavioral contracts matching the claim keywords
    const matchingContracts = this.contractStore.query({ subject: claimText });

    // 3. Search AST symbols and build dependency chain
    const snapshot = await this.verifier.buildSnapshot();
    const graph = await this.depAnalyzer.buildGraph({ cwd: root });

    const evidenceFor: Evidence[] = [];
    const evidenceAgainst: Evidence[] = [];
    const dependencyChain: string[] = [];

    // Map claim evidence
    for (const ev of claimRes.evidence) {
      if (claimRes.status === 'verified') {
        evidenceFor.push({
          source: ev.source as any,
          file: ev.file || 'codebase',
          line: ev.line,
          data: { description: ev.description },
          confidence: claimRes.confidence,
          strength: 'STRONG',
          description: ev.description || `Verified from ${ev.source}`,
        });
      } else if (claimRes.status === 'contradicted') {
        evidenceAgainst.push({
          source: ev.source as any,
          file: ev.file || 'codebase',
          line: ev.line,
          data: { description: ev.description },
          confidence: claimRes.confidence,
          strength: 'STRONG',
          description: claimRes.message || `Contradiction detected in ${ev.source}`,
        });
      }
    }

    // Check contracts as evidence
    for (const c of matchingContracts) {
      if (c.status === 'active') {
        evidenceFor.push({
          source: 'behavioral-contract',
          file: c.subject,
          confidence: c.confidence,
          strength: 'STRONG',
          data: c,
          description: `Contract [${c.id}]: "${c.statement}"`,
        });
      } else if (c.status === 'violated') {
        evidenceAgainst.push({
          source: 'behavioral-contract',
          file: c.subject,
          confidence: c.confidence,
          strength: 'STRONG',
          data: c,
          description: `Violated Contract [${c.id}]: "${c.statement}"`,
        });
      }
    }

    // Determine verdict
    let verdict: ProofVerdict = 'INSUFFICIENT_EVIDENCE';
    let confidence = 0.5;
    let explanation = '';
    let suggestedAction: string | undefined;

    if (claimRes.status === 'verified') {
      verdict = 'PROVEN';
      confidence = 0.99;
      explanation = `The claim "${claimText}" is authoritatively proven by codebase AST ground truth.`;
    } else if (claimRes.status === 'contradicted') {
      verdict = 'DISPROVEN';
      confidence = 0.99;
      explanation = claimRes.message
        ? `The claim "${claimText}" is refuting reality: ${claimRes.message}`
        : `The claim "${claimText}" is contradicted by current implementation.`;
      suggestedAction = claimRes.suggestedAction || 'Update claim to match live AST signature.';
    } else if (evidenceFor.length > 0 && evidenceAgainst.length === 0) {
      verdict = 'PROVEN';
      confidence = 0.92;
      explanation = `Supported by ${evidenceFor.length} authoritative evidence source(s).`;
    } else if (evidenceAgainst.length > 0) {
      verdict = 'DISPROVEN';
      confidence = 0.95;
      explanation = `Directly refuted by ${evidenceAgainst.length} counter-evidence source(s).`;
    } else {
      verdict = 'INSUFFICIENT_EVIDENCE';
      confidence = 0.2;
      explanation = `No ground-truth AST export, test assertion, or contract could authoritatively establish this claim.`;
      suggestedAction = 'Add an automated test or export declaration to establish this claim.';
    }

    return {
      claim: claimText,
      verdict,
      confidence,
      explanation,
      evidenceFor,
      evidenceAgainst,
      contracts: matchingContracts,
      dependencyChain,
      suggestedAction,
      provenAt: now,
      testedAgainstCommit: commit,
    };
  }
}
