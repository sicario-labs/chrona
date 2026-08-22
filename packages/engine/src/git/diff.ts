import fs from 'node:fs/promises';
import path from 'node:path';
import { x } from 'tinyexec';
import { FastAstExtractor, type ExtractedSymbol } from '../referee/oxc-extractor';

export interface GitChange {
  symbol: string;
  file: string;
  type: 'added' | 'modified' | 'removed';
  before?: string; // old signature or definition
  after?: string; // new signature or definition
  beforeParams?: string[];
  afterParams?: string[];
}

export interface ExtractGitChangesOptions {
  cwd?: string;
  from?: string; // e.g. 'HEAD~1', 'main', 'origin/main'
  to?: string; // e.g. 'HEAD', working tree if omitted
}

/**
 * Extract symbol-level changes between two Git commits or working tree
 */
export async function extractGitChanges(
  options: ExtractGitChangesOptions = {}
): Promise<GitChange[]> {
  const cwd = options.cwd || process.cwd();
  const fromRef = options.from || 'HEAD~1';
  const toRef = options.to;

  const astExtractor = new FastAstExtractor();

  let repoRoot = cwd;
  try {
    const topLevel = await x('git', ['rev-parse', '--show-toplevel'], { nodeOptions: { cwd } });
    if (topLevel.exitCode === 0 && topLevel.stdout.trim()) {
      repoRoot = topLevel.stdout.trim().replace(/\\/g, '/');
    }
  } catch {
    return [];
  }

  // 1. Get changed files list from git diff
  const changedFiles = new Set<string>();
  const isRange = Boolean(toRef);

  try {
    const diffArgs = isRange
      ? ['diff', `${fromRef}..${toRef}`, '--name-only']
      : ['diff', fromRef, '--name-only'];

    const diffRes = await x('git', diffArgs, { nodeOptions: { cwd: repoRoot } });
    if (diffRes.exitCode !== 0) {
      // Invalid ref or git error
      return [];
    }

    if (diffRes.stdout.trim()) {
      for (const line of diffRes.stdout.trim().split('\n')) {
        const file = line.trim().replace(/\\/g, '/');
        if (isSourceFile(file)) {
          changedFiles.add(file);
        }
      }
    }
  } catch {
    return [];
  }

  if (changedFiles.size === 0) {
    return [];
  }

  // 2. For each changed file, parse before and after AST in parallel
  const fileList = Array.from(changedFiles).slice(0, 50);

  const fileChanges = await Promise.all(
    fileList.map(async (relFile) => {
      const changes: GitChange[] = [];
      let beforeContent = '';
      let afterContent = '';

      try {
        const showBefore = await x('git', ['show', `${fromRef}:${relFile}`], {
          nodeOptions: { cwd: repoRoot },
        });
        if (showBefore.exitCode === 0) {
          beforeContent = showBefore.stdout;
        }
      } catch {
        beforeContent = '';
      }

      try {
        if (toRef) {
          const showAfter = await x('git', ['show', `${toRef}:${relFile}`], {
            nodeOptions: { cwd: repoRoot },
          });
          if (showAfter.exitCode === 0) {
            afterContent = showAfter.stdout;
          }
        } else {
          const absPath = path.resolve(repoRoot, relFile);
          afterContent = await fs.readFile(absPath, 'utf-8');
        }
      } catch {
        afterContent = '';
      }

      const beforeSymbols = new Map<string, ExtractedSymbol>();
      const afterSymbols = new Map<string, ExtractedSymbol>();

      if (beforeContent.trim()) {
        try {
          const extracted = astExtractor.extract(beforeContent, relFile);
          for (const s of extracted) beforeSymbols.set(s.name, s);
        } catch {
          // Syntax error in before version
        }
      }

      if (afterContent.trim()) {
        try {
          const extracted = astExtractor.extract(afterContent, relFile);
          for (const s of extracted) afterSymbols.set(s.name, s);
        } catch {
          // Syntax error in after version
        }
      }

      // Check added or modified
      for (const [name, symAfter] of afterSymbols.entries()) {
        const symBefore = beforeSymbols.get(name);
        if (!symBefore) {
          changes.push({
            symbol: name,
            file: relFile,
            type: 'added',
            after: `${symAfter.name}${symAfter.signature}`,
            afterParams: symAfter.parameters.map((p) => p.name),
          });
        } else {
          const sigChanged = symBefore.signature !== symAfter.signature;
          const returnChanged = symBefore.returnType !== symAfter.returnType;
          const paramsBefore = symBefore.parameters.map((p) => `${p.name}: ${p.type}`);
          const paramsAfter = symAfter.parameters.map((p) => `${p.name}: ${p.type}`);
          const paramsChanged = paramsBefore.join(', ') !== paramsAfter.join(', ');

          if (sigChanged || returnChanged || paramsChanged) {
            changes.push({
              symbol: name,
              file: relFile,
              type: 'modified',
              before: `${symBefore.name}${symBefore.signature}`,
              after: `${symAfter.name}${symAfter.signature}`,
              beforeParams: symBefore.parameters.map((p) => p.name),
              afterParams: symAfter.parameters.map((p) => p.name),
            });
          }
        }
      }

      // Check removed symbols
      for (const [name, symBefore] of beforeSymbols.entries()) {
        if (!afterSymbols.has(name)) {
          changes.push({
            symbol: name,
            file: relFile,
            type: 'removed',
            before: `${symBefore.name}${symBefore.signature}`,
            beforeParams: symBefore.parameters.map((p) => p.name),
          });
        }
      }

      return changes;
    })
  );

  return fileChanges.flat();
}

function isSourceFile(file: string): boolean {
  return (
    /\.(ts|tsx|js|jsx)$/.test(file) &&
    !file.endsWith('.d.ts') &&
    !file.includes('node_modules') &&
    !file.includes('dist') &&
    !file.includes('.turbo') &&
    !file.includes('fixtures')
  );
}
