import { describe, expect, it } from 'vitest';
import { FastAstExtractor } from '../src/referee/oxc-extractor';
import { doc101Rule, doc102Rule, doc103Rule, doc107Rule, doc201Rule, doc401Rule } from '../src/rules';
import type { RepositorySnapshot, Claim, Evidence } from '../src/claim/types';

describe('Chrona Five Killer Rules Suite', () => {
  const extractor = new FastAstExtractor();
  const sourceCode = `
    /**
     * @deprecated Use newAuth() instead
     */
    export function legacyAuth(token: string): boolean {
      return true;
    }

    export function createUser(email: string, password: string): { id: string } {
      return { id: "123" };
    }

    export interface RouterOptions {
      strict?: boolean;
      routes?: string[];
    }

    export function createRouter(options?: RouterOptions): { match: () => void } {
      return { match: () => {} };
    }

    export async function fetchUser(id: string): Promise<string> {
      return id;
    }
  `;

  const symbols = new Map<string, ReturnType<FastAstExtractor['extract']>[number]>();
  for (const s of extractor.extract(sourceCode, 'src/api.ts')) {
    symbols.set(s.name, s);
  }

  const snapshot: RepositorySnapshot = {
    files: new Map([['src/api.ts', sourceCode]]),
    symbols,
  };

  it('DOC-101: catches missing symbols referenced in docs', () => {
    const claim: Claim = {
      id: 'claim-101',
      type: 'symbol',
      source: { file: 'docs/api.mdx', line: 10, text: 'import { missingSymbol } from "@pkg"' },
      subject: 'missingSymbol',
      metadata: { origin: 'import-statement' },
      evidence: [],
      status: 'unverified',
    };

    const diag = doc101Rule.evaluate(claim, [], snapshot);
    expect(diag).not.toBeNull();
    expect(diag?.code).toBe('DOC-101');
    expect(diag?.severity).toBe('error');
    expect(diag?.message).toContain('missingSymbol');
  });

  it('DOC-102: catches signature mismatch (wrong parameter count / name)', () => {
    const claim: Claim = {
      id: 'claim-102',
      type: 'signature',
      source: { file: 'docs/api.mdx', line: 20, text: 'createUser(name, email)' },
      subject: 'createUser',
      metadata: {
        parameters: [
          { name: 'name', isOptional: false },
          { name: 'email', isOptional: false },
        ],
      },
      evidence: [],
      status: 'unverified',
    };

    const diag = doc102Rule.evaluate(claim, [], snapshot);
    expect(diag).not.toBeNull();
    expect(diag?.code).toBe('DOC-102');
    expect(diag?.severity).toBe('error');
    expect(diag?.message).toContain('parameter #1 is `email` in code, but documented as `name`');
  });

  it('DOC-103: catches phantom options passed to functions', () => {
    const claim: Claim = {
      id: 'claim-103',
      type: 'parameter',
      source: { file: 'docs/api.mdx', line: 30, text: 'createRouter({ strict: true, invalidOption: 123 })' },
      subject: 'createRouter',
      metadata: {
        argIndex: 0,
        keys: ['strict', 'invalidOption'],
        origin: 'object-argument',
      },
      evidence: [],
      status: 'unverified',
    };

    const diag = doc103Rule.evaluate(claim, [], snapshot);
    expect(diag).not.toBeNull();
    expect(diag?.code).toBe('DOC-103');
    expect(diag?.severity).toBe('error');
    expect(diag?.message).toContain('Phantom option `{ invalidOption }` not accepted by `createRouter`');
  });

  it('DOC-107: catches return type mismatch', () => {
    const claim: Claim = {
      id: 'claim-107',
      type: 'return',
      source: { file: 'docs/api.mdx', line: 40, text: 'fetchUser returns Promise<User>' },
      subject: 'fetchUser',
      metadata: {
        claimedReturnType: 'Promise<User>',
      },
      evidence: [],
      status: 'unverified',
    };

    const diag = doc107Rule.evaluate(claim, [], snapshot);
    expect(diag).not.toBeNull();
    expect(diag?.code).toBe('DOC-107');
    expect(diag?.severity).toBe('error');
    expect(diag?.message).toContain('documentation states return type `Promise<User>`, but codebase returns `Promise<string>`');
  });

  it('DOC-201: catches broken code examples', () => {
    const claim: Claim = {
      id: 'claim-201',
      type: 'example',
      source: { file: 'docs/api.mdx', line: 50, text: 'broken example' },
      subject: 'broken example',
      metadata: { code: 'const a: = 123;' },
      evidence: [],
      status: 'unverified',
    };

    const evidence: Evidence[] = [
      {
        source: 'compiled-example',
        file: 'docs/api.mdx',
        line: 50,
        confidence: 1.0,
        data: { compiles: false, errors: ['Unexpected token: ='] },
      },
    ];

    const diag = doc201Rule.evaluate(claim, evidence, snapshot);
    expect(diag).not.toBeNull();
    expect(diag?.code).toBe('DOC-201');
    expect(diag?.severity).toBe('error');
    expect(diag?.message).toContain('Code example fails to compile');
  });

  it('DOC-401: flags deprecated symbol usage without notice', () => {
    const claim: Claim = {
      id: 'claim-401',
      type: 'symbol',
      source: { file: 'docs/api.mdx', line: 60, text: 'Call legacyAuth("xyz") to authenticate' },
      subject: 'legacyAuth',
      metadata: { origin: 'function-call' },
      evidence: [],
      status: 'unverified',
    };

    const diag = doc401Rule.evaluate(claim, [], snapshot);
    expect(diag).not.toBeNull();
    expect(diag?.code).toBe('DOC-401');
    expect(diag?.severity).toBe('warning');
  });
});
