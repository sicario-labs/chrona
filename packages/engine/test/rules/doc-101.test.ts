import { describe, it, expect } from 'vitest';
import { doc101Rule } from '../../src/rules/doc-101';
import type { Claim, RepositorySnapshot } from '../../src/claim/types';
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

describe('Rule DOC-101: MISSING_SYMBOL', () => {
  const snapshot: RepositorySnapshot = {
    files: new Map(),
    symbols: new Map([
      [
        'createRouter',
        mockSymbol({
          name: 'createRouter',
          kind: 'function',
          file: 'src/index.ts',
          line: 10,
          signature: '(): Router',
        }),
      ],
    ]),
  };

  it('passes when symbol exists in snapshot', () => {
    const claim: Claim = {
      id: 'doc#L1',
      type: 'symbol',
      subject: 'createRouter',
      source: { file: 'docs/test.mdx', line: 1, text: 'import { createRouter } from "radix3"' },
      evidence: [],
      status: 'unverified',
      metadata: { origin: 'import-statement' },
    };

    const diag = doc101Rule.evaluate(claim, [], snapshot);
    expect(diag).toBeNull();
  });

  it('emits error diagnostic when symbol is missing from exports', () => {
    const claim: Claim = {
      id: 'doc#L2',
      type: 'symbol',
      subject: 'nonExistentHelper',
      source: { file: 'docs/test.mdx', line: 2, text: 'import { nonExistentHelper } from "radix3"' },
      evidence: [],
      status: 'unverified',
      metadata: { origin: 'import-statement' },
    };

    const diag = doc101Rule.evaluate(claim, [], snapshot);
    expect(diag).toBeDefined();
    expect(diag?.code).toBe('DOC-101');
    expect(diag?.severity).toBe('error');
    expect(diag?.message).toContain('nonExistentHelper');
  });

  it('skips non-authoritative mentions', () => {
    const claim: Claim = {
      id: 'doc#L3',
      type: 'symbol',
      subject: 'randomWord',
      source: { file: 'docs/test.mdx', line: 3, text: 'This is a random word in prose' },
      evidence: [],
      status: 'unverified',
      metadata: { origin: 'prose-mention' },
    };

    const diag = doc101Rule.evaluate(claim, [], snapshot);
    expect(diag).toBeNull();
  });
});
