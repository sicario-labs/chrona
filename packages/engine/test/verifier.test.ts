import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { DocumentationVerifier } from '../src/verifier';
import { FastAstExtractor } from '../src/referee/oxc-extractor';
import type { RepositorySnapshot } from '../src/claim/types';

describe('DocumentationVerifier', () => {
  const extractor = new FastAstExtractor();
  const sourceCode = `
    export function parseURL(input: string, options?: { strict?: boolean }): void {}
    export function joinURL(base: string, path: string): string { return base + path; }
  `;
  const symbols = new Map<string, ReturnType<FastAstExtractor['extract']>[number]>();
  for (const s of extractor.extract(sourceCode, 'src/url.ts')) {
    symbols.set(s.name, s);
  }

  const snapshot: RepositorySnapshot = {
    files: new Map([['src/url.ts', sourceCode]]),
    symbols,
  };

  it('verifies valid MDX documentation with zero errors', () => {
    const verifier = new DocumentationVerifier();
    const validMdx = `
# URL API

### \`parseURL(input: string, options?: { strict?: boolean }): void\`

\`parseURL("/foo", { strict: true })\`

\`\`\`ts
import { joinURL } from 'src/url';
const full = joinURL("https://a.com", "/b");
\`\`\`
`;

    const result = verifier.verifyFile('content/docs/url.mdx', validMdx, snapshot);
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    expect(result.claims.filter((c) => c.status === 'verified').length).toBeGreaterThan(0);
  });

  it('flags multiple contradictions and returns structured diagnostics', () => {
    const verifier = new DocumentationVerifier();
    const invalidMdx = `
# Broken Doc

### \`parseURL(input: string): string\`

Calls \`parseURL("foo", { unsupportedOption: true })\`.

\`\`\`ts
const x: = invalid;
\`\`\`
`;

    const result = verifier.verifyFile('content/docs/broken.mdx', invalidMdx, snapshot);
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errors.length).toBeGreaterThan(0);

    const codes = errors.map((e) => e.code);
    expect(codes).toContain('DOC-103'); // phantom option unsupportedOption
    expect(codes).toContain('DOC-107'); // return type string vs void
  });
});
