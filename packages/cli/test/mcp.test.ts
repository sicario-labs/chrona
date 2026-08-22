import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import {
  getVerifiedContext,
  discoverEvidence,
  computeChangeImpact,
} from '@chrona-engine/engine';
import { verifyClaim } from '../../engine/src/verifier';

describe('Chrona Truth MCP Server Tools', () => {
  const rootDir = path.resolve(__dirname, '../../../test-repos/radix3');

  it('executes verify_documentation_claim tool logic on valid symbol statement', async () => {
    const res = await verifyClaim(
      {
        claim: 'createRouter',
        file: 'docs/routing.mdx',
        line: 10,
      },
      { cwd: rootDir }
    );

    expect(res).toBeDefined();
    expect(res.status).toBe('verified');
    expect(res.confidence).toBe(1.0);
    expect(res.evidence.length).toBeGreaterThan(0);
    expect(res.diagnostic).toBeNull();
  });

  it('executes verify_documentation_claim tool logic detecting non-existent symbol', async () => {
    const res = await verifyClaim(
      {
        claim: 'nonExistentFakeFunction',
        file: 'docs/test.mdx',
        line: 5,
      },
      { cwd: rootDir }
    );

    expect(res).toBeDefined();
    expect(res.status).toBe('contradicted');
    expect(res.diagnostic).toBe('DOC-101');
    expect(res.message).toContain('nonExistentFakeFunction');
  });

  it('executes get_verified_context tool logic for symbol lookups', async () => {
    const res = await getVerifiedContext({
      cwd: rootDir,
      symbol: 'createRouter',
    });

    expect(res).toBeDefined();
    expect(res.status).toBe('VERIFIED');
    expect(res.confidence).toBeGreaterThan(0.9);
    expect(res.claims.length).toBeGreaterThan(0);
    expect(res.safeToExecute).toBe(true);
  });

  it('executes discover_evidence tool logic extracting AST ground truth', async () => {
    const evidence = await discoverEvidence({ cwd: rootDir });

    expect(evidence).toBeDefined();
    expect(evidence.exports.length).toBeGreaterThan(0);
  });

  it('executes get_agent_work_order tool logic generating structured repairs', async () => {
    const workOrder = await computeChangeImpact({ cwd: rootDir });

    expect(workOrder).toBeDefined();
    expect(workOrder.schemaVersion).toBe('v1');
    expect(workOrder.status).toBeDefined();
  });

  it('executes get_workspace tool logic compiling task-specific context packet', async () => {
    const { SnapshotBuilder, WorkspaceProjector } = await import('@chrona-engine/engine');
    const builder = new SnapshotBuilder(rootDir);
    const snapshot = await builder.buildSnapshot({ cwd: rootDir });
    const projector = new WorkspaceProjector();
    const packet = await projector.project(snapshot, {
      task: 'Add strict route matching',
      intent: 'modify',
      target: 'createRouter',
    });

    expect(packet).toBeDefined();
    expect(packet.workspaceId.startsWith('ws_')).toBe(true);
    expect(packet.snapshotId.startsWith('snap_')).toBe(true);
    expect(packet.manifest.purpose).toContain('strict route matching');
    expect(packet.reality.target.file).toBeDefined();
    expect(packet.evidence.sourceSlices.length).toBeGreaterThan(0);
    expect(packet.projection.contextEfficiency).toBeDefined();
  });
});

