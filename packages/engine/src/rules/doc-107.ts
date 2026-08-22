import type { Rule } from './types';
import type { CompilerDiagnostic } from '../compiler-types';
import type { Claim, Evidence, RepositorySnapshot } from '../claim/types';

/**
 * DOC-107: TYPE_MISMATCH (Severity: error)
 * Trigger: Documented return type does not match actual return type in AST.
 */
export const doc107Rule: Rule = {
  id: 'DOC-107',
  name: 'TYPE_MISMATCH',
  severity: 'error',
  evaluate(claim: Claim, evidence: Evidence[], snapshot: RepositorySnapshot): CompilerDiagnostic | null {
    if (claim.type !== 'return') return null;

    const sym = snapshot.symbols.get(claim.subject);
    if (!sym || sym.kind !== 'function') return null;

    const claimedReturn = (claim.metadata?.claimedReturnType as string) || '';
    const actualReturn = sym.returnType || 'void';

    if (!claimedReturn) return null;

    const normalizedClaimed = normalizeType(claimedReturn);
    const normalizedActual = normalizeType(actualReturn);

    // If normalized forms differ
    if (normalizedClaimed !== normalizedActual && !typesAreCompatible(normalizedClaimed, normalizedActual)) {
      return {
        code: 'DOC-107',
        severity: 'error',
        message: `Type mismatch in \`${claim.subject}\`: documentation states return type \`${claimedReturn}\`, but codebase returns \`${actualReturn}\``,
        file: claim.source.file,
        line: claim.source.line,
        claim: claim.source.text,
        evidence: [`${sym.file}:${sym.line} returns ${actualReturn}`],
        suggestedAction: `Update documented return type to \`${actualReturn}\`.`,
      };
    }

    return null;
  },
};

function normalizeType(typeStr: string): string {
  return typeStr
    .replace(/\s+/g, '')
    .replace(/;$/, '')
    .replace(/^Promise<void>$/, 'Promise<void>')
    .toLowerCase();
}

function typesAreCompatible(claimed: string, actual: string): boolean {
  if (claimed === actual) return true;
  if (actual === 'any' || actual === 'unknown') return true;
  // Handle Promise<T> vs Promise<any>
  if (claimed.startsWith('promise<') && actual.startsWith('promise<')) {
    const innerActual = actual.slice(8, -1);
    if (innerActual === 'any' || innerActual === 'unknown') return true;
  }
  return false;
}
