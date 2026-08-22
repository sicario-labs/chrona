import fs from 'node:fs/promises';
import path from 'node:path';
import { x } from 'tinyexec';
import type { ClaimResult, Claim, RepositorySnapshot } from '../claim/types';
import type { CompilerDiagnostic } from '../compiler-types';
import { extractGitChanges, type GitChange } from '../git/diff';
import { DocumentationVerifier } from '../verifier';
import { DEFAULT_RULES, type Rule } from '../rules';

export interface ChangeImpactOptions {
  cwd?: string;
  docsDir?: string;
  sourceDir?: string;
  from?: string; // e.g. HEAD~1, main
  to?: string;
  changes?: GitChange[];
  rules?: Rule[];
}

export interface ChangeImpact {
  commit: string;
  summary: string;
  changedSymbols: GitChange[];
  affectedClaims: ClaimResult[];
  affectedFiles: string[];
  affectedTasks: string[];
  affectedRecipes: string[];
  diagnostics: CompilerDiagnostic[];
  unaffected: {
    tasksCount: number;
    pagesCount: number;
    claimsCount: number;
  };
}

/**
 * Change Impact Analyzer
 *
 * Maps Git symbol-level changes to documentation claims, identifying affected
 * pages, recipes, tasks, and evaluating diagnostics specifically on changed surfaces.
 */
export async function analyzeChangeImpact(
  options: ChangeImpactOptions = {}
): Promise<ChangeImpact> {
  const cwd = options.cwd || process.cwd();
  const fromRef = options.from || 'HEAD~1';
  const toRef = options.to;
  const docsDir = options.docsDir || path.join(cwd, 'content', 'docs');
  const rules = options.rules || DEFAULT_RULES;

  // 1. Get commit description / summary
  let commit = fromRef;
  let summary = 'Working tree inspection';

  try {
    const logRes = await x('git', ['log', '-1', '--pretty=%h %s', fromRef], { nodeOptions: { cwd } });
    if (logRes.stdout.trim()) {
      summary = logRes.stdout.trim();
      commit = summary.split(' ')[0];
    }
  } catch {
    // Non-git repository or detached
  }

  // 2. Extract or use provided git symbol changes
  const changedSymbols = options.changes || (await extractGitChanges({ cwd, from: fromRef, to: toRef }));
  const changedNames = new Set(changedSymbols.map((c) => c.symbol));

  // 3. Build snapshot and scan docs using DocumentationVerifier
  const verifier = new DocumentationVerifier({ cwd, docsDir, sourceDir: options.sourceDir, rules });
  const snapshot: RepositorySnapshot = await verifier.buildSnapshot();
  const allMdxFiles = await findMdxFiles(docsDir);

  const affectedFilesSet = new Set<string>();
  const affectedRecipesSet = new Set<string>();
  const affectedTasksSet = new Set<string>();
  const affectedClaimResults: ClaimResult[] = [];
  const diagnostics: CompilerDiagnostic[] = [];
  let totalClaimsCount = 0;

  for (const mdxFile of allMdxFiles) {
    const relPath = path.relative(cwd, mdxFile).replace(/\\/g, '/');
    let content = '';
    try {
      content = await fs.readFile(mdxFile, 'utf-8');
    } catch {
      continue;
    }

    const fileResult = verifier.verifyFile(relPath, content, snapshot);
    totalClaimsCount += fileResult.claims.length;

    // Filter claims in this file that correlate to changed symbols
    const fileAffectedClaims = fileResult.claims.filter((cr) =>
      isClaimAffected(cr.claim, changedNames)
    );

    if (fileAffectedClaims.length > 0) {
      affectedFilesSet.add(relPath);
      affectedClaimResults.push(...fileAffectedClaims);

      for (const cr of fileAffectedClaims) {
        if (cr.diagnostic) {
          diagnostics.push(cr.diagnostic);
        }
      }

      // Check if file is a recipe
      if (content.includes('<Recipe') || relPath.includes('recipe')) {
        affectedRecipesSet.add(path.basename(relPath, path.extname(relPath)));
      }

      // Derive task name
      const taskName = path
        .basename(relPath, path.extname(relPath))
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      affectedTasksSet.add(taskName);
    }
  }

  const totalPages = allMdxFiles.length;
  const affectedPagesCount = affectedFilesSet.size;
  const unaffectedPagesCount = Math.max(0, totalPages - affectedPagesCount);
  const unaffectedClaimsCount = Math.max(0, totalClaimsCount - affectedClaimResults.length);

  return {
    commit,
    summary,
    changedSymbols,
    affectedClaims: affectedClaimResults,
    affectedFiles: Array.from(affectedFilesSet),
    affectedTasks: Array.from(affectedTasksSet),
    affectedRecipes: Array.from(affectedRecipesSet),
    diagnostics,
    unaffected: {
      tasksCount: Math.max(0, 4 - affectedTasksSet.size),
      pagesCount: unaffectedPagesCount,
      claimsCount: unaffectedClaimsCount,
    },
  };
}

function isClaimAffected(claim: Claim, changedSymbols: Set<string>): boolean {
  if (changedSymbols.size === 0) return true; // When no diff specified, everything is inspected

  if (changedSymbols.has(claim.subject)) {
    return true;
  }

  // Check if subject is mentioned in claim text
  for (const sym of changedSymbols) {
    if (new RegExp(`\\b${sym}\\b`).test(claim.source.text)) {
      return true;
    }
  }

  // Check metadata (e.g. recipe uses)
  const uses = claim.metadata?.uses;
  if (Array.isArray(uses)) {
    for (const u of uses) {
      if (typeof u === 'string' && changedSymbols.has(u)) {
        return true;
      }
    }
  }

  return false;
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
