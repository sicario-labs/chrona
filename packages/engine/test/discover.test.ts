import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import { discoverEvidence } from '../src/discover';

describe('discoverEvidence', () => {
  it('discovers AST exports and types from radix3 test-repo', async () => {
    const rootDir = path.resolve(__dirname, '../../../test-repos/radix3');
    const result = await discoverEvidence({ cwd: rootDir });

    expect(result.exports.length).toBeGreaterThan(0);
    expect(result.types.length).toBeGreaterThan(0);

    const routerExport = result.exports.find((e) => e.name === 'createRouter');
    expect(routerExport).toBeDefined();
    expect(routerExport?.file).toContain('src/');
    expect(routerExport?.signature).toBeDefined();
  });

  it('handles empty or non-existent directories gracefully', async () => {
    const result = await discoverEvidence({ cwd: '/non-existent-directory-xyz-123' });
    expect(result.exports).toEqual([]);
    expect(result.types).toEqual([]);
  });
});
