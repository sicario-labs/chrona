import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { analyzeChangeImpact } from '../src/impact/analyzer';
import type { GitChange } from '../src/git/diff';

describe('analyzeChangeImpact', () => {
  const testRepo = path.resolve(__dirname, '../../../test-repos/radix3');

  it('filters claims and diagnostics to explicitly changed symbols', async () => {
    const changes: GitChange[] = [
      {
        symbol: 'createRouter',
        file: 'src/context.ts',
        type: 'modified',
        before: 'createRouter(options: RouterOptions): RouterContext',
        after: 'createRouter(): RouterContext',
      },
    ];

    const impact = await analyzeChangeImpact({
      cwd: testRepo,
      changes,
    });

    expect(impact.changedSymbols).toHaveLength(1);
    expect(impact.changedSymbols[0].symbol).toBe('createRouter');
    expect(impact.affectedFiles.length).toBeGreaterThan(0);
    expect(impact.affectedClaims.length).toBeGreaterThan(0);

    // All affected claims must be related to createRouter
    for (const ac of impact.affectedClaims) {
      expect(
        ac.claim.subject === 'createRouter' ||
        ac.claim.source.text.includes('createRouter')
      ).toBe(true);
    }

    // Diagnostics should be computed for createRouter phantom options (DOC-103)
    expect(impact.diagnostics.length).toBeGreaterThan(0);
    expect(impact.diagnostics.some((d) => d.code === 'DOC-103')).toBe(true);
  });

  it('reports 0 affected claims when changed symbol is unrelated to docs', async () => {
    const changes: GitChange[] = [
      {
        symbol: 'nonExistentInternalHelper',
        file: 'src/internal.ts',
        type: 'modified',
        before: 'nonExistentInternalHelper(): void',
        after: 'nonExistentInternalHelper(x: number): void',
      },
    ];

    const impact = await analyzeChangeImpact({
      cwd: testRepo,
      changes,
    });

    expect(impact.affectedClaims).toHaveLength(0);
    expect(impact.affectedFiles).toHaveLength(0);
    expect(impact.diagnostics).toHaveLength(0);
  });
});
