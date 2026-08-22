import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { RealityStore } from '../src/sqlite/reality-store';
import { AdapterRegistry } from '../src/adapters/registry';
import { ContractExtractor } from '../src/contracts/extractor';
import { ExternalRealityResolver, type ExternalPackageReality } from '../src/registry/resolver';
import { RegistryClient } from '../src/registry/client';
import { PackageRealityDiffer } from '../src/upgrade/differ';
import { UpgradeCallSiteScanner } from '../src/upgrade/scanner';
import { ChronaUpgradeEngine } from '../src/upgrade/engine';

describe('Chrona Upgrade Engine & Package Reality Differ', () => {
  let tempDir: string;
  let store: RealityStore;

  const mockZod400: ExternalPackageReality = {
    packageName: 'zod',
    version: '4.0.0',
    commit: 'a1b2c3d',
    api: [
      {
        name: 'string',
        signature: '(): ZodString',
        file: 'src/types.ts',
        line: 10,
        parameters: [],
        returnType: 'ZodString',
      },
      {
        name: 'oldFunction',
        signature: '(input: string): boolean',
        file: 'src/deprecated.ts',
        line: 5,
        parameters: [{ name: 'input', type: 'string', optional: false }],
        returnType: 'boolean',
      },
      {
        name: 'number',
        signature: '(): ZodNumber',
        file: 'src/types.ts',
        line: 20,
        parameters: [],
        returnType: 'ZodNumber',
      },
    ],
    contracts: [
      {
        id: 'contract:guard:zod_string:L15',
        type: 'invariant',
        statement: 'String schemas must reject undefined inputs without default',
        subject: 'src/types.ts',
        status: 'active',
        confidence: 0.98,
        origin: 'code-assertion',
        evidence: [],
        dependents: [],
      },
    ],
    claims: [],
    evidence: [],
    integrity: {
      algorithm: 'sha256',
      digest: 'd3ae59719ee77efd212e4a01507b5b3fa09455067030d9be1bc51a79b7beeba3',
      verified: true,
    },
    provenance: {
      source: 'chrona-registry',
      publishedAt: '2026-08-01T00:00:00Z',
      chronaVersion: '0.2.0',
      parserVersion: '1.0.0',
    },
  };

  const mockZod410: ExternalPackageReality = {
    packageName: 'zod',
    version: '4.1.0',
    commit: 'e4f5g6h',
    api: [
      {
        name: 'string',
        signature: '(options: StringOptions): ZodString',
        file: 'src/types.ts',
        line: 12,
        parameters: [{ name: 'options', type: 'StringOptions', optional: false }],
        returnType: 'ZodString',
      },
      {
        name: 'iso',
        signature: '(): ZodIsoString',
        file: 'src/iso.ts',
        line: 8,
        parameters: [],
        returnType: 'ZodIsoString',
      },
      {
        name: 'number',
        signature: '(): ZodNumber',
        file: 'src/types.ts',
        line: 22,
        parameters: [],
        returnType: 'ZodNumber',
      },
    ],
    contracts: [
      {
        id: 'contract:guard:zod_string:L15',
        type: 'invariant',
        statement: 'String schemas must reject undefined inputs without default and enforce strict ISO bounds',
        subject: 'src/types.ts',
        status: 'active',
        confidence: 0.98,
        origin: 'code-assertion',
        evidence: [],
        dependents: [],
      },
    ],
    claims: [],
    evidence: [],
    integrity: {
      algorithm: 'sha256',
      digest: '68217c2973381064b2e57078de166825c39f4ad7545d78b0ba6b1dc49f72c479',
      verified: true,
    },
    provenance: {
      source: 'chrona-registry',
      publishedAt: '2026-08-15T00:00:00Z',
      chronaVersion: '0.2.0',
      parserVersion: '1.0.0',
    },
  };

  beforeEach(() => {
    tempDir = path.join(process.cwd(), '.chrona-upgrade-test-' + Math.random().toString(36).slice(2, 8));
    fs.mkdirSync(tempDir, { recursive: true });
    store = new RealityStore(tempDir);
  });

  afterEach(() => {
    try {
      store.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('computes accurate PackageRealityDiff between two verified package versions', () => {
    const diff = PackageRealityDiffer.diff(mockZod400, mockZod410);

    expect(diff.packageName).toBe('zod');
    expect(diff.fromVersion).toBe('4.0.0');
    expect(diff.toVersion).toBe('4.1.0');

    // Added symbols
    expect(diff.addedSymbols.length).toBe(1);
    expect(diff.addedSymbols[0].name).toBe('iso');

    // Removed symbols
    expect(diff.removedSymbols.length).toBe(1);
    expect(diff.removedSymbols[0].name).toBe('oldFunction');

    // Mutated symbols
    expect(diff.mutatedSymbols.length).toBe(1);
    expect(diff.mutatedSymbols[0].name).toBe('string');
    expect(diff.mutatedSymbols[0].isBreaking).toBe(true);

    // Contract changes
    expect(diff.mutatedContracts.length).toBe(1);
    expect(diff.mutatedContracts[0].status).toBe('modified');

    expect(diff.breakingChangesCount).toBe(2);
    expect(diff.riskLevel).toBe('MEDIUM');
  });

  it('scans local repository AST to locate affected callsites and generates UpgradeWorkOrder', async () => {
    // Setup local repository files importing zod
    const authFile = path.join(tempDir, 'auth.ts');
    const userFile = path.join(tempDir, 'user.ts');

    fs.writeFileSync(
      authFile,
      `import { oldFunction, string } from 'zod';

export function validateAuth(token: string) {
  const isOld = oldFunction(token);
  return isOld;
}`
    );

    fs.writeFileSync(
      userFile,
      `import { string, number } from 'zod';

export function parseUser() {
  const schema = string();
  return schema;
}`
    );

    const statAuth = fs.statSync(authFile);
    const statUser = fs.statSync(userFile);

    await store.sync(
      [
        { relativePath: 'auth.ts', fullPath: authFile, mtimeMs: statAuth.mtimeMs, size: statAuth.size },
        { relativePath: 'user.ts', fullPath: userFile, mtimeMs: statUser.mtimeMs, size: statUser.size },
      ],
      new AdapterRegistry(),
      new ContractExtractor(tempDir)
    );

    const diff = PackageRealityDiffer.diff(mockZod400, mockZod410);
    const { affectedLocalFiles, callSites } = await UpgradeCallSiteScanner.scan(tempDir, store, diff);

    expect(affectedLocalFiles).toContain('auth.ts');
    expect(affectedLocalFiles).toContain('user.ts');

    const removedCallSites = callSites.filter((cs) => cs.impactType === 'REMOVED_SYMBOL');
    const mutatedCallSites = callSites.filter((cs) => cs.impactType === 'SIGNATURE_CHANGED');

    expect(removedCallSites.length).toBeGreaterThan(0);
    expect(removedCallSites.some((cs) => cs.file === 'auth.ts' && cs.symbol === 'oldFunction')).toBe(true);
    expect(mutatedCallSites.some((cs) => cs.file === 'user.ts' && cs.symbol === 'string')).toBe(true);

    // Mock resolver
    const resolver = {
      resolve: async (pkg: string, ver: string) => {
        if (ver === '4.0.0') return mockZod400;
        if (ver === '4.1.0') return mockZod410;
        return null;
      },
    } as unknown as ExternalRealityResolver;

    const engine = new ChronaUpgradeEngine(tempDir, store, resolver);
    const workOrder = await engine.planUpgrade({
      packageName: 'zod',
      fromVersion: '4.0.0',
      toVersion: '4.1.0',
    });

    expect(workOrder.id).toBeDefined();
    expect(workOrder.migrationSteps.length).toBeGreaterThan(0);
    expect(workOrder.callSites.length).toBeGreaterThan(0);

    const scorecard = engine.formatScorecard(workOrder);
    expect(scorecard).toContain('Dependency Reality Diff');
    expect(scorecard).toContain('zod@4.0.0 → zod@4.1.0');
    expect(scorecard).toContain('+ iso');
    expect(scorecard).toContain('- oldFunction [REMOVED]');
    expect(scorecard).toContain('Agent Migration Work Order');
  });
});
