import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { RealityStore } from '../src/sqlite/reality-store';
import { AdapterRegistry } from '../src/adapters/registry';
import { ContractExtractor } from '../src/contracts/extractor';
import { WorkspaceProjector } from '../src/workspace/workspace-projector';
import { SnapshotBuilder } from '../src/workspace/snapshot-builder';

describe('Phase III-C: Unified IR Polyglot Proof (Python & TypeScript)', () => {
  let tempDir: string;
  let store: RealityStore;

  beforeEach(() => {
    tempDir = path.join(process.cwd(), '.chrona-polyglot-test-' + Math.random().toString(36).slice(2, 8));
    fs.mkdirSync(tempDir, { recursive: true });
    store = new RealityStore(tempDir);
  });

  afterEach(() => {
    try {
      store.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('extracts Python symbols, type hints, and contracts into Unified Chrona IR', async () => {
    const authPy = path.join(tempDir, 'auth.py');
    const servicePy = path.join(tempDir, 'service.py');

    fs.writeFileSync(
      authPy,
      `
class Session:
    token: str
    is_admin: bool = False

def authenticate_user(token: str, max_retries: int = 3) -> Session:
    """Authenticates a bearer token against identity provider."""
    if not token or len(token) < 10:
        raise PermissionError("Invalid session token format")
    assert max_retries > 0, "Retries must be positive"
    return Session()
`
    );

    fs.writeFileSync(
      servicePy,
      `
from .auth import authenticate_user, Session

def process_payment(session_token: str, amount: float) -> dict:
    session = authenticate_user(session_token)
    if not session.is_admin:
        raise PermissionError("Admin role required for payments")
    return {"status": "success", "amount": amount}
`
    );

    const statAuth = fs.statSync(authPy);
    const statService = fs.statSync(servicePy);

    const fileList = [
      { relativePath: 'auth.py', fullPath: authPy, mtimeMs: statAuth.mtimeMs, size: statAuth.size },
      { relativePath: 'service.py', fullPath: servicePy, mtimeMs: statService.mtimeMs, size: statService.size },
    ];

    const adapters = new AdapterRegistry();
    const extractor = new ContractExtractor(tempDir);

    const syncStats = await store.sync(fileList, adapters, extractor);
    expect(syncStats.addedOrModified).toBe(2);

    // 1. Verify Unified Symbol IR
    const authFn = store.getSymbol('authenticate_user');
    expect(authFn).not.toBeNull();
    expect(authFn?.kind).toBe('function');
    expect(authFn?.parameters?.length).toBe(2);
    expect(authFn?.parameters?.[0].name).toBe('token');
    expect(authFn?.parameters?.[0].type).toBe('str');
    expect(authFn?.returnType).toBe('Session');
    expect(authFn?.docstring).toContain('Authenticates a bearer token');

    const sessionClass = store.getSymbol('Session');
    expect(sessionClass).not.toBeNull();
    expect(sessionClass?.kind).toBe('class');
    expect(sessionClass?.properties?.some((p) => p.name === 'token')).toBe(true);

    // 2. Verify Unified Behavioral Contract Extraction
    const authContracts = store.getContracts('auth.py');
    expect(authContracts.length).toBeGreaterThanOrEqual(2);
    expect(authContracts.some((c) => c.statement.includes('Invalid session token format'))).toBe(true);
    expect(authContracts.some((c) => c.statement.includes('Retries must be positive'))).toBe(true);

    // 3. Verify Dependency Topology Graph
    const graph = store.getDependencyGraph();
    expect(graph.totalModules).toBe(2);
    expect(graph.nodes['service.py'].imports.some((i) => i.toFile === 'auth.py')).toBe(true);
    expect(graph.nodes['auth.py'].importedBy).toContain('service.py');
  });

  it('compiles certified TaskWorkspacePacket from Python reality', async () => {
    const mainPy = path.join(tempDir, 'main.py');
    const utilsPy = path.join(tempDir, 'utils.py');

    fs.writeFileSync(
      utilsPy,
      `
def format_currency(val: float) -> str:
    if val < 0:
        raise ValueError("Amount cannot be negative")
    return f"\${val:.2f}"
`
    );

    fs.writeFileSync(
      mainPy,
      `
from .utils import format_currency

def render_summary(total: float) -> str:
    return format_currency(total)
`
    );

    const statMain = fs.statSync(mainPy);
    const statUtils = fs.statSync(utilsPy);

    const fileList = [
      { relativePath: 'utils.py', fullPath: utilsPy, mtimeMs: statUtils.mtimeMs, size: statUtils.size },
      { relativePath: 'main.py', fullPath: mainPy, mtimeMs: statMain.mtimeMs, size: statMain.size },
    ];

    await store.sync(fileList, new AdapterRegistry(), new ContractExtractor(tempDir));

    const builder = new SnapshotBuilder(tempDir, store);
    const snapshot = await builder.buildSnapshot();

    const projector = new WorkspaceProjector(tempDir);
    const packet = await projector.project(snapshot, {
      task: 'Update format_currency to support negative refunds',
      target: 'utils.py',
    });

    expect(packet.workspaceId).toBeDefined();
    expect(packet.snapshotId).toBe(snapshot.id);
    expect(packet.manifest.target).toBe('utils.py');
    expect(packet.evidence.sourceSlices.some((s) => s.file === 'utils.py')).toBe(true);
    expect(packet.reality.contracts.some((c) => c.statement.includes('Amount cannot be negative'))).toBe(true);
    expect(packet.projection.evidenceCompleteness).toBeGreaterThan(0.5);
  });
});
