import type { ClaimResult } from '../claim/types';
import type { CompilerDiagnostic } from '../compiler-types';

/**
 * DOC-301: CROSS_DOC_CONTRADICTION
 * Analyzes the global pool of claims to find contradictory statements about the same subject across different documentation files.
 */
export function runCrossDocContradictionRule(
  claimResults: ClaimResult[],
  diagnostics: CompilerDiagnostic[]
) {
  // Group claims by subject and type
  const grouped = new Map<string, ClaimResult[]>();

  for (const cr of claimResults) {
    if (cr.claim.type === 'signature' || cr.claim.type === 'parameter' || cr.claim.type === 'return') {
      const key = `${cr.claim.type}::${cr.claim.subject}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(cr);
    }
  }

  for (const [key, claims] of grouped.entries()) {
    if (claims.length <= 1) continue;

    // Fast check for contradictions in return types
    if (key.startsWith('return::')) {
      const types = new Set<string>();
      const locations = new Map<string, string>(); // type -> file

      for (const cr of claims) {
        const retType = cr.claim.metadata?.returnType as string | undefined;
        if (retType) {
          types.add(retType);
          locations.set(retType, cr.claim.source.file);
        }
      }

      if (types.size > 1) {
        const typeArray = Array.from(types);
        for (const cr of claims) {
          if (cr.diagnostic) continue; // Already has an error

          const retType = cr.claim.metadata?.returnType as string | undefined;
          if (retType) {
            const conflictingType = typeArray.find(t => t !== retType)!;
            const conflictingFile = locations.get(conflictingType)!;

            cr.status = 'contradicted';
            cr.claim.status = 'contradicted';
            
            const diag: CompilerDiagnostic = {
              code: 'DOC-301',
              severity: 'error',
              message: `Cross-document contradiction: ${cr.claim.subject} is documented to return '${retType}', but ${conflictingFile} claims it returns '${conflictingType}'.`,
              file: cr.claim.source.file,
              line: cr.claim.source.line,
              suggestedAction: 'Ensure consistent documentation across all files.',
            };
            cr.diagnostic = diag;
            diagnostics.push(diag);
          }
        }
      }
    }
  }
}
