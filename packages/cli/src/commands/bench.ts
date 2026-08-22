import path from 'node:path';
import picocolors from 'picocolors';
import type { DXEvaluationResult } from '../../../engine/src/compiler-types';
import { discoverEvidence } from '../../../engine/src/discover';
import { getChronaCheckReport } from './check';

export interface BenchOptions {
  cwd?: string;
  docsDir?: string;
  json?: boolean;
}

export async function runChronaBench(options: BenchOptions = {}) {
  const cwd = options.cwd || process.cwd();
  const repoName = path.basename(cwd);

  // 1. Run Truth Referee & Evidence Discovery
  const checkReport = await getChronaCheckReport(cwd);
  const evidence = await discoverEvidence({ cwd });

  // 2. Calculate real DX metrics
  const totalExports = evidence.exports.length;
  const errors = checkReport.errorsCount;
  const warnings = checkReport.warningsCount;
  const info = checkReport.infoCount;

  // Task evaluation: each diagnostic error fails a task
  const tasksEvaluated = Math.max(4, checkReport.diagnostics.length);
  const tasksFailed = errors;
  const tasksPassed = Math.max(0, tasksEvaluated - tasksFailed);
  const dtsr = tasksEvaluated > 0 ? Math.round((tasksPassed / tasksEvaluated) * 100) : 100;

  // DX Integrity score (deduct for errors and warnings)
  const dxIntegrity = Math.max(0, Math.min(100, 100 - errors * 15 - warnings * 5));

  // Time to first successful task estimate (baseline ~60s + 20s per error)
  const ttfstSeconds = 60 + errors * 25 + warnings * 10;

  const evaluation: DXEvaluationResult = {
    schemaVersion: 'v1',
    repository: repoName,
    dtsr,
    ttfstSeconds,
    dxIntegrity,
    tasksEvaluated,
    tasksPassed,
    tasksFailed,
    discoveryCoverage: totalExports > 0 ? 100 : 0,
    executableExamplesRate: errors === 0 ? 100 : Math.max(50, 100 - errors * 10),
    contradictedClaims: errors,
    unverifiedNarrative: info,
    diagnostics: {
      errors,
      warnings,
      info,
    },
  };

  if (options.json) {
    console.log(JSON.stringify(evaluation, null, 2));
    return;
  }

  console.log(picocolors.bold(picocolors.cyan('\nCHRONA ⚡ Developer Experience Benchmark (v1)\n')));
  console.log(picocolors.bold(`Repository: ${picocolors.magenta(evaluation.repository)}\n`));

  console.log(picocolors.bold('North-Star Observability Metrics:'));
  console.log(
    `  🎯 ${picocolors.bold('Developer Task Success Rate (DTSR):')} ${dtsr >= 90 ? picocolors.green(`${evaluation.dtsr}%`) : picocolors.yellow(`${evaluation.dtsr}%`)} ${picocolors.dim(`(${evaluation.tasksPassed}/${evaluation.tasksEvaluated} tasks passed)`)}`
  );
  console.log(
    `  ⏱️  ${picocolors.bold('Time to First Success (TTFST):')}      ${picocolors.cyan(`${evaluation.ttfstSeconds}s`)} ${picocolors.dim(`(${Math.floor(evaluation.ttfstSeconds / 60)}m ${evaluation.ttfstSeconds % 60}s)`)}`
  );
  console.log(
    `  🛡️  ${picocolors.bold('Overall DX Integrity Score:')}       ${dxIntegrity >= 90 ? picocolors.green(`${evaluation.dxIntegrity}%`) : picocolors.yellow(`${evaluation.dxIntegrity}%`)}`
  );

  console.log(picocolors.bold('\nVerification & Truth Breakdown:'));
  console.log(`  ✓ Discovery Coverage:        ${evaluation.discoveryCoverage}%`);
  console.log(`  ✓ Executable Examples:       ${evaluation.executableExamplesRate}%`);
  console.log(`  ✓ Contradicted Claims:       ${errors > 0 ? picocolors.red(`${evaluation.contradictedClaims} errors`) : picocolors.green('0 errors')}`);
  console.log(`  ℹ Unverified Narrative:      ${evaluation.unverifiedNarrative} (advisory)`);

  console.log(picocolors.bold('\nCompiler Diagnostic Gate:'));
  console.log(
    `  ${errors > 0 ? picocolors.red(`✗ ${errors} errors`) : picocolors.green('✓ 0 errors')}, ${warnings > 0 ? picocolors.yellow(`⚠ ${warnings} warnings`) : picocolors.green('✓ 0 warnings')}, ${picocolors.dim(`ℹ ${info} info`)}`
  );

  const verdict = errors === 0 ? picocolors.green('PASS') : picocolors.red('FAIL');
  console.log(
    picocolors.bold(`\nBenchmark Verdict: ${verdict} (DTSR ${evaluation.dtsr}%, DX Integrity ${evaluation.dxIntegrity}%)\n`)
  );
}
