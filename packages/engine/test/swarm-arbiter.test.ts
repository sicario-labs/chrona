import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { RealityStore } from '../src/sqlite/reality-store';
import { AdapterRegistry } from '../src/adapters/registry';
import { ContractExtractor } from '../src/contracts/extractor';
import { SnapshotBuilder } from '../src/workspace/snapshot-builder';
import { WorkspaceProjector } from '../src/workspace/workspace-projector';
import { ChronaSwarmArbiter } from '../src/arbiter/arbiter';

describe('Chrona Multi-Agent Swarm Conflict Arbiter', () => {
  let tempDir: string;
  let store: RealityStore;
  let arbiter: ChronaSwarmArbiter;

  beforeEach(() => {
    tempDir = path.join(process.cwd(), '.chrona-swarm-test-' + Math.random().toString(36).slice(2, 8));
    fs.mkdirSync(tempDir, { recursive: true });
    store = new RealityStore(tempDir);
    arbiter = new ChronaSwarmArbiter(30_000);
  });

  afterEach(() => {
    try {
      store.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('coordinates multi-agent semantic leases, blocks collisions, and emits swarm deltas', async () => {
    // 1. Setup repository files
    const authFile = path.join(tempDir, 'auth.ts');
    const paymentFile = path.join(tempDir, 'payment.ts');
    const notificationFile = path.join(tempDir, 'notification.ts');

    fs.writeFileSync(
      authFile,
      `export function verifyAuth(token: string): boolean {
  if (!token) throw new Error('Token required');
  return true;
}`
    );

    fs.writeFileSync(
      paymentFile,
      `import { verifyAuth } from './auth';

export function processPayment(amount: number, token: string): boolean {
  verifyAuth(token);
  if (amount <= 0) throw new Error('Amount must be positive');
  return true;
}`
    );

    fs.writeFileSync(
      notificationFile,
      `export function sendEmail(to: string): boolean {
  return true;
}`
    );

    const statAuth = fs.statSync(authFile);
    const statPayment = fs.statSync(paymentFile);
    const statNotification = fs.statSync(notificationFile);

    await store.sync(
      [
        { relativePath: 'auth.ts', fullPath: authFile, mtimeMs: statAuth.mtimeMs, size: statAuth.size },
        { relativePath: 'payment.ts', fullPath: paymentFile, mtimeMs: statPayment.mtimeMs, size: statPayment.size },
        { relativePath: 'notification.ts', fullPath: notificationFile, mtimeMs: statNotification.mtimeMs, size: statNotification.size },
      ],
      new AdapterRegistry(),
      new ContractExtractor(tempDir)
    );

    const builder = new SnapshotBuilder(tempDir, store);
    const snapshot = await builder.buildSnapshot();
    const projector = new WorkspaceProjector(tempDir);

    const wsAuth = await projector.project(snapshot, {
      task: 'Refactor auth tokens',
      target: 'auth.ts',
      tokenBudget: 4000,
    });

    const wsPayment = await projector.project(snapshot, {
      task: 'Add payment logging',
      target: 'payment.ts',
      tokenBudget: 4000,
    });

    const wsDuplicateAuth = await projector.project(snapshot, {
      task: 'Update auth expiration',
      target: 'auth.ts',
      tokenBudget: 4000,
    });

    // 2. Agent 1 acquires lease on auth.ts
    const leaseRes1 = arbiter.acquireLease('agent_1', wsAuth);
    expect(leaseRes1.granted).toBe(true);
    expect(leaseRes1.lease).toBeDefined();
    expect(leaseRes1.lease?.agentId).toBe('agent_1');

    // 3. Agent 2 attempts to acquire lease on auth.ts -> BLOCKED by Direct Collision
    const leaseRes2 = arbiter.acquireLease('agent_2', wsDuplicateAuth);
    expect(leaseRes2.granted).toBe(false);
    expect(leaseRes2.conflicts.length).toBe(1);
    expect(leaseRes2.conflicts[0].conflictType).toBe('DIRECT_TARGET');
    expect(leaseRes2.conflicts[0].resolution).toBe('BLOCK');

    // 4. Agent 3 acquires lease on payment.ts (which depends on auth.ts) -> GRANTED with BOUNDARY WARNING
    const leaseRes3 = arbiter.acquireLease('agent_3', wsPayment);
    expect(leaseRes3.granted).toBe(true);
    expect(leaseRes3.conflicts.length).toBe(1);
    expect(leaseRes3.conflicts[0].conflictType).toBe('BOUNDARY_COLLISION');
    expect(leaseRes3.conflicts[0].resolution).toBe('PROCEED_WITH_WARNING');

    // 5. Agent 1 commits changes to auth.ts -> Arbiter notifies Agent 3 in swarm delta
    const delta = arbiter.notifyCommit(leaseRes1.lease!.leaseId, ['auth.ts'], store);
    expect(delta.committedByAgentId).toBe('agent_1');
    expect(delta.affectedAgentIds).toContain('agent_3');

    // 6. Agent 1 releases lease
    const released = arbiter.releaseLease(leaseRes1.lease!.leaseId);
    expect(released).toBe(true);

    // 7. Agent 2 now retries and successfully acquires lease on auth.ts
    const retryRes2 = arbiter.acquireLease('agent_2', wsDuplicateAuth);
    expect(retryRes2.granted).toBe(true);
    expect(retryRes2.lease?.agentId).toBe('agent_2');
  });
});
