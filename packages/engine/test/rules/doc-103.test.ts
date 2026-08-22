import { describe, it, expect } from 'vitest';
import { doc103Rule } from '../../src/rules/doc-103';
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

describe('Rule DOC-103: PARAMETER_MISMATCH', () => {
  const snapshot: RepositorySnapshot = {
    files: new Map(),
    symbols: new Map([
      [
        'configureRouter',
        mockSymbol({
          name: 'configureRouter',
          kind: 'function',
          file: 'src/config.ts',
          line: 5,
          signature: '(ctx: Context, strict: boolean): void',
          parameters: [
            { name: 'ctx', type: 'Context', isOptional: false },
            { name: 'strict', type: 'boolean', isOptional: false },
          ],
        }),
      ],
    ]),
  };

  it('passes when documented parameters match actual parameters', () => {
    const claim: Claim = {
      id: 'doc#L20',
      type: 'parameter',
      subject: 'configureRouter',
      source: { file: 'docs/test.mdx', line: 20, text: 'configureRouter(ctx, strict)' },
      evidence: [],
      status: 'unverified',
      metadata: { origin: 'param-field', paramName: 'strict' },
    };

    const evidence: Evidence[] = [];
    const diag = doc103Rule.evaluate(claim, evidence, snapshot);
    expect(diag).toBeNull();
  });

  it('emits error diagnostic when phantom option or unknown parameter is documented', () => {
    const claim: Claim = {
      id: 'doc#L25',
      type: 'parameter',
      subject: 'configureRouter',
      source: { file: 'docs/test.mdx', line: 25, text: 'configureRouter({ unknownOption: true })' },
      evidence: [],
      status: 'unverified',
      metadata: { origin: 'param-field', paramName: 'unknownOption' },
    };

    const evidence: Evidence[] = [];
    const diag = doc103Rule.evaluate(claim, evidence, snapshot);
    expect(diag).toBeDefined();
    expect(diag?.code).toBe('DOC-103');
    expect(diag?.severity).toBe('error');
    expect(diag?.message).toContain('unknownOption');
  });
});
