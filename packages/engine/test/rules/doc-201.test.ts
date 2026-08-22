import { describe, it, expect } from 'vitest';
import { doc201Rule } from '../../src/rules/doc-201';
import type { Claim, Evidence, RepositorySnapshot } from '../../src/claim/types';

describe('Rule DOC-201: BROKEN_CODE_EXAMPLE', () => {
  const snapshot: RepositorySnapshot = {
    files: new Map(),
    symbols: new Map(),
  };

  it('passes when code example compiles cleanly', () => {
    const claim: Claim = {
      id: 'doc#L40',
      type: 'example',
      subject: 'const router = createRouter();',
      source: { file: 'docs/test.mdx', line: 40, text: '```ts\nconst router = createRouter();\n```' },
      evidence: [],
      status: 'unverified',
    };

    const evidence: Evidence[] = [
      {
        source: 'compiled-example',
        file: 'docs/test.mdx',
        line: 40,
        confidence: 1.0,
        data: { compiles: true },
      },
    ];

    const diag = doc201Rule.evaluate(claim, evidence, snapshot);
    expect(diag).toBeNull();
  });

  it('emits error diagnostic when code example has syntax or compilation error', () => {
    const claim: Claim = {
      id: 'doc#L45',
      type: 'example',
      subject: 'const x = {;',
      source: { file: 'docs/test.mdx', line: 45, text: '```ts\nconst x = {;\n```' },
      evidence: [],
      status: 'unverified',
    };

    const evidence: Evidence[] = [
      {
        source: 'compiled-example',
        file: 'docs/test.mdx',
        line: 45,
        confidence: 1.0,
        data: { compiles: false, error: 'Unexpected token ;' },
      },
    ];

    const diag = doc201Rule.evaluate(claim, evidence, snapshot);
    expect(diag).toBeDefined();
    expect(diag?.code).toBe('DOC-201');
    expect(diag?.severity).toBe('error');
  });
});
