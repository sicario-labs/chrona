import fs from 'node:fs/promises';
import path from 'node:path';
import type { Claim } from '../claim/types';
import type { BehavioralContract } from '../contracts/types';
import type { ExtractedSymbol } from '../referee/oxc-extractor';
import type { WorkspaceSnapshot } from './snapshot-types';

export interface EvidenceCandidate {
  id: string; // Unique deterministic identifier e.g. "src/router.ts:42-88"
  file: string;
  startLine: number;
  endLine: number;
  content: string;
  proves: string[]; // Claim IDs and Contract IDs proven by this source slice
  confidence: number;
  criticality: number; // 1 (Critical) to 5 (Contextual)
  specificity: number;
  tokenCost: number; // Approximate token count
  role: 'target' | 'dependent' | 'test' | 'config' | 'infrastructure';
}

export type ClaimCoverage =
  | {
      status: 'PROVEN';
      claimId: string;
      statement: string;
      evidenceIds: string[];
    }
  | {
      status: 'PARTIAL';
      claimId: string;
      statement: string;
      evidenceIds: string[];
      missingEvidenceIds: string[];
    }
  | {
      status: 'UNPROVEN';
      claimId: string;
      statement: string;
      reason: string;
    };

export class EvidenceGraph {
  private snapshot: WorkspaceSnapshot;

  constructor(snapshot: WorkspaceSnapshot) {
    this.snapshot = snapshot;
  }

  /**
   * Extract keywords from task and target.
   */
  public extractTaskKeywords(task: string, target?: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'in', 'to', 'for', 'of', 'and', 'or', 'with',
      'is', 'are', 'on', 'at', 'by', 'from', 'this', 'that', 'add',
      'update', 'remove', 'delete', 'modify', 'refactor', 'make',
      'support', 'ensure', 'implement', 'fix', 'endpoint', 'service',
    ]);

    const combined = `${task} ${target || ''}`.toLowerCase();
    return combined
      .replace(/[^a-z0-9\s_\-\/]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));
  }

  /**
   * Discover and link all evidence candidates to relevant claims and contracts.
   */
  public async buildEvidencePool(options: {
    task: string;
    intent?: string;
    target?: string;
  }): Promise<{
    candidates: EvidenceCandidate[];
    relevantClaims: Claim[];
    relevantContracts: BehavioralContract[];
  }> {
    const keywords = this.extractTaskKeywords(options.task, options.target);
    const targetQuery = (options.target || '').toLowerCase().trim();

    // 1. Identify relevant Claims
    const relevantClaims = this.snapshot.claims.filter((c) => {
      const subject = c.subject.toLowerCase();
      const statement = (c.metadata?.statement as string || '').toLowerCase();
      const file = c.source.file.toLowerCase();

      return (
        (targetQuery && (subject.includes(targetQuery) || file.includes(targetQuery))) ||
        keywords.some((kw) => subject.includes(kw) || statement.includes(kw) || file.includes(kw))
      );
    });

    // 2. Identify relevant Behavioral Contracts
    const relevantContracts = this.snapshot.contracts.filter((c) => {
      const subject = c.subject.toLowerCase();
      const stmt = c.statement.toLowerCase();

      return (
        (targetQuery && subject.includes(targetQuery)) ||
        keywords.some((kw) => subject.includes(kw) || stmt.includes(kw))
      );
    });

    // 3. Map Symbols and Source Files to Evidence Candidates
    const candidateMap = new Map<string, EvidenceCandidate>();

    // Helper to read and slice source lines safely
    const getSourceSlice = async (
      filePath: string,
      targetLine: number,
      spanWindow: number = 25
    ): Promise<{ startLine: number; endLine: number; content: string } | null> => {
      try {
        const full = path.isAbsolute(filePath)
          ? filePath
          : path.resolve(this.snapshot.root, filePath);
        const raw = await fs.readFile(full, 'utf-8');
        const lines = raw.split('\n');

        const startLine = Math.max(1, targetLine - 2);
        const endLine = Math.min(lines.length, targetLine + spanWindow);
        const sliceContent = lines.slice(startLine - 1, endLine).join('\n');

        return { startLine, endLine, content: sliceContent };
      } catch {
        return null;
      }
    };

    // A. Add Primary Target Candidates
    for (const [symName, sym] of this.snapshot.symbols.entries()) {
      const matchesTarget =
        (targetQuery && (symName.toLowerCase().includes(targetQuery) || sym.file.toLowerCase().includes(targetQuery))) ||
        keywords.some((kw) => symName.toLowerCase().includes(kw) || sym.file.toLowerCase().includes(kw));

      if (matchesTarget) {
        const slice = await getSourceSlice(sym.file, sym.line, 30);
        if (slice) {
          const candidateId = `${sym.file}:${slice.startLine}-${slice.endLine}`;
          const tokenCost = Math.ceil(slice.content.length / 4);

          candidateMap.set(candidateId, {
            id: candidateId,
            file: sym.file,
            startLine: slice.startLine,
            endLine: slice.endLine,
            content: slice.content,
            proves: [],
            confidence: 0.98,
            criticality: 1,
            specificity: 1.0,
            tokenCost,
            role: 'target',
          });
        }
      }
    }

    // A2. Add Matching Graph Modules and Primary Impact Targets
    for (const [modPath, node] of Object.entries(this.snapshot.graph.nodes)) {
      const matchesMod =
        (targetQuery && (modPath.toLowerCase().includes(targetQuery) || node.exports.some((e) => e.toLowerCase().includes(targetQuery)))) ||
        keywords.some((kw) => modPath.toLowerCase().includes(kw) || node.exports.some((e) => e.toLowerCase().includes(kw)));

      if (matchesMod) {
        const slice = await getSourceSlice(modPath, 1, 50);
        if (slice) {
          const candidateId = `${modPath}:${slice.startLine}-${slice.endLine}`;
          if (!candidateMap.has(candidateId)) {
            const tokenCost = Math.ceil(slice.content.length / 4);
            candidateMap.set(candidateId, {
              id: candidateId,
              file: modPath,
              startLine: slice.startLine,
              endLine: slice.endLine,
              content: slice.content,
              proves: [],
              confidence: 0.95,
              criticality: 1,
              specificity: 0.95,
              tokenCost,
              role: 'target',
            });

            // Also materialize direct dependency imports of the target module
            for (const imp of node.imports) {
              const depFile = imp.toFile;
              if (depFile && this.snapshot.graph.nodes[depFile]) {
                const impSlice = await getSourceSlice(depFile, 1, 50);
                if (impSlice) {
                  const impId = `${depFile}:${impSlice.startLine}-${impSlice.endLine}`;
                  if (!candidateMap.has(impId)) {
                    candidateMap.set(impId, {
                      id: impId,
                      file: depFile,
                      startLine: impSlice.startLine,
                      endLine: impSlice.endLine,
                      content: impSlice.content,
                      proves: [],
                      confidence: 0.9,
                      criticality: 2,
                      specificity: 0.9,
                      tokenCost: Math.ceil(impSlice.content.length / 4),
                      role: 'infrastructure',
                    });
                  }
                }
              }
            }
          }
        }
      }
    }

    // B. Link Claims to Candidates (both Documentation source and TypeScript AST evidence)
    for (const claim of relevantClaims) {
      if (claim.source && claim.source.file) {
        const slice = await getSourceSlice(claim.source.file, claim.source.line, 20);
        if (slice) {
          const candidateId = `${claim.source.file}:${slice.startLine}-${slice.endLine}`;
          let candidate = candidateMap.get(candidateId);
          if (!candidate) {
            const tokenCost = Math.ceil(slice.content.length / 4);
            candidate = {
              id: candidateId,
              file: claim.source.file,
              startLine: slice.startLine,
              endLine: slice.endLine,
              content: slice.content,
              proves: [],
              confidence: 0.95,
              criticality: 2,
              specificity: 0.9,
              tokenCost,
              role: 'dependent',
            };
            candidateMap.set(candidateId, candidate);
          }
          if (!candidate.proves.includes(claim.id)) {
            candidate.proves.push(claim.id);
          }
        }
      }

      // Link AST Evidence from verified claims to source candidates
      for (const ev of claim.evidence || []) {
        if (ev.file) {
          const slice = await getSourceSlice(ev.file, ev.line || 1, 25);
          if (slice) {
            const candidateId = `${ev.file}:${slice.startLine}-${slice.endLine}`;
            let candidate = candidateMap.get(candidateId);
            if (!candidate) {
              const tokenCost = Math.ceil(slice.content.length / 4);
              const isSourceFile = ev.file.startsWith('src/') || ev.source === 'typescript-ast';
              candidate = {
                id: candidateId,
                file: ev.file,
                startLine: slice.startLine,
                endLine: slice.endLine,
                content: slice.content,
                proves: [],
                confidence: ev.confidence || 0.98,
                criticality: isSourceFile ? 1 : 2,
                specificity: 0.95,
                tokenCost,
                role: isSourceFile ? 'target' : 'dependent',
              };
              candidateMap.set(candidateId, candidate);
            }
            if (!candidate.proves.includes(claim.id)) {
              candidate.proves.push(claim.id);
            }
          }
        }
      }
    }

    // C. Link Contracts to Candidates
    for (const contract of relevantContracts) {
      for (const ev of contract.evidence) {
        if (ev.file) {
          const slice = await getSourceSlice(ev.file, ev.line || 1, 20);
          if (slice) {
            const candidateId = `${ev.file}:${slice.startLine}-${slice.endLine}`;
            let candidate = candidateMap.get(candidateId);
            if (!candidate) {
              const tokenCost = Math.ceil(slice.content.length / 4);
              candidate = {
                id: candidateId,
                file: ev.file,
                startLine: slice.startLine,
                endLine: slice.endLine,
                content: slice.content,
                proves: [],
                confidence: ev.confidence || 0.95,
                criticality: contract.type === 'invariant' || contract.type === 'authorization' ? 1 : 2,
                specificity: 0.95,
                tokenCost,
                role: 'infrastructure',
              };
              candidateMap.set(candidateId, candidate);
            }
            if (!candidate.proves.includes(contract.id)) {
              candidate.proves.push(contract.id);
            }
          }
        }
      }
    }

    // D. Link Tests to Candidates
    for (const testFile of this.snapshot.tests.testFiles) {
      const isRelevantTest =
        (targetQuery && testFile.toLowerCase().includes(targetQuery)) ||
        keywords.some((kw) => testFile.toLowerCase().includes(kw));

      if (isRelevantTest) {
        const slice = await getSourceSlice(testFile, 1, 40);
        if (slice) {
          const candidateId = `${testFile}:${slice.startLine}-${slice.endLine}`;
          if (!candidateMap.has(candidateId)) {
            const tokenCost = Math.ceil(slice.content.length / 4);
            candidateMap.set(candidateId, {
              id: candidateId,
              file: testFile,
              startLine: slice.startLine,
              endLine: slice.endLine,
              content: slice.content,
              proves: [],
              confidence: 0.90,
              criticality: 3,
              specificity: 0.8,
              tokenCost,
              role: 'test',
            });
          }
        }
      }
    }

    // Convert map to deterministic sorted array
    const candidates = Array.from(candidateMap.values()).sort((a, b) =>
      a.id.localeCompare(b.id)
    );

    return {
      candidates,
      relevantClaims,
      relevantContracts,
    };
  }
}
