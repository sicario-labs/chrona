import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { RealityStore } from '../src/sqlite/reality-store';
import { AdapterRegistry } from '../src/adapters/registry';
import { ContractExtractor } from '../src/contracts/extractor';
import { SnapshotBuilder } from '../src/workspace/snapshot-builder';
import { WorkspaceProjector } from '../src/workspace/workspace-projector';
import { ChronaLivingRealityWatcher } from '../src/workspace/living-reality-watcher';
import { ContextStalenessDetector, StaleContextError } from '../src/workspace/staleness';

describe('Phase IV: Living Reality & Agent Concurrency Control', () => {
  let tempDir: string;
  let store: RealityStore;
  let watcher: ChronaLivingRealityWatcher;

  beforeEach(() => {
    tempDir = path.join(process.cwd(), '.chrona-living-reality-test-' + Math.random().toString(36).slice(2, 8));
    fs.mkdirSync(tempDir, { recursive: true });
    store = new RealityStore(tempDir);
    watcher = new ChronaLivingRealityWatcher(tempDir, store);
  });

  afterEach(() => {
    try {
      store.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('notifies affected workspaces and performs fine-grained staleness discrimination', async () => {
    // 1. Setup repository files
    const authFile = path.join(tempDir, 'auth.ts');
    const paymentFile = path.join(tempDir, 'payment.ts');

    fs.writeFileSync(
      authFile,
      `export function verifyAuth(token: string): boolean {
  if (!token) throw new Error('Token required');
  return true;
}`
    );

    fs.writeFileSync(
      paymentFile,
      `export function processPayment(amount: number): boolean {
  if (amount <= 0) throw new Error('Amount must be positive');
  return true;
}`
    );

    const statAuth = fs.statSync(authFile);
    const statPay = fs.statSync(paymentFile);

    await store.sync(
      [
        { relativePath: 'auth.ts', fullPath: authFile, mtimeMs: statAuth.mtimeMs, size: statAuth.size },
        { relativePath: 'payment.ts', fullPath: paymentFile, mtimeMs: statPay.mtimeMs, size: statPay.size },
      ],
      new AdapterRegistry(),
      new ContractExtractor(tempDir)
    );

    const builder = new SnapshotBuilder(tempDir, store);
    const snapshot = await builder.buildSnapshot();
    const projector = new WorkspaceProjector(tempDir);

    // 2. Create two active agent workspaces
    const wsAuth = await projector.project(snapshot, {
      task: 'Update auth token checks',
      target: 'auth.ts',
    });

    const wsPayment = await projector.project(snapshot, {
      task: 'Update payment threshold',
      target: 'payment.ts',
    });

    // 3. Register workspaces with living reality watcher
    watcher.registerWorkspace(wsAuth);
    watcher.registerWorkspace(wsPayment);
    expect(watcher.getActiveWorkspaceCount()).toBe(2);

    const stalenessEvents: Array<{ workspaceId: string; report: any }> = [];
    const criticalEvents: Array<{ workspaceId: string; report: any }> = [];

    watcher.on('workspace_staleness', (e) => stalenessEvents.push(e));
    watcher.on('critical_invalidation', (e) => criticalEvents.push(e));

    // 4. Simulate a background developer edit on auth.ts
    fs.writeFileSync(
      authFile,
      `export function verifyAuth(token: string, secret: string): boolean {
  if (!token || !secret) throw new Error('Token and secret required');
  return true;
}`
    );

    await watcher.handleFileChanges(['auth.ts']);

    // 5. Verify selective staleness discrimination
    expect(stalenessEvents.length).toBe(2);

    const authEvent = stalenessEvents.find((e) => e.workspaceId === wsAuth.workspaceId);
    const payEvent = stalenessEvents.find((e) => e.workspaceId === wsPayment.workspaceId);

    // Workspace Auth: CRITICAL target mutation
    expect(authEvent).toBeDefined();
    expect(authEvent?.report.isStale).toBe(true);
    expect(authEvent?.report.severity).toBe('CRITICAL');
    expect(authEvent?.report.scope).toBe('TARGET');
    expect(authEvent?.report.reasons).toContain('TARGET_FILE_MUTATED');
    expect(authEvent?.report.recompileRecommended).toBe(true);

    // Workspace Payment: UNRELATED background drift (still valid)
    expect(payEvent).toBeDefined();
    expect(payEvent?.report.isStale).toBe(true);
    expect(payEvent?.report.severity).toBe('LOW');
    expect(payEvent?.report.scope).toBe('UNRELATED');
    expect(payEvent?.report.recompileRecommended).toBe(false);

    // Critical invalidation only fired for auth workspace
    expect(criticalEvents.length).toBe(1);
    expect(criticalEvents[0].workspaceId).toBe(wsAuth.workspaceId);

    // 6. Verify Optimistic Concurrency Control (OCC) Assertion
    expect(() => ContextStalenessDetector.assertNotStale(wsAuth, store)).toThrow(StaleContextError);
    expect(() => ContextStalenessDetector.assertNotStale(wsPayment, store)).not.toThrow();
  });
});
