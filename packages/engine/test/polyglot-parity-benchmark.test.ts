import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { RealityStore } from '../src/sqlite/reality-store';
import { AdapterRegistry } from '../src/adapters/registry';
import { ContractExtractor } from '../src/contracts/extractor';
import { SnapshotBuilder } from '../src/workspace/snapshot-builder';
import { WorkspaceProjector } from '../src/workspace/workspace-projector';
import { ContextStalenessDetector } from '../src/workspace/staleness';

describe('Phase III-C & IV: Polyglot Parity Benchmark & Context Staleness', () => {
  let tempTsDir: string;
  let tempPyDir: string;
  let storeTs: RealityStore;
  let storePy: RealityStore;

  beforeEach(() => {
    tempTsDir = path.join(process.cwd(), '.chrona-parity-ts-' + Math.random().toString(36).slice(2, 8));
    tempPyDir = path.join(process.cwd(), '.chrona-parity-py-' + Math.random().toString(36).slice(2, 8));
    fs.mkdirSync(tempTsDir, { recursive: true });
    fs.mkdirSync(tempPyDir, { recursive: true });
    storeTs = new RealityStore(tempTsDir);
    storePy = new RealityStore(tempPyDir);
  });

  afterEach(() => {
    try {
      storeTs.close();
      storePy.close();
      fs.rmSync(tempTsDir, { recursive: true, force: true });
      fs.rmSync(tempPyDir, { recursive: true, force: true });
    } catch {}
  });

  it('proves 100% semantic parity between TypeScript and Python reality models', async () => {
    // 1. Setup TypeScript Codebase
    const tsAuth = path.join(tempTsDir, 'auth.ts');
    const tsController = path.join(tempTsDir, 'controller.ts');

    fs.writeFileSync(
      tsAuth,
      `export class Session {
  token: string = '';
  isAdmin: boolean = false;
}

export function authenticateUser(token: string, retries: number = 3): Session {
  if (!token || token.length < 8) {
    throw new Error('Invalid token length');
  }
  return new Session();
}`
    );

    fs.writeFileSync(
      tsController,
      `import { authenticateUser, Session } from './auth';

export function handlePayment(token: string, amount: number): { success: boolean } {
  const session = authenticateUser(token);
  if (!session.isAdmin) {
    throw new Error('Admin role required');
  }
  return { success: true };
}`
    );

    // 2. Setup Python Codebase (Semantically Equivalent)
    const pyAuth = path.join(tempPyDir, 'auth.py');
    const pyController = path.join(tempPyDir, 'controller.py');

    fs.writeFileSync(
      pyAuth,
      `class Session:
    token: str
    is_admin: bool = False

def authenticate_user(token: str, retries: int = 3) -> Session:
    if not token or len(token) < 8:
        raise ValueError("Invalid token length")
    return Session()
`
    );

    fs.writeFileSync(
      pyController,
      `from .auth import authenticate_user, Session

def handle_payment(token: str, amount: float) -> dict:
    session = authenticate_user(token)
    if not session.is_admin:
        raise PermissionError("Admin role required")
    return {"success": True}
`
    );

    const statTsAuth = fs.statSync(tsAuth);
    const statTsCtrl = fs.statSync(tsController);
    const statPyAuth = fs.statSync(pyAuth);
    const statPyCtrl = fs.statSync(pyController);

    const tsList = [
      { relativePath: 'auth.ts', fullPath: tsAuth, mtimeMs: statTsAuth.mtimeMs, size: statTsAuth.size },
      { relativePath: 'controller.ts', fullPath: tsController, mtimeMs: statTsCtrl.mtimeMs, size: statTsCtrl.size },
    ];
    const pyList = [
      { relativePath: 'auth.py', fullPath: pyAuth, mtimeMs: statPyAuth.mtimeMs, size: statPyAuth.size },
      { relativePath: 'controller.py', fullPath: pyController, mtimeMs: statPyCtrl.mtimeMs, size: statPyCtrl.size },
    ];

    const adapters = new AdapterRegistry();
    const extractorTs = new ContractExtractor(tempTsDir);
    const extractorPy = new ContractExtractor(tempPyDir);

    await storeTs.sync(tsList, adapters, extractorTs);
    await storePy.sync(pyList, adapters, extractorPy);

    // 3. Compare Dependency Graph Parity
    const graphTs = storeTs.getDependencyGraph();
    const graphPy = storePy.getDependencyGraph();

    expect(graphTs.totalModules).toBe(graphPy.totalModules);
    expect(graphTs.totalDependencies).toBe(graphPy.totalDependencies);

    // 4. Compare Behavioral Contracts Parity
    const contractsTs = storeTs.getContracts();
    const contractsPy = storePy.getContracts();

    expect(contractsTs.length).toBe(contractsPy.length);
    expect(contractsTs.some((c) => c.statement.includes('Admin role required'))).toBe(true);
    expect(contractsPy.some((c) => c.statement.includes('Admin role required'))).toBe(true);

    // 5. Compile Task Workspace Projections
    const builderTs = new SnapshotBuilder(tempTsDir, storeTs);
    const builderPy = new SnapshotBuilder(tempPyDir, storePy);

    const snapshotTs = await builderTs.buildSnapshot();
    const snapshotPy = await builderPy.buildSnapshot();

    const projectorTs = new WorkspaceProjector(tempTsDir);
    const projectorPy = new WorkspaceProjector(tempPyDir);

    const packetTs = await projectorTs.project(snapshotTs, {
      task: 'Update handle payment admin check',
      target: 'controller.ts',
    });
    const packetPy = await projectorPy.project(snapshotPy, {
      task: 'Update handle payment admin check',
      target: 'controller.py',
    });

    // Verify projection quality parity
    expect(packetTs.workspaceId).toBeDefined();
    expect(packetPy.workspaceId).toBeDefined();
    expect(packetTs.projection.evidenceCompleteness).toBe(packetPy.projection.evidenceCompleteness);
    expect(packetTs.reality.contracts.length).toBe(packetPy.reality.contracts.length);
  });

  it('detects context staleness when underlying reality store advances', async () => {
    const tsAuth = path.join(tempTsDir, 'auth.ts');
    fs.writeFileSync(
      tsAuth,
      `export function login(user: string): boolean {
  if (!user) throw new Error('User required');
  return true;
}`
    );

    const stat = fs.statSync(tsAuth);
    await storeTs.sync(
      [{ relativePath: 'auth.ts', fullPath: tsAuth, mtimeMs: stat.mtimeMs, size: stat.size }],
      new AdapterRegistry(),
      new ContractExtractor(tempTsDir)
    );

    const builder = new SnapshotBuilder(tempTsDir, storeTs);
    const snapshot = await builder.buildSnapshot();

    const projector = new WorkspaceProjector(tempTsDir);
    const packet = await projector.project(snapshot, {
      task: 'Modify login error message',
      target: 'auth.ts',
    });

    // 1. Initial check: up-to-date
    const report1 = ContextStalenessDetector.check(packet, storeTs);
    expect(report1.isStale).toBe(false);
    expect(report1.stalenessReason).toBe('UP_TO_DATE');
    expect(report1.recompileRecommended).toBe(false);

    // 2. Mutate file and advance reality store
    fs.writeFileSync(
      tsAuth,
      `export function login(user: string, role: string): boolean {
  if (!user || role !== 'admin') throw new Error('Admin role required');
  return true;
}`
    );
    const newStat = fs.statSync(tsAuth);
    await storeTs.sync(
      [{ relativePath: 'auth.ts', fullPath: tsAuth, mtimeMs: newStat.mtimeMs, size: newStat.size }],
      new AdapterRegistry(),
      new ContractExtractor(tempTsDir)
    );

    // 3. Staleness check: detect mutation
    const report2 = ContextStalenessDetector.check(packet, storeTs);
    expect(report2.isStale).toBe(true);
    expect(report2.currentSnapshotId).not.toBe(packet.snapshotId);
  });
});
