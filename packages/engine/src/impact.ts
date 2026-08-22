import fs from 'node:fs/promises';
import path from 'node:path';
import { x } from 'tinyexec';
import { TruthReferee } from './referee/truth-referee';
import { discoverEvidence } from './discover';
import type { AgentWorkOrder, WorkOrderAction } from './compiler-types';

export interface ImpactEngineOptions {
  cwd?: string;
  commit?: string;
  baseBranch?: string;
  sourceDir?: string;
  docsDir?: string;
}

/**
 * Compute change impact from Git diff and Truth Referee diagnostics,
 * generating a structured AgentWorkOrder.
 */
export async function computeChangeImpact(options: ImpactEngineOptions = {}): Promise<AgentWorkOrder> {
  const cwd = options.cwd || process.cwd();
  const commit = options.commit || options.baseBranch || 'HEAD';
  const docsDir = options.docsDir || path.join(cwd, 'content', 'docs');

  // 1. Get git diff & changed files
  let changeSummary = 'Working tree inspection';
  const changedFiles = new Set<string>();

  try {
    const logRes = await x('git', ['log', '-1', '--pretty=%B', commit], { nodeOptions: { cwd } });
    if (logRes.stdout.trim()) {
      changeSummary = logRes.stdout.trim().split('\n')[0];
    }
  } catch {
    // Ignore
  }

  try {
    // Diff against previous commit or working tree
    const diffRes = await x('git', ['diff', `${commit}~1..${commit}`, '--name-only'], { nodeOptions: { cwd } });
    if (diffRes.stdout.trim()) {
      diffRes.stdout.trim().split('\n').forEach((f) => changedFiles.add(f.trim().replace(/\\/g, '/')));
    } else {
      // Check uncommitted changes
      const statusRes = await x('git', ['status', '--porcelain'], { nodeOptions: { cwd } });
      statusRes.stdout.split('\n').forEach((line) => {
        const file = line.trim().slice(3).trim();
        if (file) changedFiles.add(file.replace(/\\/g, '/'));
      });
    }

    const fullDiff = await x('git', ['diff', `${commit}~1..${commit}`], { nodeOptions: { cwd } });
    void fullDiff;
  } catch {
    // Fallback: non-git repository
  }

  // 2. Discover evidence & Run Truth Referee
  const evidence = await discoverEvidence({ cwd, sourceDir: options.sourceDir });
  const referee = new TruthReferee({ cwd, docsDir });
  const report = await referee.runVerification();

  // 3. Find all MDX files in docsDir
  const mdxFiles = await findMdxFiles(docsDir);
  const affectedPages = new Set<string>();
  const affectedExamples = new Set<string>();
  const affectedTasks = new Set<string>();
  const affectedRecipes = new Set<string>();
  const requiredActions: WorkOrderAction[] = [];

  // Cross-reference referee diagnostics
  for (const diag of report.diagnostics) {
    const relFile = path.relative(cwd, path.resolve(cwd, diag.file)).replace(/\\/g, '/');
    affectedPages.add(relFile);
    if (diag.line) {
      affectedExamples.add(`${relFile}:${diag.line}`);
    }

    if (diag.code === 'DOC-103' || diag.code === 'DOC-102') {
      const match = diag.message.match(/`([^`]+)`/);
      const target = match ? match[1] : 'signature';
      requiredActions.push({
        type: 'update_claims',
        targets: [target],
        description: `Fix signature/parameter in ${relFile}: ${diag.message}`,
      });
    } else if (diag.code === 'DOC-401') {
      const match = diag.message.match(/`([^`]+)`/);
      const target = match ? match[1] : 'symbol';
      requiredActions.push({
        type: 'add_deprecation_notice',
        targets: [target],
        description: `Add deprecation notice for ${target} in ${relFile}`,
      });
    }
  }

  // Cross-reference changed source files with docs claims
  const changedSymbols: string[] = [];
  for (const exp of evidence.exports) {
    if (changedFiles.has(exp.file)) {
      changedSymbols.push(exp.name);
    }
  }

  for (const mdxFile of mdxFiles) {
    const relativeMdx = path.relative(cwd, mdxFile).replace(/\\/g, '/');
    try {
      const content = await fs.readFile(mdxFile, 'utf-8');
      for (const sym of changedSymbols) {
        if (new RegExp(`\\b${sym}\\b`).test(content)) {
          affectedPages.add(relativeMdx);
          // Find line number
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(sym)) {
              affectedExamples.add(`${relativeMdx}:${i + 1}`);
              break;
            }
          }
        }
      }

      // Check if file is a recipe
      if (content.includes('<Recipe') || relativeMdx.includes('recipe')) {
        for (const sym of changedSymbols) {
          if (content.includes(sym)) {
            affectedRecipes.add(path.basename(relativeMdx, '.mdx'));
          }
        }
      }
    } catch {
      // Ignore
    }
  }

  // Derive task names from affected pages
  for (const page of affectedPages) {
    const taskName = path
      .basename(page, path.extname(page))
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    affectedTasks.add(taskName);
  }

  if (requiredActions.length === 0 && changedSymbols.length > 0) {
    requiredActions.push({
      type: 'update_claims',
      targets: changedSymbols,
      description: `Review documentation claims for modified symbols: ${changedSymbols.join(', ')}`,
    });
  }

  requiredActions.push({
    type: 'recheck',
    description: 'Execute npx chrona check --json to verify 0 errors',
  });

  const totalPages = mdxFiles.length;
  const affectedPagesCount = affectedPages.size;
  const unaffectedPagesCount = Math.max(0, totalPages - affectedPagesCount);
  const totalClaims = evidence.exports.length + evidence.types.length;
  const affectedClaimsCount = report.errorsCount + report.warningsCount + (changedSymbols.length > 0 ? changedSymbols.length : 0);
  const unaffectedClaimsCount = Math.max(0, totalClaims - affectedClaimsCount);

  return {
    schemaVersion: 'v1',
    status: report.errorsCount > 0 || affectedPages.size > 0 ? 'needs_repair' : 'clean',
    commit,
    changeSummary,
    affectedTasks: Array.from(affectedTasks),
    affectedRecipes: Array.from(affectedRecipes),
    affectedPages: Array.from(affectedPages),
    affectedExamples: Array.from(affectedExamples),
    affectedClaimsCount,
    requiredActions,
    unaffected: {
      tasksCount: Math.max(0, 4 - affectedTasks.size),
      pagesCount: unaffectedPagesCount,
      claimsCount: unaffectedClaimsCount,
    },
  };
}

async function findMdxFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.git') {
          files.push(...(await findMdxFiles(full)));
        }
      } else if (/\.(mdx|md)$/.test(entry.name)) {
        files.push(full);
      }
    }
  } catch {
    // Directory doesn't exist
  }
  return files;
}
