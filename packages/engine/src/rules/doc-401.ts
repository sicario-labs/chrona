import type { Rule } from './types';
import type { CompilerDiagnostic } from '../compiler-types';
import type { Claim, Evidence, RepositorySnapshot } from '../claim/types';

/**
 * DOC-401: DEPRECATED_WITHOUT_NOTICE (Severity: warning)
 * Trigger: Deprecated symbol is documented or referenced without an accompanying deprecation warning/callout.
 */
export const doc401Rule: Rule = {
  id: 'DOC-401',
  name: 'DEPRECATED_WITHOUT_NOTICE',
  severity: 'warning',
  evaluate(claim: Claim, evidence: Evidence[], snapshot: RepositorySnapshot): CompilerDiagnostic | null {
    if (claim.type !== 'symbol' && claim.type !== 'signature') return null;

    const sym = snapshot.symbols.get(claim.subject);
    if (!sym || !sym.isDeprecated) return null;

    const fullSnippet = (claim.metadata?.rawSnippet as string) || claim.source.text || '';
    const hasNotice = /deprecated/i.test(fullSnippet) || /callout.*warning/i.test(fullSnippet);

    if (!hasNotice) {
      return {
        code: 'DOC-401',
        severity: 'warning',
        message: `\`${claim.subject}\` is deprecated in source; missing deprecation warning notice in documentation`,
        file: claim.source.file,
        line: claim.source.line,
        claim: claim.source.text,
        evidence: [`${sym.file}:${sym.line} ${sym.deprecationNotice || '@deprecated'}`],
        suggestedAction: `Add a <Callout type="warning"> mentioning that ${claim.subject} is deprecated.`,
      };
    }

    return null;
  },
};
