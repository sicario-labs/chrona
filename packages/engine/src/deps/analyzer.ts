import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { DependencyGraph, ImportEdge, ModuleNode, ImpactBoundary } from './types';

export interface BuildGraphOptions {
  cwd?: string;
  files?: string[];
  excludePatterns?: string[];
}

export class DependencyAnalyzer {
  private cwd: string;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
  }

  /**
   * Build complete dependency graph across the repository.
   */
  public async buildGraph(options: BuildGraphOptions = {}): Promise<DependencyGraph> {
    const root = options.cwd || this.cwd;
    const allFiles = options.files || (await this.discoverSourceFiles(root));

    const nodes: Record<string, ModuleNode> = {};
    const edges: ImportEdge[] = [];

    // 1. Initialize nodes
    for (const file of allFiles) {
      const rel = path.relative(root, file).replace(/\\/g, '/');
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

    // 2. Parse imports and exports from each file
    for (const file of allFiles) {
      const rel = path.relative(root, file).replace(/\\/g, '/');
      try {
        const content = await fs.readFile(file, 'utf-8');
        const extracted = this.extractImportsAndExports(content, rel);

        if (nodes[rel]) {
          nodes[rel].exports = extracted.exports;
          for (const imp of extracted.imports) {
            // Resolve relative specifier to relative file path in nodes
            const resolvedTarget = this.resolveImportTarget(imp.specifier, rel, Object.keys(nodes));
            if (resolvedTarget) {
              const edge: ImportEdge = {
                fromFile: rel,
                toFile: resolvedTarget,
                specifier: imp.specifier,
                importedSymbols: imp.importedSymbols,
                isDynamic: imp.isDynamic,
                isTypeOnly: imp.isTypeOnly,
              };
              edges.push(edge);
              nodes[rel].imports.push(edge);
              if (nodes[resolvedTarget]) {
                nodes[resolvedTarget].importedBy.push(rel);
              }
            }
          }
        }
      } catch {
        // Skip unreadable files
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
   * Compute the full impact boundary for changing or removing a module/symbol.
   */
  public computeImpactBoundary(targetPath: string, graph: DependencyGraph): ImpactBoundary {
    const normalizedTarget = targetPath.replace(/\\/g, '/');
    const directDependents = new Set<string>();
    const transitiveDependents = new Set<string>();
    const affectedTests = new Set<string>();
    const affectedApiEndpoints = new Set<string>();
    const affectedConfigs = new Set<string>();

    // Find node matching target (by exact path or partial match)
    const matchingKey = Object.keys(graph.nodes).find(
      (k) => k === normalizedTarget || k.endsWith(normalizedTarget) || k.includes(normalizedTarget)
    );

    if (matchingKey && graph.nodes[matchingKey]) {
      const startNode = graph.nodes[matchingKey];
      for (const dep of startNode.importedBy) {
        directDependents.add(dep);
      }

      // BFS for transitive closure
      const queue: string[] = Array.from(directDependents);
      const visited = new Set<string>(queue);

      while (queue.length > 0) {
        const current = queue.shift()!;
        transitiveDependents.add(current);

        const node = graph.nodes[current];
        if (node) {
          if (node.isTestFile) affectedTests.add(current);
          if (node.isApiEndpoint) affectedApiEndpoints.add(current);
          if (node.isConfig) affectedConfigs.add(current);

          for (const next of node.importedBy) {
            if (!visited.has(next)) {
              visited.add(next);
              queue.push(next);
            }
          }
        }
      }
    }

    const totalAffected = directDependents.size + transitiveDependents.size;
    const criticality: 'HIGH' | 'MEDIUM' | 'LOW' = totalAffected > 15 || affectedApiEndpoints.size > 2
      ? 'HIGH'
      : totalAffected > 5
      ? 'MEDIUM'
      : 'LOW';

    return {
      target: normalizedTarget,
      directDependents: Array.from(directDependents),
      transitiveDependents: Array.from(transitiveDependents),
      affectedTests: Array.from(affectedTests),
      affectedApiEndpoints: Array.from(affectedApiEndpoints),
      affectedConfigs: Array.from(affectedConfigs),
      confidence: matchingKey ? 0.98 : 0.4,
      criticality,
    };
  }

  private extractImportsAndExports(
    content: string,
    filePath: string
  ): { imports: Array<{ specifier: string; importedSymbols: string[]; isDynamic: boolean; isTypeOnly: boolean }>; exports: string[] } {
    const imports: Array<{ specifier: string; importedSymbols: string[]; isDynamic: boolean; isTypeOnly: boolean }> = [];
    const exports: string[] = [];

    // Static imports: import ... from '...'
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
        imports.push({
          specifier,
          importedSymbols: symbols,
          isDynamic,
          isTypeOnly,
        });
      }
    }

    // Require calls: require('...')
    const reqRegex = /require\(['"]([^'"]+)['"]\)/g;
    while ((match = reqRegex.exec(content)) !== null) {
      if (match[1]) {
        imports.push({
          specifier: match[1],
          importedSymbols: [],
          isDynamic: false,
          isTypeOnly: false,
        });
      }
    }

    // Exports: export function / const / class / default
    const exportRegex = /export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|class|const|let|var|type|interface|enum)\s+([A-Za-z0-9_$]+)/g;
    while ((match = exportRegex.exec(content)) !== null) {
      if (match[1]) exports.push(match[1]);
    }

    return { imports, exports };
  }

  private resolveImportTarget(specifier: string, fromFile: string, knownFiles: string[]): string | null {
    if (!specifier.startsWith('.')) {
      // Internal alias mapping (e.g. @/...)
      if (specifier.startsWith('@/')) {
        const withoutPrefix = 'src/' + specifier.slice(2);
        return this.matchKnownFile(withoutPrefix, knownFiles);
      }
      return null; // External package
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
      `${target}/index.ts`,
      `${target}/index.tsx`,
      `${target}/index.js`,
    ];

    for (const c of candidates) {
      if (knownFiles.includes(c)) return c;
    }
    return null;
  }

  private async discoverSourceFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!['node_modules', 'dist', '.git', '.turbo', '.chrona', 'test-repos', 'fresh-benchmark-repos', 'fixtures'].includes(entry.name)) {
            files.push(...(await this.discoverSourceFiles(full)));
          }
        } else if (/\.[jt]sx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
          files.push(full);
        }
      }
    } catch {
      // Directory read error
    }
    return files;
  }
}
