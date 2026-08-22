import type { Claim } from '../claim/types';
import type { BehavioralContract } from '../contracts/types';
import type { EvidenceCandidate, ClaimCoverage } from './evidence-graph';

export interface OptimizationResult {
  selectedCandidates: EvidenceCandidate[];
  claimCoverage: ClaimCoverage[];
  omittedEvidence: Array<{ item: string; reason: string }>;
  tokenCount: number;
  coverageScore: number;
  evidenceSufficiency: number;
  minimumSufficientBudget: number;
  recommendedTokenBudget: number;
  missingCriticalEvidence: Array<{ item: string; tokensNeeded: number }>;
  quality: 'VALID' | 'DEGRADED' | 'INVALID';
}

export class EvidenceOptimizer {
  /**
   * Selects the optimal set of evidence candidates subject to tokenBudget constraint,
   * maximizing marginal evidence value.
   */
  public optimize(
    candidates: EvidenceCandidate[],
    relevantClaims: Claim[],
    relevantContracts: BehavioralContract[],
    tokenBudget: number = 8000
  ): OptimizationResult {
    // 1. Build map of claim -> all candidates that prove it
    const claimToCandidatesMap = new Map<string, string[]>();

    for (const c of relevantClaims) {
      claimToCandidatesMap.set(c.id, []);
    }
    for (const contract of relevantContracts) {
      claimToCandidatesMap.set(contract.id, []);
    }

    for (const candidate of candidates) {
      for (const claimId of candidate.proves) {
        const list = claimToCandidatesMap.get(claimId);
        if (list) {
          list.push(candidate.id);
        }
      }
    }

    // 2. Critical Evidence Constraint Pass: Mandatory allocation of target & invariant evidence
    const selectedMap = new Map<string, EvidenceCandidate>();
    const coveredClaims = new Set<string>();
    let usedTokens = 0;
    const remainingCandidates: EvidenceCandidate[] = [];

    const criticalCandidates: EvidenceCandidate[] = [];
    const electiveCandidates: EvidenceCandidate[] = [];

    for (const cand of candidates) {
      if (cand.role === 'target' || cand.criticality === 1) {
        criticalCandidates.push(cand);
      } else {
        electiveCandidates.push(cand);
      }
    }

    // Prioritize target implementation first, then level-1 invariants
    criticalCandidates.sort((a, b) => {
      if (a.role === 'target' && b.role !== 'target') return -1;
      if (b.role === 'target' && a.role !== 'target') return 1;
      if (a.criticality !== b.criticality) return a.criticality - b.criticality;
      return a.tokenCost - b.tokenCost;
    });

    for (const crit of criticalCandidates) {
      if (usedTokens + crit.tokenCost <= tokenBudget || selectedMap.size === 0) {
        selectedMap.set(crit.id, crit);
        usedTokens += crit.tokenCost;
        for (const claimId of crit.proves) {
          coveredClaims.add(claimId);
        }
      } else {
        remainingCandidates.push(crit);
      }
    }

    remainingCandidates.push(...electiveCandidates);

    // 3. Greedy Marginal Value Selection Loop for Elective Evidence
    while (remainingCandidates.length > 0) {
      let bestIndex = -1;
      let bestValuePerToken = -Infinity;

      for (let i = 0; i < remainingCandidates.length; i++) {
        const cand = remainingCandidates[i];
        if (usedTokens + cand.tokenCost > tokenBudget) {
          continue; // Does not fit in budget
        }

        // Compute marginal value
        const newClaims = cand.proves.filter((id) => !coveredClaims.has(id));
        const roleMultiplier =
          cand.role === 'target'
            ? 3.0
            : cand.role === 'infrastructure'
            ? 2.0
            : cand.role === 'dependent'
            ? 1.5
            : 1.0;

        const criticalityBonus = cand.criticality === 1 ? 15 : cand.criticality === 2 ? 8 : 2;
        const confidenceBonus = cand.confidence * 10;
        const redundancyPenalty = cand.proves.length > 0 && newClaims.length === 0 ? 5 : 0;

        const totalValue =
          newClaims.length * 20 * roleMultiplier +
          criticalityBonus +
          confidenceBonus -
          redundancyPenalty;

        const valuePerToken = totalValue / Math.max(1, cand.tokenCost);

        if (valuePerToken > bestValuePerToken) {
          bestValuePerToken = valuePerToken;
          bestIndex = i;
        } else if (Math.abs(valuePerToken - bestValuePerToken) < 1e-6 && bestIndex !== -1) {
          // Deterministic tie-breaker by ID
          if (cand.id.localeCompare(remainingCandidates[bestIndex].id) < 0) {
            bestIndex = i;
          }
        }
      }

      // If no candidate fits or adds value, terminate
      if (bestIndex === -1 || bestValuePerToken <= 0) {
        break;
      }

      const chosen = remainingCandidates.splice(bestIndex, 1)[0];
      selectedMap.set(chosen.id, chosen);
      usedTokens += chosen.tokenCost;
      for (const claimId of chosen.proves) {
        coveredClaims.add(claimId);
      }
    }

    const rawSelected = Array.from(selectedMap.values());
    const selectedCandidates = this.mergeAdjacentCandidates(rawSelected);

    // 3. Compute Claim Coverage States
    const claimCoverage: ClaimCoverage[] = [];
    const omittedEvidence: Array<{ item: string; reason: string }> = [];

    // Evaluate standard claims
    for (const claim of relevantClaims) {
      const allCandidateIds = claimToCandidatesMap.get(claim.id) || [];
      const statement = (claim.metadata?.statement as string) || `${claim.type}: ${claim.subject}`;

      if (allCandidateIds.length === 0) {
        claimCoverage.push({
          status: 'UNPROVEN',
          claimId: claim.id,
          statement,
          reason: 'No AST source range mapped in live repository',
        });
      } else {
        const includedEvidence = allCandidateIds.filter((id) => selectedMap.has(id));
        const missingEvidence = allCandidateIds.filter((id) => !selectedMap.has(id));

        if (missingEvidence.length === 0) {
          claimCoverage.push({
            status: 'PROVEN',
            claimId: claim.id,
            statement,
            evidenceIds: includedEvidence,
          });
        } else if (includedEvidence.length > 0) {
          claimCoverage.push({
            status: 'PARTIAL',
            claimId: claim.id,
            statement,
            evidenceIds: includedEvidence,
            missingEvidenceIds: missingEvidence,
          });
        } else {
          claimCoverage.push({
            status: 'UNPROVEN',
            claimId: claim.id,
            statement,
            reason: `Evidence omitted due to token budget constraint (${tokenBudget} tokens)`,
          });
        }
      }
    }

    // Evaluate behavioral contracts
    for (const contract of relevantContracts) {
      const allCandidateIds = claimToCandidatesMap.get(contract.id) || [];
      const statement = `[${contract.type}] ${contract.statement}`;

      if (allCandidateIds.length === 0) {
        claimCoverage.push({
          status: 'UNPROVEN',
          claimId: contract.id,
          statement,
          reason: 'No code assertion or test assertion found for contract',
        });
      } else {
        const includedEvidence = allCandidateIds.filter((id) => selectedMap.has(id));
        const missingEvidence = allCandidateIds.filter((id) => !selectedMap.has(id));

        if (missingEvidence.length === 0) {
          claimCoverage.push({
            status: 'PROVEN',
            claimId: contract.id,
            statement,
            evidenceIds: includedEvidence,
          });
        } else if (includedEvidence.length > 0) {
          claimCoverage.push({
            status: 'PARTIAL',
            claimId: contract.id,
            statement,
            evidenceIds: includedEvidence,
            missingEvidenceIds: missingEvidence,
          });
        } else {
          claimCoverage.push({
            status: 'UNPROVEN',
            claimId: contract.id,
            statement,
            reason: `Evidence omitted due to token budget constraint (${tokenBudget} tokens)`,
          });
        }
      }
    }

    // Populate omitted evidence list
    for (const cand of remainingCandidates) {
      if (!selectedMap.has(cand.id)) {
        omittedEvidence.push({
          item: `${cand.file}:${cand.startLine}-${cand.endLine} (${cand.role})`,
          reason: `Exceeded token budget limit (${usedTokens}/${tokenBudget} tokens consumed)`,
        });
      }
    }

    const totalClaimsCount = relevantClaims.length + relevantContracts.length;
    const provenClaimsCount = claimCoverage.filter((c) => c.status === 'PROVEN').length;
    const partialClaimsCount = claimCoverage.filter((c) => c.status === 'PARTIAL').length;

    const coverageScore =
      totalClaimsCount > 0
        ? Number(((provenClaimsCount + partialClaimsCount * 0.5) / totalClaimsCount).toFixed(3))
        : 1.0;

    // Check critical evidence satisfaction and compute adaptive budgets
    const criticalCount = criticalCandidates.length;
    const selectedCriticalCount = criticalCandidates.filter((c) => selectedMap.has(c.id)).length;
    const criticalSatisfied = criticalCount === 0 || selectedCriticalCount === criticalCount;

    const minimumSufficientBudget = criticalCandidates.reduce((sum, c) => sum + c.tokenCost, 0);
    const totalEvidenceBudget = candidates.filter((c) => c.proves.length > 0 || c.criticality === 1).reduce((sum, c) => sum + c.tokenCost, 0);
    const recommendedTokenBudget = Math.max(minimumSufficientBudget, totalEvidenceBudget);

    const missingCriticalEvidence = criticalCandidates
      .filter((c) => !selectedMap.has(c.id))
      .map((c) => ({
        item: `${c.file}:${c.startLine}-${c.endLine} (${c.role})`,
        tokensNeeded: c.tokenCost,
      }));

    const evidenceSufficiency =
      criticalCount + totalClaimsCount > 0
        ? Number(
            (
              (selectedCriticalCount * 2 + provenClaimsCount + partialClaimsCount * 0.5) /
              (criticalCount * 2 + totalClaimsCount)
            ).toFixed(3)
          )
        : 1.0;

    const quality: 'VALID' | 'DEGRADED' | 'INVALID' = !criticalSatisfied
      ? 'INVALID'
      : coverageScore >= 0.7
      ? 'VALID'
      : 'DEGRADED';

    return {
      selectedCandidates,
      claimCoverage,
      omittedEvidence,
      tokenCount: usedTokens,
      coverageScore,
      evidenceSufficiency,
      minimumSufficientBudget,
      recommendedTokenBudget,
      missingCriticalEvidence,
      quality,
    };
  }

  /**
   * Merges overlapping or closely adjacent candidate slices from the same file
   * to ensure coherent, contiguous code context for agents and reduce fragmentation.
   */
  public mergeAdjacentCandidates(candidates: EvidenceCandidate[]): EvidenceCandidate[] {
    if (candidates.length <= 1) return candidates;

    const fileGroups = new Map<string, EvidenceCandidate[]>();
    for (const c of candidates) {
      const list = fileGroups.get(c.file) || [];
      list.push(c);
      fileGroups.set(c.file, list);
    }

    const merged: EvidenceCandidate[] = [];

    for (const [file, list] of fileGroups.entries()) {
      // Sort ranges by startLine ascending
      list.sort((a, b) => a.startLine - b.startLine);

      let current = { ...list[0] };

      for (let i = 1; i < list.length; i++) {
        const next = list[i];
        // If overlapping or adjacent within 8 lines
        if (next.startLine <= current.endLine + 8) {
          const newStart = Math.min(current.startLine, next.startLine);
          const newEnd = Math.max(current.endLine, next.endLine);
          const combinedProves = Array.from(new Set([...current.proves, ...next.proves]));
          const rolePriority: Record<string, number> = {
            target: 1,
            infrastructure: 2,
            dependent: 3,
            test: 4,
            config: 5,
          };
          const chosenRole =
            rolePriority[current.role] <= rolePriority[next.role]
              ? current.role
              : next.role;

          current = {
            id: `${file}:${newStart}-${newEnd}`,
            file,
            startLine: newStart,
            endLine: newEnd,
            content: `${current.content}\n${next.content}`,
            proves: combinedProves,
            confidence: Math.max(current.confidence, next.confidence),
            criticality: Math.min(current.criticality, next.criticality),
            specificity: (current.specificity + next.specificity) / 2,
            tokenCost: current.tokenCost + next.tokenCost,
            role: chosenRole,
          };
        } else {
          merged.push(current);
          current = { ...next };
        }
      }
      merged.push(current);
    }

    return merged.sort((a, b) => a.id.localeCompare(b.id));
  }
}
