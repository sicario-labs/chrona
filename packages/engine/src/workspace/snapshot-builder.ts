import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { x } from 'tinyexec';
import { RealityStore } from '../sqlite/reality-store';
import { AdapterRegistry } from '../adapters/registry';
import { ContractExtractor } from '../contracts/extractor';
import { ContractStore } from '../contracts/store';
import { ClaimExtractor } from '../claim/extractor';
import type { ExtractedSymbol } from '../referee/oxc-extractor';
import type { Claim } from '../claim/types';
import type { BehavioralContract } from '../contracts/types';
import type {
  WorkspaceSnapshot,
  SnapshotConfigIndex,
  SnapshotTestIndex,
  SnapshotProvenanceIndex,
} from './snapshot-types';
import {
  CHRONA_ENGINE_VERSION,
  SNAPSHOT_SCHEMA_VERSION,
  OXC_PARSER_VERSION,
} from './snapshot-types';

export interface BuildSnapshotOptions {
  cwd?: string;
  docsDir?: string;
  forceFresh?: boolean;
}

export class SnapshotBuilder {
  private cwd: string;
  private memoryCache: Map<string, WorkspaceSnapshot> = new Map();
  private realityStore: RealityStore;
  private adapters: AdapterRegistry;
  private contractExtractor: ContractExtractor;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
    this.realityStore = new RealityStore(this.cwd);
    this.adapters = new AdapterRegistry();
    this.contractExtractor = new ContractExtractor(this.cwd);
  }

  /**
   * Compute deterministic snapshot ID from repository content fingerprints,
   * parser versions, schema versions, and git head.
   */
  public static computeSnapshotId(
    gitCommit: string,
    fileHashes: Record<string, string>
  ): string {
    const sortedEntries = Object.entries(fileHashes)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([f, h]) => `${f}:${h}`);

    return crypto
      .createHash('sha256')
      .update(
        [
          CHRONA_ENGINE_VERSION,
          SNAPSHOT_SCHEMA_VERSION,
          OXC_PARSER_VERSION,
          gitCommit,
          ...sortedEntries,
        ].join('\0')
      )
      .digest('hex')
      .slice(0, 16);
  }

  /**
   * Build or retrieve an immutable snapshot of the repository using persistent SQLite indexing.
   */
  public async buildSnapshot(options: BuildSnapshotOptions = {}): Promise<WorkspaceSnapshot> {
    const root = path.resolve(options.cwd || this.cwd);

    // 1. Resolve Git Commit & Project Name
    let projectName = path.basename(root);
    let commit = 'working-tree';
    try {
      const pkgRaw = await fs.readFile(path.join(root, 'package.json'), 'utf-8');
      const pkg = JSON.parse(pkgRaw);
      if (pkg.name) projectName = pkg.name;
    } catch {}

    try {
      const gitRev = await x('git', ['rev-parse', '--short', 'HEAD'], {
        nodeOptions: { cwd: root },
      });
      if (gitRev.stdout.trim()) commit = gitRev.stdout.trim();
    } catch {}

    // 2. Discover Source Files
    const sourceFiles = await this.discoverSourceFiles(root);
    const fileList: Array<{ relativePath: string; fullPath: string; mtimeMs: number; size: number }> = [];

    for (const full of sourceFiles) {
      try {
        const stat = await fs.stat(full);
        const rel = path.relative(root, full).replace(/\\/g, '/');
        fileList.push({
          relativePath: rel,
          fullPath: full,
          mtimeMs: stat.mtimeMs,
          size: stat.size,
        });
      } catch {}
    }

    // 3. Fast Incremental Sync into SQLite RealityStore
    await this.realityStore.sync(fileList, this.adapters, this.contractExtractor);

    // 4. Retrieve Indexes from SQLite in milliseconds
    const fileHashes = this.realityStore.getFileHashes();
    const snapshotId = `snap_${SnapshotBuilder.computeSnapshotId(commit, fileHashes)}`;

    // Check in-memory cache
    if (!options.forceFresh && this.memoryCache.has(snapshotId)) {
      return this.memoryCache.get(snapshotId)!;
    }

    const graph = this.realityStore.getDependencyGraph();
    const repoSnapshot = this.realityStore.getSnapshot();
    const symbols = repoSnapshot.symbols;
    const storedContracts = this.realityStore.getContracts();

    // Deduplicate contracts by statement/subject
    const contractStore = new ContractStore(root);
    contractStore.load();
    const explicitContracts = contractStore.listContracts();

    const contractMap = new Map<string, BehavioralContract>();
    for (const c of [...explicitContracts, ...storedContracts]) {
      const key = `${c.subject}:${c.statement}`;
      if (!contractMap.has(key)) {
        contractMap.set(key, c);
      }
    }
    const contracts = Array.from(contractMap.values());

    // 5. Documentation Claims (Incrementally Synced via SQLite)
    const docFiles = await this.findDocFiles(root, options.docsDir);
    const docList: Array<{ relativePath: string; fullPath: string; mtimeMs: number; size: number }> = [];
    for (const df of docFiles) {
      try {
        const stat = await fs.stat(df);
        const rel = path.relative(root, df).replace(/\\/g, '/');
        docList.push({
          relativePath: rel,
          fullPath: df,
          mtimeMs: stat.mtimeMs,
          size: stat.size,
        });
      } catch {}
    }
    await this.realityStore.syncDocs(docList);
    const claims: Claim[] = this.realityStore.getClaims();

    // 6. Config Index
    const configIndex = await this.buildConfigIndex(root, graph.nodes);

    // 7. Test Index
    const testIndex = this.buildTestIndex(graph);

    // 8. Provenance Index
    const provenanceIndex: SnapshotProvenanceIndex = {
      commitCountMap: {},
      creationMap: {},
    };

    const snapshot: WorkspaceSnapshot = {
      id: snapshotId,
      commit,
      timestamp: new Date().toISOString(),
      root,
      projectName,
      graph,
      symbols,
      claims,
      contracts,
      provenance: provenanceIndex,
      config: configIndex,
      tests: testIndex,
      fileHashes,
    };

    this.memoryCache.set(snapshotId, snapshot);
    return snapshot;
  }

  private async buildConfigIndex(
    root: string,
    nodes: Record<string, any>
  ): Promise<SnapshotConfigIndex> {
    let packageJson: Record<string, unknown> | undefined;
    try {
      const raw = await fs.readFile(path.join(root, 'package.json'), 'utf-8');
      packageJson = JSON.parse(raw);
    } catch {}

    const configFiles: string[] = [];
    const envVars: string[] = [];
    const dbTables: string[] = [];

    const configCandidates = [
      'package.json',
      'tsconfig.json',
      'docker-compose.yml',
      'docker-compose.yaml',
      'Dockerfile',
      'wrangler.toml',
      'fly.toml',
      'render.yaml',
      'prisma/schema.prisma',
      '.env',
      '.env.example',
    ];

    for (const c of configCandidates) {
      try {
        const full = path.join(root, c);
        await fs.access(full);
        configFiles.push(c);
      } catch {}
    }

    // Scan env vars from config files
    for (const cf of configFiles) {
      try {
        const content = await fs.readFile(path.join(root, cf), 'utf-8');
        const matches = content.matchAll(/(?:process\.env\.|ENV\s+|([A-Z0-9_]{3,})\s*=)([A-Z0-9_]+)/g);
        for (const m of matches) {
          const varName = m[2] || m[1];
          if (varName && !envVars.includes(varName)) envVars.push(varName);
        }
      } catch {}
    }

    return {
      packageJson,
      configFiles,
      envVars,
      dbTables,
    };
  }

  private buildTestIndex(graph: any): SnapshotTestIndex {
    const testFiles = graph.testFiles || [];
    const testToSubjectMap: Record<string, string[]> = {};
    const symbolToTestMap: Record<string, string[]> = {};

    for (const tf of testFiles) {
      const node = graph.nodes[tf];
      if (node) {
        testToSubjectMap[tf] = node.imports.map((i: any) => i.toFile);
        for (const imp of node.imports) {
          for (const sym of imp.importedSymbols) {
            if (!symbolToTestMap[sym]) symbolToTestMap[sym] = [];
            if (!symbolToTestMap[sym].includes(tf)) symbolToTestMap[sym].push(tf);
          }
        }
      }
    }

    return {
      testFiles,
      testToSubjectMap,
      symbolToTestMap,
    };
  }

  private async discoverSourceFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    const supportedExts = new Set(this.adapters.getSupportedExtensions());

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (
            !['node_modules', 'dist', '.git', '.turbo', '.chrona', 'test-repos', 'fresh-benchmark-repos', 'fixtures', '.next', '.cache', 'coverage'].includes(
              entry.name
            )
          ) {
            files.push(...(await this.discoverSourceFiles(full)));
          }
        } else {
          const ext = path.extname(entry.name).toLowerCase();
          if (supportedExts.has(ext) && !entry.name.endsWith('.d.ts')) {
            files.push(full);
          }
        }
      }
    } catch {}
    return files;
  }

  private async findDocFiles(dir: string, explicitDocsDir?: string): Promise<string[]> {
    const files: string[] = [];
    const targetDir = explicitDocsDir ? path.resolve(dir, explicitDocsDir) : path.join(dir, 'content', 'docs');
    
    const searchDirs = explicitDocsDir
      ? [targetDir]
      : [targetDir, path.join(dir, 'docs'), path.join(dir, 'documentation')];

    for (const d of searchDirs) {
      try {
        const entries = await fs.readdir(d, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(d, entry.name);
          if (entry.isDirectory()) {
            files.push(...(await this.findDocFiles(full)));
          } else if (/\.(mdx|md)$/i.test(entry.name)) {
            files.push(full);
          }
        }
      } catch {}
    }

    // Fallback: root readme
    try {
      const rootReadme = path.join(dir, 'README.md');
      await fs.access(rootReadme);
      files.push(rootReadme);
    } catch {}

    return files;
  }
}
