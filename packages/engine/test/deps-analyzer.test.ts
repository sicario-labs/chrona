import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { DependencyAnalyzer } from '../src/deps/analyzer';

describe('Dependency Analyzer Subsystem', () => {
  it('builds directed dependency graph and identifies callers/dependents', async () => {
    const analyzer = new DependencyAnalyzer(path.resolve(__dirname, '..'));
    const graph = await analyzer.buildGraph();

    expect(graph.totalModules).toBeGreaterThan(0);
    expect(graph.totalDependencies).toBeGreaterThan(0);

    const boundary = analyzer.computeImpactBoundary('contracts/types.ts', graph);
    expect(boundary.confidence).toBeGreaterThan(0.8);
  });
});
