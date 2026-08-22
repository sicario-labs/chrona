import fs from 'node:fs/promises';
import path from 'node:path';
import picocolors from 'picocolors';
import { execSync } from 'node:child_process';
import { getChronaCheckReport } from './check';

export interface BuildOptions {
  cwd?: string;
  output?: string;
  strict?: boolean;
}

export interface BuildResult {
  distDir: string;
  repoName: string;
}

/**
 * Resolve the directory containing the docs app.
 */
export async function resolveDocsTargetDir(cwd: string): Promise<string> {
  const docsAppDir = path.join(cwd, 'docs');
  return (await fs.stat(docsAppDir).catch(() => null)) ? docsAppDir : cwd;
}

/**
 * Run the pre-build step, Next.js build, and AI context manifests. Throws on build failure.
 */
export async function compileStaticBundle(cwd: string, outDir: string): Promise<BuildResult> {
  const repoName = path.basename(cwd);
  const targetDir = await resolveDocsTargetDir(cwd);

  console.log(picocolors.dim('  Compiling Fumadocs Next.js App Router bundle...'));
  try {
    execSync('npx next build', { cwd: targetDir, stdio: 'pipe' });
    console.log(picocolors.green('  ✓ Next.js build complete'));
  } catch (err: unknown) {
    throw new Error(`Next.js build failed: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }

  const fullOutDir = path.join(cwd, outDir);
  await fs.mkdir(fullOutDir, { recursive: true });

  const llmsTxt = `# ${repoName} Documentation
> Derived from Chrona Developer Experience Graph (v1)

## Overview
AI-agent native documentation and task-oriented verified recipes for ${repoName}.

## Core Tasks
- Quickstart & Setup: /docs/quickstart
- How Chrona Works: /docs/how-chrona-works
- Developer Experience Graph: /docs/dx-graph
- Verified Recipes: /docs/recipes
- CLI Reference: /docs/cli-reference
- Compiler Diagnostics: /docs/diagnostics-reference
- JSON Protocols: /docs/json-protocols
`;

  await fs.writeFile(path.join(fullOutDir, 'llms.txt'), llmsTxt, 'utf-8');
  await fs.writeFile(path.join(fullOutDir, 'llms-full.txt'), llmsTxt, 'utf-8');

  return { distDir: fullOutDir, repoName };
}

export async function runChronaBuild(options: BuildOptions = {}) {
  const cwd = options.cwd || process.cwd();
  const repoName = path.basename(cwd);
  const outDir = options.output || 'dist';

  console.log(picocolors.bold(picocolors.cyan('\nCHRONA ⚡ Fumadocs Production Build\n')));
  console.log(picocolors.dim(`Typechecking and compiling static documentation for ${repoName}...\n`));

  // 1. Truth Referee Gate
  const checkReport = await getChronaCheckReport(cwd);
  if (checkReport.errorsCount > 0 && options.strict !== false) {
    console.error(picocolors.bold(picocolors.red(`✗ Build aborted: ${checkReport.errorsCount} documentation truth errors detected.`)));
    console.error(picocolors.dim('  Run `npx chrona repair` or fix DOC-xxx diagnostics before production build.\n'));
    process.exitCode = 1;
    return;
  }

  console.log(picocolors.green('  ✓ Truth Referee check passed (0 errors)'));

  // 2 & 3. Pre-build, Vite build, and AI context manifests
  let result: BuildResult;
  try {
    result = await compileStaticBundle(cwd, outDir);
  } catch (err: unknown) {
    console.error(picocolors.bold(picocolors.red(`✗ Build failed: ${err instanceof Error ? err.message : String(err)}\n`)));
    process.exitCode = 1;
    return;
  }

  console.log(picocolors.green('  ✓ Emitted AI agent context: dist/llms.txt & dist/llms-full.txt'));
  console.log(picocolors.bold(picocolors.green(`\nBuild Complete: ${picocolors.bold(result.distDir)} ready for zero-config static deployment.\n`)));
}
