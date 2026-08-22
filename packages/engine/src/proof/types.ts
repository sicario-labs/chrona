import type { Evidence } from '../claim/types';
import type { BehavioralContract } from '../contracts/types';

export type ProofVerdict = 'PROVEN' | 'DISPROVEN' | 'INSUFFICIENT_EVIDENCE' | 'CONTRADICTORY';

export interface ProofResult {
  claim: string;
  verdict: ProofVerdict;
  confidence: number;
  explanation: string;
  evidenceFor: Evidence[];
  evidenceAgainst: Evidence[];
  contracts: BehavioralContract[];
  dependencyChain: string[];
  suggestedAction?: string;
  provenAt: string;
  testedAgainstCommit: string;
}
