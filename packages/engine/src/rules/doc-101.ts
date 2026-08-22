import type { Rule } from './types';
import type { CompilerDiagnostic } from '../compiler-types';
import type { Claim, Evidence, RepositorySnapshot } from '../claim/types';

/**
 * DOC-101: MISSING_SYMBOL (Severity: error)
 * Trigger: Documentation references an export or API symbol that does not exist in AST.
 */
export const doc101Rule: Rule = {
  id: 'DOC-101',
  name: 'MISSING_SYMBOL',
  severity: 'error',
  evaluate(claim: Claim, evidence: Evidence[], snapshot: RepositorySnapshot): CompilerDiagnostic | null {
    if (claim.type !== 'symbol') return null;

    const origin = claim.metadata?.origin as string | undefined;
    // We only check authoritative symbol claims or direct interactive verification claims
    if (origin && !['recipe-uses', 'import-statement', 'heading', 'interactive-claim', 'direct-symbol'].includes(origin)) {
      return null;
    }

    // Skip symbols when no exports are indexed or builtins
    if (snapshot.symbols.size === 0) return null;

    // Check if symbol exists in snapshot
    const sym = snapshot.symbols.get(claim.subject);
    if (sym) {
      return null; // Symbol exists in local workspace AST!
    }

    const platformOrDep = evidence.find(
      (e) => (e.source === 'platform-builtin' || e.source === 'dependency-export' || e.source === 'dependency-types') && (e.data as { exists?: boolean })?.exists
    );
    if (platformOrDep) {
      return null; // Symbol is provided by platform or declared dependency!
    }

    return {
      code: 'DOC-101',
      severity: 'error',
      message: `Docs mention symbol \`${claim.subject}\` which does not exist in codebase exports`,
      file: claim.source.file,
      line: claim.source.line,
      claim: claim.source.text,
      evidence: [`Symbol \`${claim.subject}\` not found among ${snapshot.symbols.size} exported codebase symbols`],
      suggestedAction: `Verify spelling or export \`${claim.subject}\` from the package entry point.`,
    };
  },
};
