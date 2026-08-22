import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { BehavioralContract, ContractVerificationResult } from './types';
import { ContractStore } from './store';
import { ContractExtractor } from './extractor';

export interface VerifyContractsOptions {
  cwd?: string;
  contracts?: BehavioralContract[];
  commit?: string;
}

export class ContractVerifier {
  private cwd: string;
  private store: ContractStore;
  private extractor: ContractExtractor;

  constructor(options: { cwd?: string } = {}) {
    this.cwd = options.cwd || process.cwd();
    this.store = new ContractStore(this.cwd);
    this.store.load();
    this.extractor = new ContractExtractor(this.cwd);
  }

  /**
   * Verify all active behavioral contracts against live source and test codebase.
   */
  public async verifyAll(options: VerifyContractsOptions = {}): Promise<ContractVerificationResult[]> {
    const contracts = options.contracts || this.store.listContracts();
    const commit = options.commit || 'HEAD';
    const results: ContractVerificationResult[] = [];
    const now = new Date().toISOString();

    for (const contract of contracts) {
      const result = await this.verifySingle(contract, commit);
      results.push(result);

      if (result.status === 'violated') {
        this.store.recordViolation(contract.id, result.diagnostics.join('; '));
      } else if (result.status === 'preserved') {
        this.store.resolveViolation(contract.id);
      }
    }

    this.store.save();
    return results;
  }

  /**
   * Verify a single contract against live evidence in the codebase.
   */
  public async verifySingle(contract: BehavioralContract, commit: string = 'HEAD'): Promise<ContractVerificationResult> {
    const now = new Date().toISOString();
    const diagnostics: string[] = [];
    let preserved = true;

    // Check evidence files
    for (const ev of contract.evidence) {
      const fullPath = path.resolve(this.cwd, ev.file);
      try {
        const content = await fs.readFile(fullPath, 'utf-8');
        if (ev.snippet) {
          const cleanSnippet = ev.snippet.trim();
          if (!content.includes(cleanSnippet)) {
            // Check if loose match still holds
            const normalized = cleanSnippet.replace(/\s+/g, ' ');
            const contentNorm = content.replace(/\s+/g, ' ');
            if (!contentNorm.includes(normalized)) {
              diagnostics.push(`Evidence snippet missing in ${ev.file}:${ev.line || 1}`);
              preserved = false;
            }
          }
        }
      } catch {
        diagnostics.push(`Evidence file ${ev.file} cannot be accessed or was deleted`);
        preserved = false;
      }
    }

    const status = preserved
      ? 'preserved'
      : contract.evidence.length === 0
      ? 'unverifiable'
      : 'violated';

    return {
      contractId: contract.id,
      statement: contract.statement,
      status,
      confidence: preserved ? contract.confidence : 0.2,
      evidenceFound: preserved ? contract.evidence : [],
      diagnostics,
      testedAgainstCommit: commit,
      timestamp: now,
    };
  }

  public getStore(): ContractStore {
    return this.store;
  }
}
