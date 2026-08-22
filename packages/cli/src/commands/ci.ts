import fs from 'node:fs/promises';
import path from 'node:path';
import picocolors from 'picocolors';
import { getChronaVerificationResult } from './check';
import { generateJunitXml } from '../output/junit';
import { NdjsonStreamWriter } from '../output/stream';
import type { VerificationResult } from '../../../engine/src/claim/types';

export interface CiOptions {
  cwd?: string;
  failOn?: 'error' | 'warn';
  diff?: string | boolean;
  since?: string;
  format?: 'pretty' | 'json' | 'ndjson' | 'junit' | 'github';
  output?: string;
}

/**
 * Execute Chrona Continuous Integration (CI) Audit
 *
 * Exit Codes (TypeScript compiler standard):
 *  0 — All checks passed cleanly
 *  1 — One or more compiler contradictions / errors found (gate failure)
 *  2 — Usage error or unreadable configuration
 *  130 — Interrupted (SIGINT)
 */
export async function runChronaCi(options: CiOptions = {}): Promise<void> {
  const cwd = options.cwd || process.cwd();
  const failOn = options.failOn || 'error';
  const diffOption = options.diff || options.since;
  const diffRef = typeof diffOption === 'string' ? diffOption : diffOption ? 'HEAD~1' : undefined;

  let result: VerificationResult;
  try {
    result = await getChronaVerificationResult(cwd, diffRef);
  } catch (err) {
    console.error(picocolors.red(`Chrona CI Usage Error: ${err instanceof Error ? err.message : String(err)}`));
    process.exitCode = 2;
    return;
  }

  // Handle format output
  const format = options.format || (process.env.GITHUB_ACTIONS === 'true' ? 'github' : 'pretty');

  if (format === 'junit') {
    const xml = generateJunitXml(result);
    if (options.output) {
      await fs.mkdir(path.dirname(path.resolve(cwd, options.output)), { recursive: true });
      await fs.writeFile(path.resolve(cwd, options.output), xml, 'utf-8');
      console.log(picocolors.green(`✓ JUnit XML report written to ${options.output}`));
    } else {
      console.log(xml);
    }
  } else if (format === 'json') {
    const jsonStr = JSON.stringify(result, null, 2);
    if (options.output) {
      await fs.mkdir(path.dirname(path.resolve(cwd, options.output)), { recursive: true });
      await fs.writeFile(path.resolve(cwd, options.output), jsonStr, 'utf-8');
    } else {
      console.log(jsonStr);
    }
  } else if (format === 'ndjson') {
    const writer = new NdjsonStreamWriter();
    writer.emitVerificationStream(result, diffRef ? `ci:diff:${diffRef}` : 'ci:workspace');
  } else {
    // Pretty or GitHub annotations
    printCiReport(result, diffRef);

    if (format === 'github' || process.env.GITHUB_ACTIONS === 'true') {
      emitGitHubAnnotations(result);
      await emitGitHubStepSummary(result);
    }
  }

  // Determine gate exit code
  const isFailed = failOn === 'warn'
    ? result.errorsCount > 0 || result.warningsCount > 0
    : result.errorsCount > 0;

  if (isFailed) {
    process.exitCode = 1;
  } else {
    process.exitCode = 0;
  }
}

function printCiReport(result: VerificationResult, diffRef?: string): void {
  console.log(picocolors.bold(picocolors.cyan('\nCHRONA ⚡ Documentation CI Gate v1\n')));

  if (diffRef) {
    console.log(picocolors.dim(`Scope: Incremental diff against ${diffRef}\n`));
  }

  for (const diag of result.diagnostics) {
    const symbolBadge =
      diag.severity === 'error'
        ? picocolors.red(`✖ ${diag.code}`)
        : picocolors.yellow(`⚠ ${diag.code}`);
    const lineBadge = diag.line ? picocolors.dim(`L${diag.line}`) : '';

    console.log(`  ${symbolBadge}  ${diag.file}:${lineBadge}  ${diag.message}`);
    if (diag.claim) {
      console.log(picocolors.dim('    ├─ Claim: ') + picocolors.red(diag.claim.trim()));
    }
    if (diag.evidence && diag.evidence.length > 0) {
      console.log(picocolors.dim('    ├─ Evidence: ') + picocolors.cyan(diag.evidence[0].trim()));
    }
    if (diag.suggestedAction) {
      console.log(picocolors.dim('    └─ Action: ') + picocolors.magenta(diag.suggestedAction));
    }
    console.log('');
  }

  const errStr = result.errorsCount === 1 ? '1 error' : `${result.errorsCount} errors`;
  const warnStr = result.warningsCount === 1 ? '1 warning' : `${result.warningsCount} warnings`;

  console.log(
    picocolors.bold(
      `CI Summary: ${result.errorsCount > 0 ? picocolors.red(errStr) : errStr}, ${result.warningsCount > 0 ? picocolors.yellow(warnStr) : warnStr} (${result.summary.claimsVerified} claims verified, ${result.summary.contradictionsFound} contradictions found in ${result.summary.verificationTimeMs}ms)\n`
    )
  );

  if (result.status === 'fail') {
    console.log(picocolors.bold(picocolors.red('CI GATE: FAIL — Documentation contradictions detected. Block merge.\n')));
  } else if (result.status === 'warn') {
    console.log(picocolors.bold(picocolors.yellow('CI GATE: WARN — Documentation is valid with non-blocking warnings.\n')));
  } else {
    console.log(picocolors.bold(picocolors.green('CI GATE: PASS — Documentation is fully verified.\n')));
  }
}

function emitGitHubAnnotations(result: VerificationResult): void {
  for (const diag of result.diagnostics) {
    const level = diag.severity === 'error' ? 'error' : 'warning';
    const line = diag.line ? `line=${diag.line},` : '';
    const file = `file=${diag.file},`;
    const title = `title=${diag.code}`;

    console.log(`::${level} ${file}${line}${title}::${diag.message}`);
  }
}

async function emitGitHubStepSummary(result: VerificationResult): Promise<void> {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryFile) return;

  const markdown = [
    '## ⚡ Chrona Documentation Compiler Report',
    '',
    `**Status:** ${result.status === 'pass' ? '✅ PASS' : result.status === 'warn' ? '⚠️ WARN' : '❌ FAIL'}`,
    '',
    '| Metric | Value |',
    '| --- | --- |',
    `| Claims Verified | ${result.summary.claimsVerified} |`,
    `| Contradictions Found | ${result.summary.contradictionsFound} |`,
    `| Errors | ${result.errorsCount} |`,
    `| Warnings | ${result.warningsCount} |`,
    `| Verification Time | ${result.summary.verificationTimeMs}ms |`,
    '',
  ].join('\n');

  try {
    await fs.appendFile(summaryFile, markdown, 'utf-8');
  } catch {
    // Ignore step summary write error
  }
}
