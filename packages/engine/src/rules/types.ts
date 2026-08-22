import type { CompilerDiagnostic, DiagnosticSeverity } from '../compiler-types';
import type { Claim, Evidence, RepositorySnapshot } from '../claim/types';

export interface Rule {
  id: string;
  name: string;
  severity: DiagnosticSeverity;
  evaluate(claim: Claim, evidence: Evidence[], snapshot: RepositorySnapshot): CompilerDiagnostic | null;
}
