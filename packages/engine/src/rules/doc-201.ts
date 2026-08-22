import type { Rule } from './types';
import type { CompilerDiagnostic } from '../compiler-types';
import type { Claim, Evidence, RepositorySnapshot } from '../claim/types';

/**
 * DOC-201: BROKEN_EXAMPLE (Severity: error)
 * Trigger: Fenced code block example fails syntax parsing or compilation.
 */
export const doc201Rule: Rule = {
  id: 'DOC-201',
  name: 'BROKEN_EXAMPLE',
  severity: 'error',
  evaluate(claim: Claim, evidence: Evidence[], _snapshot: RepositorySnapshot): CompilerDiagnostic | null {
    if (claim.type !== 'example') return null;

    const exampleEvidence = evidence.find((e) => e.source === 'compiled-example');
    if (!exampleEvidence) return null;

    const data = exampleEvidence.data as { compiles?: boolean; errors?: string[] } | undefined;
    if (data && data.compiles === false) {
      const errors = data.errors || ['Compilation failed'];
      return {
        code: 'DOC-201',
        severity: 'error',
        message: `Code example fails to compile: ${errors[0]}`,
        file: claim.source.file,
        line: claim.source.line,
        claim: claim.source.text,
        evidence: errors,
        suggestedAction: `Fix syntax errors in example code block so it is valid and copy-pasteable.`,
      };
    }

    return null;
  },
};
