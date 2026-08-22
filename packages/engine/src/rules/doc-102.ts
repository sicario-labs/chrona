import type { Rule } from './types';
import type { CompilerDiagnostic } from '../compiler-types';
import type { Claim, Evidence, RepositorySnapshot } from '../claim/types';
import type { ParsedParam } from '../claim/extractor';

/**
 * DOC-102: SIGNATURE_MISMATCH (Severity: error)
 * Trigger: Documented function signature does not match actual codebase parameters.
 */
export const doc102Rule: Rule = {
  id: 'DOC-102',
  name: 'SIGNATURE_MISMATCH',
  severity: 'error',
  evaluate(claim: Claim, evidence: Evidence[], snapshot: RepositorySnapshot): CompilerDiagnostic | null {
    if (claim.type !== 'signature') return null;

    let codeParams: any[];
    let signature: string;
    let file: string;

    const astEv = evidence.find((e) => e.source === 'typescript-ast' || e.source === 'dependency-types');
    if (astEv && (astEv.data as any).exists && (astEv.data as any).parameters) {
      codeParams = (astEv.data as any).parameters;
      signature = (astEv.data as any).signature;
      file = astEv.file;
    } else {
      const sym = snapshot.symbols.get(claim.subject);
      if (!sym || sym.kind !== 'function') return null;
      codeParams = sym.parameters;
      signature = sym.signature;
      file = `${sym.file}:${sym.line}`;
    }

    const docParams = (claim.metadata?.parameters as ParsedParam[]) || [];

    // Compare required parameter counts
    const codeRequired = codeParams.filter((p) => !p.isOptional);

    // If code has required parameters that docs omit completely
    if (codeRequired.length > docParams.length) {
      return {
        code: 'DOC-102',
        severity: 'error',
        message: `Signature mismatch in \`${claim.subject}\`: codebase requires ${codeRequired.length} parameter(s), but documentation lists ${docParams.length}`,
        file: claim.source.file,
        line: claim.source.line,
        claim: claim.source.text,
        evidence: [`${file} ${claim.subject}${signature}`],
        suggestedAction: `Update documented signature to match: \`${claim.subject}${signature}\``,
      };
    }

    // Check positional parameter names when both sides document positional names
    if (docParams.length > 0 && codeParams.length > 0) {
      const minLen = Math.min(docParams.length, codeParams.length);
      for (let i = 0; i < minLen; i++) {
        const dp = docParams[i].name.toLowerCase().replace(/[^a-z0-9]/g, '');
        const cp = codeParams[i].name.toLowerCase().replace(/[^a-z0-9]/g, '');

        // If one is an object destructured/options and other is a completely different positional name
        if (codeParams[i].name.startsWith('{') && !docParams[i].name.startsWith('{') && !docParams[i].name.includes('option') && !docParams[i].name.includes('config')) {
          return {
            code: 'DOC-102',
            severity: 'error',
            message: `Signature mismatch in \`${claim.subject}\`: parameter #${i + 1} is an options object in code, but documented as positional \`${docParams[i].name}\``,
            file: claim.source.file,
            line: claim.source.line,
            claim: claim.source.text,
              evidence: [`${file} ${claim.subject}${signature}`],
            suggestedAction: `Update documented parameter #${i + 1} to match the options pattern \`${codeParams[i].name}\``,
          };
        }

        // Positional name mismatch
        if (!codeParams[i].name.startsWith('{') && !docParams[i].name.startsWith('{')) {
          if (dp.length > 2 && cp.length > 2 && dp !== cp && !dp.includes(cp) && !cp.includes(dp)) {
            // Distinct parameter names
            return {
              code: 'DOC-102',
              severity: 'error',
              message: `Signature mismatch in \`${claim.subject}\`: parameter #${i + 1} is \`${codeParams[i].name}\` in code, but documented as \`${docParams[i].name}\``,
              file: claim.source.file,
              line: claim.source.line,
              claim: claim.source.text,
              evidence: [`${file} ${claim.subject}${signature}`],
              suggestedAction: `Update parameter name to \`${codeParams[i].name}\` or verify signature.`,
            };
          }
        }
      }
    }

    return null;
  },
};
