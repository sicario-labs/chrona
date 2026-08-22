import { describe, it, expect } from 'vitest';
import { doc107Rule } from '../../src/rules/doc-107';
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

describe('Rule DOC-107: TYPE_MISMATCH', () => {
  const snapshot: RepositorySnapshot = {
    files: new Map(),
    symbols: new Map([
      [
        'matchRoute',
        mockSymbol({
          name: 'matchRoute',
          kind: 'function',
          file: 'src/matcher.ts',
          line: 30,
          signature: '(path: string): MatchedRoute | null',
          returnType: 'MatchedRoute | null',
        }),
      ],
    ]),
  };

  it('passes when documented return type matches AST return type', () => {
    const claim: Claim = {
      id: 'doc#L30',
      type: 'return',
      subject: 'matchRoute',
      source: { file: 'docs/test.mdx', line: 30, text: 'Returns `MatchedRoute | null`' },
      evidence: [],
      status: 'unverified',
      metadata: { claimedReturnType: 'MatchedRoute | null' },
    };

    const evidence: Evidence[] = [];
    const diag = doc107Rule.evaluate(claim, evidence, snapshot);
    expect(diag).toBeNull();
  });

  it('emits error diagnostic when return type drifts from AST', () => {
    const claim: Claim = {
      id: 'doc#L35',
      type: 'return',
      subject: 'matchRoute',
      source: { file: 'docs/test.mdx', line: 35, text: 'Returns `boolean`' },
      evidence: [],
      status: 'unverified',
      metadata: { claimedReturnType: 'boolean' },
    };

    const evidence: Evidence[] = [];
    const diag = doc107Rule.evaluate(claim, evidence, snapshot);
    expect(diag).toBeDefined();
    expect(diag?.code).toBe('DOC-107');
    expect(diag?.severity).toBe('error');
    expect(diag?.message).toContain('boolean');
  });
});
