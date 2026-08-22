import { describe, it, expect } from 'vitest';
import { doc102Rule } from '../../src/rules/doc-102';
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

describe('Rule DOC-102: SIGNATURE_MISMATCH', () => {
  const snapshot: RepositorySnapshot = {
    files: new Map(),
    symbols: new Map([
      [
        'parseRoute',
        mockSymbol({
          name: 'parseRoute',
          kind: 'function',
          file: 'src/parser.ts',
          line: 12,
          signature: '(path: string, options?: ParseOptions): ParsedRoute',
          parameters: [
            { name: 'path', type: 'string', isOptional: false },
            { name: 'options', type: 'ParseOptions', isOptional: true },
          ],
        }),
      ],
    ]),
  };

  it('passes when documented signature matches AST', () => {
    const claim: Claim = {
      id: 'doc#L10',
      type: 'signature',
      subject: 'parseRoute',
      source: { file: 'docs/test.mdx', line: 10, text: 'parseRoute(path: string, options?: ParseOptions): ParsedRoute' },
      evidence: [],
      status: 'unverified',
      metadata: {
        parameters: [
          { name: 'path', isOptional: false },
          { name: 'options', isOptional: true },
        ],
      },
    };

    const evidence: Evidence[] = [
      {
        source: 'typescript-ast',
        file: 'src/parser.ts',
        line: 12,
        confidence: 1.0,
        data: {
          exists: true,
          signature: '(path: string, options?: ParseOptions): ParsedRoute',
        },
      },
    ];

    const diag = doc102Rule.evaluate(claim, evidence, snapshot);
    expect(diag).toBeNull();
  });

  it('emits error diagnostic when signature has drifted from AST', () => {
    const claim: Claim = {
      id: 'doc#L15',
      type: 'signature',
      subject: 'parseRoute',
      source: { file: 'docs/test.mdx', line: 15, text: 'parseRoute(flags: number): void' },
      evidence: [],
      status: 'unverified',
      metadata: {
        parameters: [{ name: 'flags', isOptional: false }],
      },
    };

    const evidence: Evidence[] = [
      {
        source: 'typescript-ast',
        file: 'src/parser.ts',
        line: 12,
        confidence: 1.0,
        data: {
          exists: true,
          signature: '(path: string, options?: ParseOptions): ParsedRoute',
        },
      },
    ];

    const diag = doc102Rule.evaluate(claim, evidence, snapshot);
    expect(diag).toBeDefined();
    expect(diag?.code).toBe('DOC-102');
    expect(diag?.severity).toBe('error');
  });
});
