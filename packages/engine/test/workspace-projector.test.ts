import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  SnapshotBuilder,
  WorkspaceProjector,
  EvidenceGraph,
  EvidenceOptimizer,
} from '../src';

describe('GET Workspace: Snapshot & Context Compiler', () => {
  const rootDir = path.resolve(__dirname, '../../../test-repos/radix3');

  it('builds an immutable, deterministic WorkspaceSnapshot', async () => {
    const builder = new SnapshotBuilder(rootDir);
    const snapshot1 = await builder.buildSnapshot({ cwd: rootDir });
    const snapshot2 = await builder.buildSnapshot({ cwd: rootDir });

    expect(snapshot1.id).toBeDefined();
    expect(snapshot1.id.startsWith('snap_')).toBe(true);
    expect(snapshot1.id).toBe(snapshot2.id); // Determinism
    expect(snapshot1.graph.totalModules).toBeGreaterThan(0);
    expect(snapshot1.symbols.size).toBeGreaterThan(0);
    expect(snapshot1.fileHashes).toBeDefined();
  });

  it('builds evidence graph and discovers candidates mapped to claims', async () => {
    const builder = new SnapshotBuilder(rootDir);
    const snapshot = await builder.buildSnapshot({ cwd: rootDir });

    const evidenceGraph = new EvidenceGraph(snapshot);
    const { candidates, relevantClaims } = await evidenceGraph.buildEvidencePool({
      task: 'Add strict route matching to createRouter',
      intent: 'modify',
      target: 'createRouter',
    });

    expect(candidates.length).toBeGreaterThan(0);
    const targetCandidate = candidates.find((c) => c.role === 'target');
    expect(targetCandidate).toBeDefined();
    expect(targetCandidate?.file).toContain('src/');
  });

  it('optimizes evidence candidates under token budget constraints with claim coverage states', () => {
    const optimizer = new EvidenceOptimizer();

    const mockCandidates = [
      {
        id: 'src/router.ts:1-30',
        file: 'src/router.ts',
        startLine: 1,
        endLine: 30,
        content: 'export function createRouter() {}',
        proves: ['claim_1'],
        confidence: 0.98,
        criticality: 1,
        specificity: 1.0,
        tokenCost: 100,
        role: 'target' as const,
      },
      {
        id: 'src/matcher.ts:10-50',
        file: 'src/matcher.ts',
        startLine: 10,
        endLine: 50,
        content: 'export function matchRoute() {}',
        proves: ['claim_2'],
        confidence: 0.95,
        criticality: 2,
        specificity: 0.9,
        tokenCost: 200,
        role: 'dependent' as const,
      },
    ];

    const mockClaims = [
      {
        id: 'claim_1',
        type: 'symbol' as const,
        source: { file: 'docs.md', line: 10, text: 'createRouter exists' },
        subject: 'createRouter',
        evidence: [],
        status: 'verified' as const,
      },
      {
        id: 'claim_2',
        type: 'behavior' as const,
        source: { file: 'docs.md', line: 20, text: 'matches route accurately' },
        subject: 'matchRoute',
        evidence: [],
        status: 'verified' as const,
      },
    ];

    // High budget: both included -> PROVEN
    const fullResult = optimizer.optimize(mockCandidates, mockClaims, [], 1000);
    expect(fullResult.selectedCandidates.length).toBe(2);
    expect(fullResult.claimCoverage.every((c) => c.status === 'PROVEN')).toBe(true);
    expect(fullResult.omittedEvidence.length).toBe(0);

    // Tight budget (150 tokens): only target fits -> claim_1 PROVEN, claim_2 UNPROVEN
    const tightResult = optimizer.optimize(mockCandidates, mockClaims, [], 150);
    expect(tightResult.selectedCandidates.length).toBe(1);
    expect(tightResult.selectedCandidates[0].id).toBe('src/router.ts:1-30');
    expect(tightResult.claimCoverage.find((c) => c.claimId === 'claim_1')?.status).toBe('PROVEN');
    expect(tightResult.claimCoverage.find((c) => c.claimId === 'claim_2')?.status).toBe('UNPROVEN');
    expect(tightResult.omittedEvidence.length).toBe(1);
  });

  it('compiles a complete TaskWorkspacePacket from snapshot and task query', async () => {
    const builder = new SnapshotBuilder(rootDir);
    const snapshot = await builder.buildSnapshot({ cwd: rootDir });

    const projector = new WorkspaceProjector();
    const packet = await projector.project(snapshot, {
      task: 'Add strict route matching',
      intent: 'modify',
      target: 'createRouter',
      tokenBudget: 5000,
    });

    expect(packet.workspaceId).toBeDefined();
    expect(packet.workspaceId.startsWith('ws_')).toBe(true);
    expect(packet.snapshotId).toBe(snapshot.id);

    // Manifest
    expect(packet.manifest.purpose).toContain('strict route matching');
    expect(packet.manifest.intent).toBe('modify');
    expect(packet.manifest.claimCoverage).toBeDefined();

    // Reality
    expect(packet.reality.target.symbol || packet.reality.target.file).toBeDefined();
    expect(packet.reality.boundary).toBeDefined();
    expect(packet.reality.boundary.transitiveDependents).toBeDefined();
    expect(packet.reality.architecture).toBeDefined();

    // Evidence
    expect(packet.evidence.sourceSlices.length).toBeGreaterThan(0);
    expect(packet.evidence.sourceSlices[0].content).toBeDefined();

    // Projection metrics
    expect(packet.projection.coverageScore).toBeGreaterThanOrEqual(0);
    expect(packet.projection.tokenCount).toBeLessThanOrEqual(5000);
    expect(packet.projection.contextEfficiency).toBeGreaterThanOrEqual(0);
  });

  it('guarantees deterministic projections for identical inputs', async () => {
    const builder = new SnapshotBuilder(rootDir);
    const snapshot = await builder.buildSnapshot({ cwd: rootDir });

    const projector = new WorkspaceProjector();
    const packet1 = await projector.project(snapshot, {
      task: 'Refactor router structure',
      intent: 'refactor',
      target: 'createRouter',
      tokenBudget: 4000,
    });

    const packet2 = await projector.project(snapshot, {
      task: 'Refactor router structure',
      intent: 'refactor',
      target: 'createRouter',
      tokenBudget: 4000,
    });

    expect(packet1.workspaceId).toBe(packet2.workspaceId);
    expect(packet1.snapshotId).toBe(packet2.snapshotId);
    expect(packet1.projection.tokenCount).toBe(packet2.projection.tokenCount);
    expect(packet1.evidence.sourceSlices.map((s) => s.id)).toEqual(
      packet2.evidence.sourceSlices.map((s) => s.id)
    );
  });
});
