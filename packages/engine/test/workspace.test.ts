import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { ChronaWorkspace } from '../src/workspace/model';

describe('Chrona Workspace: Epistemic Software Model', () => {
  const rootDir = path.resolve(__dirname, '../../../test-repos/radix3');

  it('constructs complete epistemic workspace model from codebase', async () => {
    const ws = await ChronaWorkspace.fromDirectory(rootDir);

    // 1. Manifest
    expect(ws.manifest.name).toBe('rou3');
    expect(ws.manifest.id).toBeDefined();
    expect(ws.manifest.commit).toBeDefined();

    // 2. Software Model
    expect(ws.software.symbolsCount).toBeGreaterThan(0);
    expect(ws.software.symbols.has('createRouter')).toBe(true);

    // 3. Knowledge Model
    expect(ws.knowledge.claimsCount).toBeGreaterThan(0);
    expect(ws.knowledge.verifiedCount).toBeGreaterThan(0);

    // 4. Evidence Model
    expect(ws.evidence.astEvidence).toBe(true);
    expect(ws.evidence.packageMetadata).toBe(true);

    // 5. Integrity Score
    expect(ws.integrity.score).toBeGreaterThan(0.9);
    expect(ws.integrity.diagnostics).toBeDefined();

    // 6. Relationship Graph
    expect(ws.relationships.length).toBeGreaterThan(0);
    const routerRels = ws.getRelationships('createRouter');
    expect(routerRels.length).toBeGreaterThan(0);
    expect(routerRels.some((r) => r.relation === 'IMPLEMENTED_BY')).toBe(true);
  }, 15000);

  it('generates structured overview summary', async () => {
    const ws = await ChronaWorkspace.fromDirectory(rootDir);
    const overview = ws.getOverview();

    expect(overview.manifest.name).toBe('rou3');
    expect(overview.sources.symbols).toBeGreaterThan(0);
    expect(overview.documentation.claims).toBeGreaterThan(0);
    expect(overview.evidence.ast).toBe(true);
    expect(overview.integrity.scorePercent).toContain('%');
  }, 15000);

  it('retrieves verified context with provenance traversing workspace graph', async () => {
    const ws = await ChronaWorkspace.fromDirectory(rootDir);
    const context = ws.getVerifiedContext({ scope: 'createRouter' });

    expect(context.scope).toBe('createRouter');
    expect(context.entryPoints.length).toBeGreaterThan(0);
    expect(context.entryPoints.some((ep) => ep.name === 'createRouter')).toBe(true);
    expect(context.evidence.astProvenance).toBe(true);
  }, 15000);

  it('generates deep epistemic explanation via explainSymbol', async () => {
    const ws = await ChronaWorkspace.fromDirectory(rootDir);
    const explanation = ws.explainSymbol('createRouter');

    expect(explanation).toBeDefined();
    expect(explanation?.symbol).toBe('createRouter');
    expect(explanation?.implementation.signature).toContain('RouterContext');
    expect(explanation?.documentation.totalReferences).toBeGreaterThan(0);
    expect(explanation?.verdict.confidence).toBeGreaterThan(0.8);
    expect(explanation?.evidenceChain.length).toBeGreaterThan(0);
  }, 15000);
});
