import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import { computeChangeImpact } from '../src/impact';

describe('computeChangeImpact', () => {
  it('computes change impact against a target repository and branch', async () => {
    const rootDir = path.resolve(__dirname, '../../../test-repos/radix3');
    const impact = await computeChangeImpact({
      cwd: rootDir,
      baseBranch: 'main',
    });

    expect(impact).toBeDefined();
    expect(impact.schemaVersion).toBe('v1');
    expect(impact.status).toBeDefined();
    expect(Array.isArray(impact.affectedTasks)).toBe(true);
    expect(Array.isArray(impact.affectedPages)).toBe(true);
    expect(Array.isArray(impact.requiredActions)).toBe(true);
    expect(impact.unaffected).toBeDefined();
  });
});
