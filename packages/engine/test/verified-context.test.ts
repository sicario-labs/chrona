import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import { getVerifiedContext } from '../src/verified-context';

describe('getVerifiedContext', () => {
  it('resolves verified context with AST provenance for all symbols', async () => {
    const rootDir = path.resolve(__dirname, '../../../test-repos/radix3');
    const result = await getVerifiedContext({ cwd: rootDir });

    expect(result).toBeDefined();
    expect(result.status).toBeDefined();
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.sourceCommit).toBeDefined();
    expect(Array.isArray(result.claims)).toBe(true);
    expect(result.claims.length).toBeGreaterThan(0);
  });

  it('retrieves verified context and executable snippet for a specific symbol', async () => {
    const rootDir = path.resolve(__dirname, '../../../test-repos/radix3');
    const result = await getVerifiedContext({
      cwd: rootDir,
      symbol: 'createRouter',
    });

    expect(result).toBeDefined();
    expect(result.query).toBe('createRouter');
    expect(result.claims.length).toBeGreaterThan(0);
    expect(result.claims[0].targetSymbol).toBe('createRouter');
    expect(result.claims[0].evidence.evidenceChain.length).toBeGreaterThan(0);
    expect(result.executableSnippet).toBeDefined();
    expect(result.safeToExecute).toBe(true);
  });

  it('returns NOT_FOUND status for non-existent symbols', async () => {
    const rootDir = path.resolve(__dirname, '../../../test-repos/radix3');
    const result = await getVerifiedContext({
      cwd: rootDir,
      symbol: 'nonExistentSymbol_xyz123',
    });

    expect(result).toBeDefined();
    expect(result.status).toBe('NOT_FOUND');
    expect(result.confidence).toBe(0.0);
    expect(result.safeToExecute).toBe(false);
    expect(result.driftAlert).toBeDefined();
  });
});
