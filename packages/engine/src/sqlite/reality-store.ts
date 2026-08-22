import { DatabaseSync } from 'node:sqlite';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import type { ExtractedSymbol } from '../referee/oxc-extractor';
import type { BehavioralContract } from '../contracts/types';
import type { RepositorySnapshot, Claim } from '../claim/types';
import type { DependencyGraph, ImportEdge, ModuleNode } from '../deps/types';
import { AdapterRegistry } from '../adapters/registry';
import { ContractExtractor } from '../contracts/extractor';
import { ClaimExtractor } from '../claim/extractor';
import { CHRONA_ENGINE_VERSION, SNAPSHOT_SCHEMA_VERSION, OXC_PARSER_VERSION } from '../workspace/snapshot-types';

export interface FileRecord {
  path: string;
  mtime: number;
  hash: string;
  size: number;
  parsedAt: number;
}

export interface SyncStats {
  totalFiles: number;
  scannedFiles: number;
  addedOrModified: number;
  deleted: number;
  unchanged: number;
  durationMs: number;
}

export class RealityStore {
  private db: DatabaseSync;
  private dbPath: string;
  private rootDir: string;
  private isMemory: boolean;

  constructor(dbPathOrCwd: string = process.cwd(), memory = false) {
    this.rootDir = dbPathOrCwd;
    this.isMemory = memory;
    if (memory) {
      this.dbPath = ':memory:';
    } else {
      const chronaDir = path.join(dbPathOrCwd, '.chrona');
      if (!fs.existsSync(chronaDir)) {
        fs.mkdirSync(chronaDir, { recursive: true });
      }
      this.dbPath = path.join(chronaDir, 'reality.db');
    }

    this.db = new DatabaseSync(this.dbPath);
    this.initSchema();
  }

  private initSchema(): void {
    if (!this.isMemory) {
      this.db.exec('PRAGMA busy_timeout = 5000;');
      this.db.exec('PRAGMA journal_mode = WAL;');
      this.db.exec('PRAGMA synchronous = NORMAL;');
      this.db.exec('PRAGMA temp_store = MEMORY;');
    }

    this.db.exec('CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT);');
    const versionRow = this.db.prepare("SELECT value FROM metadata WHERE key = 'schema_version'").get() as unknown as { value: string } | undefined;
    if (!versionRow || versionRow.value !== '2') {
      this.db.exec(`
        DROP TABLE IF EXISTS files;
        DROP TABLE IF EXISTS symbols;
        DROP TABLE IF EXISTS edges;
        DROP TABLE IF EXISTS file_exports;
        DROP TABLE IF EXISTS contracts;
        DROP TABLE IF EXISTS claims;
      `);
      this.db.exec("INSERT OR REPLACE INTO metadata (key, value) VALUES ('schema_version', '2');");
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        path TEXT PRIMARY KEY,
        mtime REAL,
        hash TEXT,
        size INTEGER,
        parsed_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS symbols (
        name TEXT,
        file TEXT,
        line INTEGER,
        kind TEXT,
        signature TEXT,
        return_type TEXT,
        is_exported INTEGER,
        is_deprecated INTEGER,
        raw_json TEXT,
        PRIMARY KEY(name, file)
      );

      CREATE TABLE IF NOT EXISTS edges (
        from_file TEXT,
        to_file TEXT,
        specifier TEXT,
        imported_symbols TEXT,
        is_dynamic INTEGER,
        is_type_only INTEGER
      );

      CREATE TABLE IF NOT EXISTS file_exports (
        file TEXT,
        name TEXT,
        PRIMARY KEY(file, name)
      );

      CREATE TABLE IF NOT EXISTS contracts (
        id TEXT PRIMARY KEY,
        file TEXT,
        line INTEGER,
        symbol TEXT,
        type TEXT,
        statement TEXT,
        confidence REAL,
        raw_json TEXT
      );

      CREATE TABLE IF NOT EXISTS claims (
        id TEXT PRIMARY KEY,
        file TEXT,
        line INTEGER,
        type TEXT,
        subject TEXT,
        status TEXT,
        evidence TEXT,
        raw_json TEXT
      );

      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
      CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file);
      CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_file);
      CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_file);
      CREATE INDEX IF NOT EXISTS idx_exports_file ON file_exports(file);
      CREATE INDEX IF NOT EXISTS idx_contracts_file ON contracts(file);
      CREATE INDEX IF NOT EXISTS idx_contracts_symbol ON contracts(symbol);
      CREATE INDEX IF NOT EXISTS idx_claims_subject ON claims(subject);
      CREATE INDEX IF NOT EXISTS idx_claims_file ON claims(file);
    `);
  }

  /**
   * Fast incremental synchronization of files with SQLite index.
   * Only files with changed mtime or content hash are parsed.
   */
  public async sync(
    fileList: Array<{ relativePath: string; fullPath: string; mtimeMs: number; size: number }>,
    adapters: AdapterRegistry = new AdapterRegistry(),
    contractExtractor: ContractExtractor = new ContractExtractor()
  ): Promise<SyncStats> {
    const startTime = performance.now();
    let addedOrModified = 0;
    let unchanged = 0;
    let deleted = 0;

    // 1. Get existing file records from SQLite
    const existingFilesStmt = this.db.prepare('SELECT path, mtime, hash, size FROM files');
    const existingRows = existingFilesStmt.all() as unknown as Array<{ path: string; mtime: number; hash: string; size: number }>;
    const existingMap = new Map<string, { mtime: number; hash: string; size: number }>();
    for (const row of existingRows) {
      existingMap.set(row.path, row);
    }

    const currentFilesSet = new Set<string>();
    const allKnownPaths = fileList.map((f) => f.relativePath);

    // Prepared statements for transactions
    const insertFileStmt = this.db.prepare('INSERT OR REPLACE INTO files (path, mtime, hash, size, parsed_at) VALUES (?, ?, ?, ?, ?)');
    const deleteFileSymbolsStmt = this.db.prepare('DELETE FROM symbols WHERE file = ?');
    const insertSymbolStmt = this.db.prepare(
      'INSERT OR REPLACE INTO symbols (name, file, line, kind, signature, return_type, is_exported, is_deprecated, raw_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const deleteFileContractsStmt = this.db.prepare('DELETE FROM contracts WHERE file = ?');
    const insertContractStmt = this.db.prepare(
      'INSERT OR REPLACE INTO contracts (id, file, line, symbol, type, statement, confidence, raw_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const deleteFileEdgesStmt = this.db.prepare('DELETE FROM edges WHERE from_file = ?');
    const insertEdgeStmt = this.db.prepare(
      'INSERT INTO edges (from_file, to_file, specifier, imported_symbols, is_dynamic, is_type_only) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const deleteFileExportsStmt = this.db.prepare('DELETE FROM file_exports WHERE file = ?');
    const insertExportStmt = this.db.prepare('INSERT OR REPLACE INTO file_exports (file, name) VALUES (?, ?)');

    this.db.exec('BEGIN TRANSACTION;');

    try {
      for (const item of fileList) {
        currentFilesSet.add(item.relativePath);
        const existing = existingMap.get(item.relativePath);

        // Check if file is unchanged (mtime matches and size matches)
        if (existing && existing.mtime === item.mtimeMs && existing.size === item.size) {
          unchanged++;
          continue;
        }

        // File modified or added: read and extract
        let content: string;
        try {
          content = fs.readFileSync(item.fullPath, 'utf-8');
        } catch {
          continue;
        }

        const hash = crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);

        // If hash also matches, just update mtime and continue
        if (existing && existing.hash === hash) {
          insertFileStmt.run(item.relativePath, item.mtimeMs, hash, item.size, Date.now());
          unchanged++;
          continue;
        }

        addedOrModified++;

        // Clear existing symbols, edges, exports & contracts for this file
        deleteFileSymbolsStmt.run(item.relativePath);
        deleteFileContractsStmt.run(item.relativePath);
        deleteFileEdgesStmt.run(item.relativePath);
        deleteFileExportsStmt.run(item.relativePath);

        // Extract via pluggable language adapter
        const adapter = adapters.getAdapterForFile(item.fullPath);
        if (adapter) {
          try {
            const extracted = adapter.extractSymbols(content, item.relativePath);
            for (const sym of extracted) {
              sym.file = item.relativePath;
              insertSymbolStmt.run(
                sym.name,
                item.relativePath,
                sym.line ?? 1,
                sym.kind || 'function',
                sym.signature || '',
                sym.returnType || '',
                1,
                sym.isDeprecated ? 1 : 0,
                JSON.stringify(sym)
              );
            }
          } catch {
            // Parser error on specific file
          }

          // Extract imports and exports via adapter
          try {
            const depData = adapter.extractImportsExports(content, item.relativePath, allKnownPaths);
            for (const exp of depData.exports) {
              insertExportStmt.run(item.relativePath, exp);
            }
            for (const imp of depData.imports) {
              insertEdgeStmt.run(
                item.relativePath,
                imp.toFile,
                imp.specifier,
                JSON.stringify(imp.importedSymbols),
                imp.isDynamic ? 1 : 0,
                imp.isTypeOnly ? 1 : 0
              );
            }
          } catch {
            // Import parse error
          }

          // Extract behavioral contracts via adapter
          try {
            const contracts = adapter.extractContracts(content, item.relativePath);
            for (const contract of contracts) {
              insertContractStmt.run(
                contract.id,
                item.relativePath,
                1,
                contract.subject || item.relativePath,
                contract.type,
                contract.statement,
                contract.confidence,
                JSON.stringify(contract)
              );
            }
          } catch {
            // Contract extraction error
          }
        } else {
          // Fallback generic contract extraction
          try {
            const contracts = contractExtractor.extractFromCode(content, item.fullPath);
            for (const contract of contracts) {
              insertContractStmt.run(
                contract.id,
                item.relativePath,
                1,
                contract.subject || item.relativePath,
                contract.type,
                contract.statement,
                contract.confidence,
                JSON.stringify(contract)
              );
            }
          } catch {}
        }

        // Record file metadata
        insertFileStmt.run(item.relativePath, item.mtimeMs, hash, item.size, Date.now());
      }

      // 2. Handle deleted files
      const deleteFileStmt = this.db.prepare('DELETE FROM files WHERE path = ?');
      for (const [oldPath] of existingMap.entries()) {
        if (!currentFilesSet.has(oldPath)) {
          deleted++;
          deleteFileSymbolsStmt.run(oldPath);
          deleteFileContractsStmt.run(oldPath);
          deleteFileEdgesStmt.run(oldPath);
          deleteFileExportsStmt.run(oldPath);
          deleteFileStmt.run(oldPath);
        }
      }

      this.db.exec('COMMIT;');
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }

    const durationMs = Math.round(performance.now() - startTime);

    return {
      totalFiles: fileList.length,
      scannedFiles: fileList.length,
      addedOrModified,
      deleted,
      unchanged,
      durationMs,
    };
  }

  /**
   * Incremental synchronization of a subset of files (e.g., from file watcher events)
   * without deleting unmentioned files from the database.
   */
  public async syncIncremental(
    changedList: Array<{ relativePath: string; fullPath: string; mtimeMs?: number; size?: number }>,
    adapters: AdapterRegistry,
    contractExtractor: ContractExtractor
  ): Promise<SyncStats> {
    const startTime = performance.now();
    let addedOrModified = 0;
    let deleted = 0;
    let unchanged = 0;

    const allKnownPaths = Object.keys(this.getFileHashes());

    const insertFileStmt = this.db.prepare(
      'INSERT OR REPLACE INTO files (path, mtime, hash, size, parsed_at) VALUES (?, ?, ?, ?, ?)'
    );
    const deleteFileStmt = this.db.prepare('DELETE FROM files WHERE path = ?');
    const insertSymbolStmt = this.db.prepare(
      'INSERT INTO symbols (name, file, line, kind, signature, return_type, is_exported, is_deprecated, raw_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const deleteFileSymbolsStmt = this.db.prepare('DELETE FROM symbols WHERE file = ?');
    const insertEdgeStmt = this.db.prepare(
      'INSERT INTO edges (from_file, to_file, specifier, imported_symbols, is_dynamic, is_type_only) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const deleteFileEdgesStmt = this.db.prepare('DELETE FROM edges WHERE from_file = ?');
    const insertExportStmt = this.db.prepare('INSERT INTO file_exports (file, name) VALUES (?, ?)');
    const deleteFileExportsStmt = this.db.prepare('DELETE FROM file_exports WHERE file = ?');
    const insertContractStmt = this.db.prepare(
      'INSERT INTO contracts (id, file, line, symbol, type, statement, confidence, raw_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const deleteFileContractsStmt = this.db.prepare('DELETE FROM contracts WHERE file = ?');

    this.db.exec('BEGIN TRANSACTION;');

    try {
      for (const item of changedList) {
        if (!fs.existsSync(item.fullPath)) {
          // File was deleted
          deleted++;
          deleteFileSymbolsStmt.run(item.relativePath);
          deleteFileContractsStmt.run(item.relativePath);
          deleteFileEdgesStmt.run(item.relativePath);
          deleteFileExportsStmt.run(item.relativePath);
          deleteFileStmt.run(item.relativePath);
          continue;
        }

        let content: string;
        try {
          content = fs.readFileSync(item.fullPath, 'utf-8');
        } catch {
          continue;
        }

        const stat = fs.statSync(item.fullPath);
        const hash = crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);

        addedOrModified++;

        deleteFileSymbolsStmt.run(item.relativePath);
        deleteFileContractsStmt.run(item.relativePath);
        deleteFileEdgesStmt.run(item.relativePath);
        deleteFileExportsStmt.run(item.relativePath);

        const adapter = adapters.getAdapterForFile(item.fullPath);
        if (adapter) {
          try {
            const extracted = adapter.extractSymbols(content, item.relativePath);
            for (const sym of extracted) {
              sym.file = item.relativePath;
              insertSymbolStmt.run(
                sym.name,
                item.relativePath,
                sym.line ?? 1,
                sym.kind || 'function',
                sym.signature || '',
                sym.returnType || '',
                1,
                sym.isDeprecated ? 1 : 0,
                JSON.stringify(sym)
              );
            }
          } catch {}

          try {
            const depData = adapter.extractImportsExports(content, item.relativePath, allKnownPaths);
            for (const exp of depData.exports) {
              insertExportStmt.run(item.relativePath, exp);
            }
            for (const imp of depData.imports) {
              insertEdgeStmt.run(
                item.relativePath,
                imp.toFile,
                imp.specifier,
                JSON.stringify(imp.importedSymbols),
                imp.isDynamic ? 1 : 0,
                imp.isTypeOnly ? 1 : 0
              );
            }
          } catch {}

          try {
            const contracts = adapter.extractContracts(content, item.relativePath);
            for (const contract of contracts) {
              insertContractStmt.run(
                contract.id,
                item.relativePath,
                1,
                contract.subject || item.relativePath,
                contract.type,
                contract.statement,
                contract.confidence,
                JSON.stringify(contract)
              );
            }
          } catch {}
        } else {
          try {
            const contracts = contractExtractor.extractFromCode(content, item.fullPath);
            for (const contract of contracts) {
              insertContractStmt.run(
                contract.id,
                item.relativePath,
                1,
                contract.subject || item.relativePath,
                contract.type,
                contract.statement,
                contract.confidence,
                JSON.stringify(contract)
              );
            }
          } catch {}
        }

        insertFileStmt.run(item.relativePath, stat.mtimeMs, hash, stat.size, Date.now());
      }

      this.db.exec('COMMIT;');
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }

    const durationMs = Math.round(performance.now() - startTime);

    return {
      totalFiles: changedList.length,
      scannedFiles: changedList.length,
      addedOrModified,
      deleted,
      unchanged,
      durationMs,
    };
  }

  private extractImportsAndExports(
    content: string,
    fromFile: string,
    knownFiles: string[]
  ): { imports: Array<{ toFile: string; specifier: string; importedSymbols: string[]; isDynamic: boolean; isTypeOnly: boolean }>; exports: string[] } {
    const imports: Array<{ toFile: string; specifier: string; importedSymbols: string[]; isDynamic: boolean; isTypeOnly: boolean }> = [];
    const exports: string[] = [];
    let match: RegExpExecArray | null;

    const isPython = fromFile.endsWith('.py') || fromFile.endsWith('.pyi');

    if (isPython) {
      // Python imports: from .module import foo, bar OR import foo
      const pyFromRegex = /from\s+(\.?[\w.]+)\s+import\s+([\w*,\s()]+)/g;
      while ((match = pyFromRegex.exec(content)) !== null) {
        const specifier = match[1];
        const rawSymbols = match[2].replace(/[()]/g, '');
        const symbols = rawSymbols.split(',').map((s) => s.trim()).filter(Boolean);
        const resolved = this.resolvePythonImport(specifier, fromFile, knownFiles);
        imports.push({
          toFile: resolved || specifier,
          specifier,
          importedSymbols: symbols,
          isDynamic: false,
          isTypeOnly: false,
        });
      }

      const pyDirectImportRegex = /^import\s+([\w.,\s]+)/gm;
      while ((match = pyDirectImportRegex.exec(content)) !== null) {
        const modules = match[1].split(',').map((m) => m.trim().split(/\s+as\s+/)[0]).filter(Boolean);
        for (const mod of modules) {
          const resolved = this.resolvePythonImport(mod, fromFile, knownFiles);
          imports.push({
            toFile: resolved || mod,
            specifier: mod,
            importedSymbols: [mod],
            isDynamic: false,
            isTypeOnly: false,
          });
        }
      }

      // Python exports: def foo(...), class Bar(...)
      const pyDefRegex = /^(?:def|class)\s+([A-Za-z0-9_]+)/gm;
      while ((match = pyDefRegex.exec(content)) !== null) {
        if (match[1] && !match[1].startsWith('_')) exports.push(match[1]);
      }
    } else {
      // JS/TS Imports
      const importRegex = /(?:import\s+(?:type\s+)?(?:([\w*\s{},$]+)\s+from\s+)?['"]([^'"]+)['"])|(?:import\(['"]([^'"]+)['"]\))/g;
      let match: RegExpExecArray | null;

      while ((match = importRegex.exec(content)) !== null) {
        const rawSymbols = match[1] || '';
        const specifier = match[2] || match[3] || '';
        const isDynamic = Boolean(match[3]);
        const isTypeOnly = match[0].includes('import type');

        const symbols = rawSymbols
          .replace(/[{}]/g, '')
          .split(',')
          .map((s) => s.trim().split(/\s+as\s+/)[0])
          .filter(Boolean);

        if (specifier) {
          const resolved = this.resolveImportTarget(specifier, fromFile, knownFiles);
          imports.push({
            toFile: resolved || specifier,
            specifier,
            importedSymbols: symbols,
            isDynamic,
            isTypeOnly,
          });
        }
      }

      const exportRegex = /export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|class|const|let|var|type|interface|enum)\s+([A-Za-z0-9_$]+)/g;
      while ((match = exportRegex.exec(content)) !== null) {
        if (match[1]) exports.push(match[1]);
      }
    }

    return { imports, exports };
  }

  private resolvePythonImport(specifier: string, fromFile: string, knownFiles: string[]): string | null {
    const fromDir = path.posix.dirname(fromFile);
    if (specifier.startsWith('.')) {
      // Relative import: from .service import auth
      const clean = specifier.replace(/^\.+/, '');
      const candidate = clean ? path.posix.normalize(path.posix.join(fromDir, clean)) : fromDir;
      return this.matchKnownFile(candidate, knownFiles);
    }

    // Absolute module import: app.services.auth -> app/services/auth.py
    const asPath = specifier.replace(/\./g, '/');
    return this.matchKnownFile(asPath, knownFiles) || this.matchKnownFile(path.posix.join(fromDir, asPath), knownFiles);
  }

  private resolveImportTarget(specifier: string, fromFile: string, knownFiles: string[]): string | null {
    if (!specifier.startsWith('.')) {
      if (specifier.startsWith('@/')) {
        const withoutPrefix = 'src/' + specifier.slice(2);
        return this.matchKnownFile(withoutPrefix, knownFiles);
      }
      return null;
    }

    const fromDir = path.posix.dirname(fromFile);
    const resolved = path.posix.normalize(path.posix.join(fromDir, specifier));
    return this.matchKnownFile(resolved, knownFiles);
  }

  private matchKnownFile(target: string, knownFiles: string[]): string | null {
    const candidates = [
      target,
      `${target}.ts`,
      `${target}.tsx`,
      `${target}.js`,
      `${target}.jsx`,
      `${target}.py`,
      `${target}.pyi`,
      `${target}/__init__.py`,
      `${target}/index.ts`,
      `${target}/index.tsx`,
      `${target}/index.js`,
    ];

    for (const c of candidates) {
      if (knownFiles.includes(c)) return c;
    }
    return null;
  }

  /**
   * Fast load of RepositorySnapshot from indexed SQLite tables.
   */
  public getSnapshot(): RepositorySnapshot {
    const symbols = new Map<string, ExtractedSymbol>();
    const files = new Map<string, string>();

    const symbolsStmt = this.db.prepare('SELECT raw_json FROM symbols');
    const symbolRows = symbolsStmt.all() as unknown as Array<{ raw_json: string }>;
    for (const row of symbolRows) {
      try {
        const sym = JSON.parse(row.raw_json) as ExtractedSymbol;
        symbols.set(sym.name, sym);
      } catch {}
    }

    const filesStmt = this.db.prepare('SELECT path FROM files');
    const fileRows = filesStmt.all() as unknown as Array<{ path: string }>;
    for (const row of fileRows) {
      files.set(row.path, '');
    }

    return {
      files,
      symbols,
    };
  }

  /**
   * Fast load of complete DependencyGraph directly from SQLite index.
   */
  public getDependencyGraph(): DependencyGraph {
    const nodes: Record<string, ModuleNode> = {};
    const edges: ImportEdge[] = [];

    // Load files as nodes
    const filesStmt = this.db.prepare('SELECT path FROM files');
    const fileRows = filesStmt.all() as unknown as Array<{ path: string }>;

    for (const row of fileRows) {
      const rel = row.path;
      const isTest = /\.(test|spec)\.[jt]sx?$/.test(rel) || rel.includes('/test/') || rel.includes('/tests/');
      const isConfig = /config\.[jt]sx?$/.test(rel) || /rc\.[jt]sx?$/.test(rel) || rel.endsWith('.json');
      const isApi = rel.includes('api/') || rel.includes('routes/') || rel.includes('endpoints/');
      const isEntry = rel === 'src/index.ts' || rel === 'src/main.ts' || rel === 'src/index.js';

      nodes[rel] = {
        filePath: rel,
        imports: [],
        importedBy: [],
        exports: [],
        isTestFile: isTest,
        isConfig,
        isApiEndpoint: isApi,
        isEntrypoint: isEntry,
      };
    }

    // Load exports
    const exportsStmt = this.db.prepare('SELECT file, name FROM file_exports');
    const exportRows = exportsStmt.all() as unknown as Array<{ file: string; name: string }>;
    for (const row of exportRows) {
      if (nodes[row.file]) {
        nodes[row.file].exports.push(row.name);
      }
    }

    // Load edges
    const edgesStmt = this.db.prepare('SELECT from_file, to_file, specifier, imported_symbols, is_dynamic, is_type_only FROM edges');
    const edgeRows = edgesStmt.all() as unknown as Array<{
      from_file: string;
      to_file: string;
      specifier: string;
      imported_symbols: string;
      is_dynamic: number;
      is_type_only: number;
    }>;

    for (const row of edgeRows) {
      const importedSymbols = row.imported_symbols ? JSON.parse(row.imported_symbols) : [];
      const edge: ImportEdge = {
        fromFile: row.from_file,
        toFile: row.to_file,
        specifier: row.specifier,
        importedSymbols,
        isDynamic: Boolean(row.is_dynamic),
        isTypeOnly: Boolean(row.is_type_only),
      };
      edges.push(edge);

      if (nodes[row.from_file]) {
        nodes[row.from_file].imports.push(edge);
      }
      if (nodes[row.to_file]) {
        nodes[row.to_file].importedBy.push(row.from_file);
      }
    }

    const entrypoints = Object.values(nodes).filter((n) => n.isEntrypoint).map((n) => n.filePath);
    const testFiles = Object.values(nodes).filter((n) => n.isTestFile).map((n) => n.filePath);
    const apiEndpoints = Object.values(nodes).filter((n) => n.isApiEndpoint).map((n) => n.filePath);

    return {
      nodes,
      edges,
      totalModules: Object.keys(nodes).length,
      totalDependencies: edges.length,
      entrypoints,
      testFiles,
      apiEndpoints,
    };
  }

  /**
   * Fast load of all file content hashes.
   */
  public getFileHashes(): Record<string, string> {
    const hashes: Record<string, string> = {};
    const stmt = this.db.prepare('SELECT path, hash FROM files');
    const rows = stmt.all() as unknown as Array<{ path: string; hash: string }>;
    for (const r of rows) {
      hashes[r.path] = r.hash;
    }
    return hashes;
  }

  /**
   * Deterministically derive current Snapshot ID from indexed SQLite file hashes.
   */
  public deriveCurrentSnapshotId(overrideCommit?: string): string {
    let commit = overrideCommit || 'working-tree';
    if (!overrideCommit) {
      try {
        const gitRev = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
          cwd: this.rootDir,
          encoding: 'utf-8',
        });
        if (gitRev.stdout?.trim()) commit = gitRev.stdout.trim();
      } catch {}
    }

    const hashes = this.getFileHashes();
    const sortedEntries = Object.entries(hashes)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([f, h]) => `${f}:${h}`);

    return `snap_${crypto
      .createHash('sha256')
      .update(
        [
          CHRONA_ENGINE_VERSION,
          SNAPSHOT_SCHEMA_VERSION,
          OXC_PARSER_VERSION,
          commit,
          ...sortedEntries,
        ].join('\0')
      )
      .digest('hex')
      .slice(0, 16)}`;
  }

  /**
   * Retrieve all contracts across the workspace.
   */
  public getContracts(file?: string): BehavioralContract[] {
    if (file) {
      const stmt = this.db.prepare('SELECT raw_json FROM contracts WHERE file = ?');
      const rows = stmt.all(file) as unknown as Array<{ raw_json: string }>;
      return rows.map((r) => JSON.parse(r.raw_json) as BehavioralContract);
    }
    const stmt = this.db.prepare('SELECT raw_json FROM contracts');
    const rows = stmt.all() as unknown as Array<{ raw_json: string }>;
    return rows.map((r) => JSON.parse(r.raw_json) as BehavioralContract);
  }

  /**
   * Retrieve all symbols belonging to a specific file.
   */
  public getSymbolsForFile(file: string): ExtractedSymbol[] {
    const stmt = this.db.prepare('SELECT raw_json FROM symbols WHERE file = ?');
    const rows = stmt.all(file) as unknown as Array<{ raw_json: string }>;
    return rows.map((r) => JSON.parse(r.raw_json) as ExtractedSymbol);
  }

  /**
   * Retrieve a specific symbol by name.
   */
  public getSymbol(name: string): ExtractedSymbol | null {
    const stmt = this.db.prepare('SELECT raw_json FROM symbols WHERE name = ? LIMIT 1');
    const row = stmt.get(name) as unknown as { raw_json: string } | undefined;
    return row ? (JSON.parse(row.raw_json) as ExtractedSymbol) : null;
  }

  /**
   * Fast incremental synchronization of documentation files with SQLite index.
   */
  public async syncDocs(
    docList: Array<{ relativePath: string; fullPath: string; mtimeMs: number; size: number }>,
    claimExtractor: ClaimExtractor = new ClaimExtractor()
  ): Promise<void> {
    const existingFilesStmt = this.db.prepare("SELECT path, mtime, hash, size FROM files WHERE path LIKE '%.md' OR path LIKE '%.mdx'");
    const existingRows = existingFilesStmt.all() as unknown as Array<{ path: string; mtime: number; hash: string; size: number }>;
    const existingMap = new Map<string, { mtime: number; hash: string; size: number }>();
    for (const row of existingRows) {
      existingMap.set(row.path, row);
    }

    const insertFileStmt = this.db.prepare('INSERT OR REPLACE INTO files (path, mtime, hash, size, parsed_at) VALUES (?, ?, ?, ?, ?)');
    const deleteFileClaimsStmt = this.db.prepare('DELETE FROM claims WHERE file = ?');
    const insertClaimStmt = this.db.prepare(
      'INSERT OR REPLACE INTO claims (id, file, line, type, subject, status, evidence, raw_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );

    this.db.exec('BEGIN TRANSACTION;');
    try {
      for (const item of docList) {
        const existing = existingMap.get(item.relativePath);
        if (existing && existing.mtime === item.mtimeMs && existing.size === item.size) {
          continue;
        }

        let content: string;
        try {
          content = fs.readFileSync(item.fullPath, 'utf-8');
        } catch {
          continue;
        }

        const hash = crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
        if (existing && existing.hash === hash) {
          insertFileStmt.run(item.relativePath, item.mtimeMs, hash, item.size, Date.now());
          continue;
        }

        deleteFileClaimsStmt.run(item.relativePath);
        try {
          const claims = claimExtractor.extractClaims(content, item.relativePath);
          for (const claim of claims) {
            insertClaimStmt.run(
              claim.id,
              item.relativePath,
              claim.source?.line ?? 1,
              claim.type,
              claim.subject || item.relativePath,
              claim.status || 'unverified',
              JSON.stringify(claim.evidence || []),
              JSON.stringify(claim)
            );
          }
        } catch {}

        insertFileStmt.run(item.relativePath, item.mtimeMs, hash, item.size, Date.now());
      }
      this.db.exec('COMMIT;');
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  /**
   * Retrieve all claims across documentation.
   */
  public getClaims(): Claim[] {
    const stmt = this.db.prepare('SELECT raw_json FROM claims');
    const rows = stmt.all() as unknown as Array<{ raw_json: string }>;
    return rows.map((r) => JSON.parse(r.raw_json) as Claim);
  }

  public getSymbolCount(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM symbols');
    const row = stmt.get() as unknown as { count: number };
    return row.count;
  }

  public getFileCount(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM files');
    const row = stmt.get() as unknown as { count: number };
    return row.count;
  }

  public close(): void {
    this.db.close();
  }
}
