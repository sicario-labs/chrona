import { describe, it, expect } from 'vitest';
import { DocumentationVerifier } from '../../src/verifier';
import type { RepositorySnapshot } from '../../src/claim/types';
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

describe('Property-Based: Zero False-Positive & Soundness Invariants', () => {
  const verifier = new DocumentationVerifier();

  it('guarantees 0 error diagnostics when documentation perfectly reflects AST', () => {
    const symbols = [
      { name: 'createRouter', signature: '(): RouterContext' },
      { name: 'addRoute', signature: '(ctx: RouterContext, path: string, data: any): void' },
      { name: 'findRoute', signature: '(ctx: RouterContext, path: string): MatchedRoute' },
    ];

    const snapshot: RepositorySnapshot = {
      files: new Map(),
      symbols: new Map(
        symbols.map((s) => [
          s.name,
          mockSymbol({
            name: s.name,
            kind: 'function',
            file: 'src/index.ts',
            line: 1,
            signature: s.signature,
          }),
        ])
      ),
    };

    for (const sym of symbols) {
      const validDoc = [
        `# ${sym.name} Documentation`,
        '',
        '```ts',
        `import { ${sym.name} } from 'radix3';`,
        '```',
        '',
        `\`${sym.name}\``,
      ].join('\n');

      const res = verifier.verifyFile(`${sym.name}.mdx`, validDoc, snapshot);
      const errors = res.diagnostics.filter((d) => d.severity === 'error');
      expect(errors).toHaveLength(0);
    }
  });

  it('guarantees suppression directives eliminate targeted error diagnostics', () => {
    const snapshot: RepositorySnapshot = {
      files: new Map(),
      symbols: new Map([
        [
          'existingExport',
          mockSymbol({
            name: 'existingExport',
            kind: 'function',
            file: 'src/index.ts',
            line: 1,
            signature: '(): void',
          }),
        ],
      ]),
    };

    const suppressedDoc = [
      '# Suppressed Section',
      '',
      '<!-- chrona-ignore DOC-101 -->',
      'import { dynamicGeneratedSymbol } from "pkg";',
    ].join('\n');

    const res = verifier.verifyFile('suppressed.mdx', suppressedDoc, snapshot);
    const errors = res.diagnostics.filter((d) => d.code === 'DOC-101');
    expect(errors).toHaveLength(0);

    // Ensure metric summary tracked the suppression
    const summary = verifier.getTracker().getSummary();
    expect(summary.totalSuppressed).toBeGreaterThanOrEqual(1);
    expect(summary.suppressionsByRule['DOC-101']).toBeGreaterThanOrEqual(1);
  });
});
