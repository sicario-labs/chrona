import { describe, expect, it } from 'vitest';
import { EvidenceResolver } from '../src/evidence/resolver';
import { FastAstExtractor } from '../src/referee/oxc-extractor';
import type { RepositorySnapshot, Claim } from '../src/claim/types';

describe('EvidenceResolver', () => {
  const extractor = new FastAstExtractor();
  const sourceCode = `
    export function createUser(email: string, password?: string): { id: string } {
      return { id: "123" };
    }
    export function parseURL(input: string, options?: { strict?: boolean }): void {}
  `;
  const symbols = new Map<string, ReturnType<FastAstExtractor['extract']>[number]>();
  for (const s of extractor.extract(sourceCode, 'src/auth.ts')) {
    symbols.set(s.name, s);
  }

  const snapshot: RepositorySnapshot = {
    files: new Map([['src/auth.ts', sourceCode]]),
    symbols,
  };

  const resolver = new EvidenceResolver();

  it('resolves symbol evidence from AST ground truth', () => {
    const claim: Claim = {
      id: 'claim-1',
      type: 'symbol',
      source: { file: 'docs/auth.mdx', line: 10, text: 'createUser' },
      subject: 'createUser',
      evidence: [],
      status: 'unverified',
    };

    const evidence = resolver.resolve(claim, snapshot);
    expect(evidence.length).toBe(1);
    expect(evidence[0].source).toBe('typescript-ast');
    expect(evidence[0].confidence).toBe(1.0);
    expect((evidence[0].data as any).exists).toBe(true);
  });

  it('resolves missing symbol evidence with confidence 1.0', () => {
    const claim: Claim = {
      id: 'claim-2',
      type: 'symbol',
      source: { file: 'docs/auth.mdx', line: 10, text: 'deleteUser' },
      subject: 'deleteUser',
      evidence: [],
      status: 'unverified',
    };

    const evidence = resolver.resolve(claim, snapshot);
    expect(evidence.length).toBe(1);
    expect((evidence[0].data as any).exists).toBe(false);
  });

  it('validates syntax of compiled code examples', () => {
    const validClaim: Claim = {
      id: 'claim-3',
      type: 'example',
      source: { file: 'docs/auth.mdx', line: 20, text: 'example' },
      subject: 'example',
      metadata: { language: 'ts', code: 'const x: number = 42;' },
      evidence: [],
      status: 'unverified',
    };

    const validEvidence = resolver.resolve(validClaim, snapshot);
    expect((validEvidence[0].data as any).compiles).toBe(true);

    const invalidClaim: Claim = {
      id: 'claim-4',
      type: 'example',
      source: { file: 'docs/auth.mdx', line: 30, text: 'bad example' },
      subject: 'bad example',
      metadata: { language: 'ts', code: 'const x: number = ;;; {{{' },
      evidence: [],
      status: 'unverified',
    };

    const invalidEvidence = resolver.resolve(invalidClaim, snapshot);
    expect((invalidEvidence[0].data as any).compiles).toBe(false);
  });
});
