import { describe, it, expect } from 'vitest';
import { doc401Rule } from '../../src/rules/doc-401';
import type { Claim, Evidence, RepositorySnapshot } from '../../src/claim/types';
import type { ExtractedSymbol } from '../../src/referee/oxc-extractor';

function mockSymbol(partial: Partial<ExtractedSymbol> & { name: string }): ExtractedSymbol {
  return {
    kind: 'function',
    file: 'src/index.ts',
    line: 1,
    signature: '(): void',
    span: [0, 0],
    isDeprecated: false,
    parameters: [],
    properties: [],
    ...partial,
  };
}

describe('Rule DOC-401: DEPRECATED_WITHOUT_NOTICE', () => {
  const snapshot: RepositorySnapshot = {
    files: new Map(),
    symbols: new Map([
      [
        'legacyMatch',
        mockSymbol({
          name: 'legacyMatch',
          kind: 'function',
          file: 'src/legacy.ts',
          line: 20,
          signature: '(path: string): boolean',
          isDeprecated: true,
          deprecationNotice: 'Use findRoute() instead.',
        }),
      ],
    ]),
  };

  it('passes when deprecation notice is present in doc snippet', () => {
    const claim: Claim = {
      id: 'doc#L50',
      type: 'symbol',
      subject: 'legacyMatch',
      source: { file: 'docs/test.mdx', line: 50, text: 'legacyMatch is deprecated. Use findRoute instead.' },
      evidence: [],
      status: 'unverified',
    };

    const evidence: Evidence[] = [];
    const diag = doc401Rule.evaluate(claim, evidence, snapshot);
    expect(diag).toBeNull();
  });

  it('emits warning diagnostic when deprecated symbol is documented without notice', () => {
    const claim: Claim = {
      id: 'doc#L55',
      type: 'symbol',
      subject: 'legacyMatch',
      source: { file: 'docs/test.mdx', line: 55, text: 'Use `legacyMatch` for routing operations.' },
      evidence: [],
      status: 'unverified',
    };

    const evidence: Evidence[] = [];
    const diag = doc401Rule.evaluate(claim, evidence, snapshot);
    expect(diag).toBeDefined();
    expect(diag?.code).toBe('DOC-401');
    expect(diag?.severity).toBe('warning');
    expect(diag?.message).toContain('deprecated');
  });
});
