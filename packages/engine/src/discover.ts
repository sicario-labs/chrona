import fs from 'node:fs/promises';
import path from 'node:path';
import { FastAstExtractor, type ExtractedSymbol } from './referee/oxc-extractor';
import type { EvidenceGraph } from './compiler-types';
import { x } from 'tinyexec';

export interface DiscoverOptions {
  cwd?: string;
  sourceDir?: string;
}

/**
 * Scan a repository and extract public exports, types, test suites, and CLI commands.
 */
export async function discoverEvidence(options: DiscoverOptions = {}): Promise<EvidenceGraph> {
  const cwd = options.cwd || process.cwd();
  const repoName = path.basename(cwd);
  const extractor = new FastAstExtractor();

  // 1. Get current Git commit hash if possible
  let sourceCommit = 'HEAD';
  try {
    const gitRes = await x('git', ['rev-parse', '--short', 'HEAD'], { nodeOptions: { cwd } });
    if (gitRes.stdout.trim()) {
      sourceCommit = gitRes.stdout.trim();
    }
  } catch {
    // Non-git environment fallback
  }

  // 2. Locate source directory or scan source files
  const sourceFiles = await findSourceFiles(cwd, options.sourceDir);
  const exports: EvidenceGraph['exports'] = [];
  const types: EvidenceGraph['types'] = [];
  const allSymbols: ExtractedSymbol[] = [];

  for (const file of sourceFiles) {
    try {
      const content = await fs.readFile(file, 'utf-8');
      const relative = path.relative(cwd, file).replace(/\\/g, '/');
      const extracted = extractor.extract(content, relative);

      for (const sym of extracted) {
        sym.file = relative;
        allSymbols.push(sym);

        if (sym.kind === 'interface' || sym.kind === 'type') {
          types.push({
            name: sym.name,
            definition: sym.definition || sym.signature,
            file: relative,
          });
        } else {
          exports.push({
            name: sym.name,
            signature: sym.signature,
            file: relative,
            line: sym.line,
            isDeprecated: sym.isDeprecated,
          });
        }
      }
    } catch {
      // Ignore unparseable or unreadable files
    }
  }

  // 3. Discover test files
  const testFiles = await findTestFiles(cwd);
  const tests: EvidenceGraph['tests'] = [];
  const exportedNames = new Set(exports.map((e) => e.name));

  for (const testFile of testFiles) {
    const relative = path.relative(cwd, testFile).replace(/\\/g, '/');
    let targetSymbol: string | undefined;

    try {
      const testContent = await fs.readFile(testFile, 'utf-8');
      for (const name of exportedNames) {
        if (new RegExp(`\\b${name}\\b`).test(testContent)) {
          targetSymbol = name;
          break;
        }
      }
    } catch {
      // Ignore
    }

    tests.push({
      name: path.basename(testFile),
      file: relative,
      targetSymbol,
    });
  }

  // 4. Discover CLI commands
  const cliCommands: EvidenceGraph['cliCommands'] = [];
  try {
    const pkgPath = path.join(cwd, 'package.json');
    const pkgContent = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
    if (pkgContent.bin) {
      if (typeof pkgContent.bin === 'string') {
        cliCommands.push({
          command: pkgContent.name || 'cli',
          description: pkgContent.description || 'Command line interface',
          options: ['--help', '--version'],
        });
      } else if (typeof pkgContent.bin === 'object') {
        for (const [cmd, binFile] of Object.entries(pkgContent.bin)) {
          cliCommands.push({
            command: cmd,
            description: `Command line interface for ${cmd} (${binFile})`,
            options: ['--help', '--version'],
          });
        }
      }
    }
  } catch {
    // Ignore
  }

  return {
    schemaVersion: 'v1',
    repository: repoName,
    sourceCommit,
    exports,
    types,
    tests,
    cliCommands,
    generatedAt: new Date().toISOString(),
  };
}

async function findSourceFiles(cwd: string, explicitSourceDir?: string): Promise<string[]> {
  const targetDir = explicitSourceDir
    ? path.resolve(cwd, explicitSourceDir)
    : (await dirExists(path.join(cwd, 'src')))
      ? path.join(cwd, 'src')
      : cwd;

  const files: string[] = [];

  async function walk(dir: string, depth = 0) {
    if (depth > 6) return;
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (
          entry.name === 'node_modules' ||
          entry.name === 'dist' ||
          entry.name === '.git' ||
          entry.name === 'test' ||
          entry.name === 'tests' ||
          entry.name === '__tests__' ||
          entry.name === 'coverage' ||
          entry.name === '.next' ||
          entry.name === '.chrona' ||
          entry.name === '.source'
        ) {
          continue;
        }

        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath, depth + 1);
        } else if (entry.isFile()) {
          if (
            /\.(ts|tsx|js|jsx|mts|mjs)$/.test(entry.name) &&
            !entry.name.endsWith('.d.ts') &&
            !/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(entry.name)
          ) {
            files.push(fullPath);
          }
        }
      }
    } catch {
      // Ignore
    }
  }

  await walk(targetDir);
  return files;
}

async function findTestFiles(cwd: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string, depth = 0) {
    if (depth > 6) return;
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (
          entry.name === 'node_modules' ||
          entry.name === 'dist' ||
          entry.name === '.git' ||
          entry.name === '.next' ||
          entry.name === '.chrona' ||
          entry.name === '.source'
        ) {
          continue;
        }

        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath, depth + 1);
        } else if (entry.isFile()) {
          if (
            /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(entry.name) ||
            ((dir.includes('test') || dir.includes('tests')) && /\.(ts|tsx|js|jsx)$/.test(entry.name))
          ) {
            files.push(fullPath);
          }
        }
      }
    } catch {
      // Ignore
    }
  }

  await walk(cwd);
  return files;
}

async function dirExists(dir: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dir);
    return stat.isDirectory();
  } catch {
    return false;
  }
}
