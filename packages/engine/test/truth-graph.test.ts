import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import { buildTruthGraph } from '../src/truth-graph';

describe('buildTruthGraph', () => {
  it('constructs an epistemic truth graph connecting AST symbols with claims', async () => {
    const rootDir = path.resolve(__dirname, '../../../test-repos/radix3');
    const graph = await buildTruthGraph({
      cwd: rootDir,
      sourceDir: path.join(rootDir, 'src'),
      docsDir: path.join(rootDir, 'content', 'docs'),
    });

    expect(graph).toBeDefined();
    expect(graph.schemaVersion).toBe('v1');
    expect(graph.totalClaims).toBeGreaterThan(0);
    expect(graph.overallConfidence).toBeGreaterThanOrEqual(0);
    expect(graph.commit).toBeDefined();
    expect(Array.isArray(graph.claims)).toBe(true);

    const firstClaim = graph.claims[0];
    expect(firstClaim).toBeDefined();
    expect(firstClaim.id).toMatch(/^claim:/);
    expect(firstClaim.targetSymbol).toBeDefined();
    expect(firstClaim.evidence.evidenceChain.length).toBeGreaterThan(0);
    expect(firstClaim.evidence.verifiedAgainstCommit).toBeDefined();
    expect(typeof firstClaim.safeToExecute).toBe('boolean');
  });
});
