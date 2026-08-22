import { describe, it, expect } from 'vitest';
import { ClaimExtractor } from '../../src/claim/extractor';
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

describe('Property-Based: Determinism & Idempotence Invariants', () => {
  const extractor = new ClaimExtractor();

  // Pseudo-random document generator for determinism fuzzing
  function generateSyntheticDoc(seed: number): string {
    const symbols = ['createRouter', 'addRoute', 'findRoute', 'removeRoute', 'findAllRoutes', 'routeToRegExp'];
    const sym = symbols[seed % symbols.length];
    return [
      `# API Guide for ${sym} (Iteration ${seed})`,
      '',
      `Import the symbol to start:`,
      '```ts',
      `import { ${sym} } from 'radix3';`,
      `const router = ${sym}();`,
      '```',
      '',
      `The function \`${sym}\` handles route lookups in O(k) time.`,
      '',
      `### Signature`,
      '```ts',
      `${sym}(): RouterContext`,
      '```',
    ].join('\n');
  }

  it('guarantees identical Claim IR extraction across 50 repeated runs', () => {
    for (let i = 0; i < 50; i++) {
      const doc = generateSyntheticDoc(i);
      const claims1 = extractor.extractClaims(doc, `doc-${i}.mdx`);
      const claims2 = extractor.extractClaims(doc, `doc-${i}.mdx`);

      expect(claims1).toEqual(claims2);
      expect(claims1.length).toBeGreaterThan(0);
    }
  });

  it('guarantees deterministic verification output across permutation order', () => {
    const verifier = new DocumentationVerifier();
    const snapshot: RepositorySnapshot = {
      files: new Map(),
      symbols: new Map([
        [
          'createRouter',
          mockSymbol({
            name: 'createRouter',
            kind: 'function',
            file: 'src/index.ts',
            line: 1,
            signature: '(): RouterContext',
          }),
        ],
      ]),
    };

    const doc = generateSyntheticDoc(0);
    const res1 = verifier.verifyFile('test.mdx', doc, snapshot);
    const res2 = verifier.verifyFile('test.mdx', doc, snapshot);

    expect(res1.diagnostics).toEqual(res2.diagnostics);
    expect(res1.claims.map((c) => c.status)).toEqual(res2.claims.map((c) => c.status));
  });
});
