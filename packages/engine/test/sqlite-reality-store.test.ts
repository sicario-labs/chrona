import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { RealityStore } from '../src/sqlite/reality-store';
import { AdapterRegistry } from '../src/adapters/registry';
import { ContractExtractor } from '../src/contracts/extractor';

describe('Phase III-A: SQLite RealityStore Engine', () => {
  let store: RealityStore;
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(process.cwd(), '.chrona-test-temp-' + Math.random().toString(36).slice(2, 8));
    fs.mkdirSync(tempDir, { recursive: true });
    store = new RealityStore(tempDir);
  });

  afterEach(() => {
    try {
      store.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('synchronizes files incrementally and stores symbols and contracts', async () => {
    const fileA = path.join(tempDir, 'a.ts');
    fs.writeFileSync(
      fileA,
      `export function calculateMetrics(a: number, b: number): number {
        if (a < 0) throw new Error("Negative input");
        return a + b;
      }`
    );

    const statA = fs.statSync(fileA);
    const fileList = [
      {
        relativePath: 'a.ts',
        fullPath: fileA,
        mtimeMs: statA.mtimeMs,
        size: statA.size,
      },
    ];

    const stats = await store.sync(fileList, new AdapterRegistry(), new ContractExtractor(tempDir));
    expect(stats.addedOrModified).toBe(1);
    expect(stats.unchanged).toBe(0);

    // Verify symbols
    const sym = store.getSymbol('calculateMetrics');
    expect(sym).not.toBeNull();
    expect(sym?.name).toBe('calculateMetrics');
    expect(sym?.file).toBe('a.ts');

    // Verify contracts
    const contracts = store.getContracts('a.ts');
    expect(contracts.length).toBeGreaterThanOrEqual(1);
    expect(contracts[0].statement).toContain('Negative input');

    // Warm sync with identical mtime & size
    const warmStats = await store.sync(fileList, new AdapterRegistry(), new ContractExtractor(tempDir));
    expect(warmStats.addedOrModified).toBe(0);
    expect(warmStats.unchanged).toBe(1);
  });

  it('tracks dependencies and builds graph directly from SQLite', async () => {
    const fileA = path.join(tempDir, 'service.ts');
    const fileB = path.join(tempDir, 'controller.ts');

    fs.writeFileSync(fileA, `export class AuthService { login() {} }`);
    fs.writeFileSync(fileB, `import { AuthService } from './service';\nexport function handleAuth() {}`);

    const statA = fs.statSync(fileA);
    const statB = fs.statSync(fileB);

    const fileList = [
      { relativePath: 'service.ts', fullPath: fileA, mtimeMs: statA.mtimeMs, size: statA.size },
      { relativePath: 'controller.ts', fullPath: fileB, mtimeMs: statB.mtimeMs, size: statB.size },
    ];

    await store.sync(fileList);
    const graph = store.getDependencyGraph();

    expect(graph.totalModules).toBe(2);
    expect(graph.totalDependencies).toBe(1);
    expect(graph.nodes['controller.ts'].imports[0].toFile).toBe('service.ts');
    expect(graph.nodes['service.ts'].importedBy).toContain('controller.ts');
  });

  it('removes deleted files and their associated records upon sync', async () => {
    const fileA = path.join(tempDir, 'temp.ts');
    fs.writeFileSync(fileA, `export function tempFn() {}`);
    const statA = fs.statSync(fileA);

    await store.sync([{ relativePath: 'temp.ts', fullPath: fileA, mtimeMs: statA.mtimeMs, size: statA.size }]);
    expect(store.getSymbol('tempFn')).not.toBeNull();

    // Now sync with empty list (file deleted)
    const stats = await store.sync([]);
    expect(stats.deleted).toBe(1);
    expect(store.getSymbol('tempFn')).toBeNull();
  });
});
