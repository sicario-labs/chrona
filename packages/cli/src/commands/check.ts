import picocolors from 'picocolors';
import { DocumentationVerifier } from '../../../engine/src/verifier';
import { analyzeChangeImpact } from '../../../engine/src/impact/analyzer';
import type { VerificationResult, ClaimResult } from '../../../engine/src/claim/types';
import type { CompilerDiagnostic, CompilerVerificationReport } from '../../../engine/src/compiler-types';
import { LiveStatus, emitFailureSignal } from '../utils/terminal-ui';
import { NdjsonStreamWriter } from '../output/stream';

export interface CheckOptions {
  cwd?: string;
  diff?: string | boolean;
  since?: string;
  json?: boolean;
  stream?: boolean;
  format?: 'pretty' | 'json' | 'ndjson';
}

export async function getChronaVerificationResult(
  cwd: string,
  diffRef?: string
): Promise<VerificationResult> {
  if (diffRef) {
    const startTime = performance.now();
    const impact = await analyzeChangeImpact({ cwd, from: diffRef });
    const duration = performance.now() - startTime;

    const errorsCount = impact.diagnostics.filter((d) => d.severity === 'error').length;
    const warningsCount = impact.diagnostics.filter((d) => d.severity === 'warning').length;
    const infoCount = impact.diagnostics.filter((d) => d.severity === 'info').length;
    const contradictionsFound = impact.affectedClaims.filter((c) => c.status === 'contradicted').length;
    const claimsVerified = impact.affectedClaims.filter((c) => c.status === 'verified').length;
    const unverifiedCount = impact.affectedClaims.filter((c) => c.status === 'unverified').length;

    return {
      schemaVersion: 'v1',
      status: errorsCount > 0 ? 'fail' : warningsCount > 0 ? 'warn' : 'pass',
      errorsCount,
      warningsCount,
      infoCount,
      claims: impact.affectedClaims,
      diagnostics: impact.diagnostics,
      summary: {
        claimsVerified,
        contradictionsFound,
        unverifiedCount,
        ambiguousCount: 0,
        verificationTimeMs: Math.round(duration),
      },
    };
  }

  const verifier = new DocumentationVerifier({ cwd });
  return await verifier.verifyWorkspace();
}

export async function getChronaCheckReport(
  cwd: string,
  diffRef?: string
): Promise<CompilerVerificationReport> {
  const result = await getChronaVerificationResult(cwd, diffRef);
  const errorsCount = result.diagnostics.filter((d) => d.severity === 'error').length;
  const warningsCount = result.diagnostics.filter((d) => d.severity === 'warning').length;
  const infoCount = result.diagnostics.filter((d) => d.severity === 'info').length;

  return {
    schemaVersion: 'v1',
    status: result.status,
    errorsCount,
    warningsCount,
    infoCount,
    diagnostics: result.diagnostics,
  };
}

export async function runChronaCheck(options: CheckOptions = {}) {
  const cwd = options.cwd || process.cwd();
  const diffOption = options.diff || options.since;
  const diffRef = typeof diffOption === 'string' ? diffOption : diffOption ? 'HEAD~1' : undefined;

  if (options.format === 'ndjson' || options.stream) {
    const result = await getChronaVerificationResult(cwd, diffRef);
    const writer = new NdjsonStreamWriter();
    writer.emitVerificationStream(result, diffRef ? `diff:${diffRef}` : 'workspace');
    process.exitCode = result.status === 'fail' ? 1 : 0;
    return;
  }

  if (options.json || options.format === 'json') {
    const result = await getChronaVerificationResult(cwd, diffRef);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.status === 'fail' ? 1 : 0;
    return;
  }

  console.log(picocolors.bold(picocolors.cyan('\nCHRONA ⚡ The Typechecker for Documentation\n')));

  if (diffRef) {
    console.log(picocolors.dim(`Only typechecking claims affected by recent changes (${diffRef})...\n`));
  } else {
    const live = new LiveStatus();
    live.update(picocolors.dim('  Typechecking documentation against codebase AST...'));
    live.clear();
  }

  const result = await getChronaVerificationResult(cwd, diffRef);

  // Group claim results and diagnostics by file
  const filesMap = new Map<string, { claims: ClaimResult[]; diagnostics: CompilerDiagnostic[] }>();

  for (const claimResult of result.claims) {
    const file = claimResult.claim.source.file;
    if (!filesMap.has(file)) {
      filesMap.set(file, { claims: [], diagnostics: [] });
    }
    filesMap.get(file)!.claims.push(claimResult);
  }

  for (const diag of result.diagnostics) {
    const file = diag.file;
    if (!filesMap.has(file)) {
      filesMap.set(file, { claims: [], diagnostics: [] });
    }
    filesMap.get(file)!.diagnostics.push(diag);
  }

  if (filesMap.size === 0 && diffRef) {
    console.log(picocolors.green('  ✓ 0 documentation claims affected by recent code changes.\n'));
  }

  // Print file by file report
  for (const [file, data] of filesMap.entries()) {
    console.log(picocolors.bold(file));

    if (data.diagnostics.length === 0) {
      const verifiedCount = data.claims.filter((c) => c.status === 'verified').length;
      console.log(
        picocolors.green(`  ✓ Verified — ${verifiedCount} claim${verifiedCount === 1 ? '' : 's'}, 0 contradictions\n`)
      );
    } else {
      for (const diag of data.diagnostics) {
        const symbolBadge =
          diag.severity === 'error'
            ? picocolors.red(`✖ ${diag.code}`)
            : picocolors.yellow(`⚠ ${diag.code}`);
        const lineBadge = diag.line ? picocolors.dim(`L${diag.line}`) : '';

        console.log(`  ${symbolBadge}  ${lineBadge}  ${diag.message}`);
        console.log(picocolors.dim('    │'));
        if (diag.claim) {
          console.log(picocolors.dim('    ├─ Claim:'));
          console.log(picocolors.red(`    │  ${diag.claim.trim()}`));
          console.log(picocolors.dim('    │'));
        }
        if (diag.evidence && diag.evidence.length > 0) {
          console.log(picocolors.dim('    ├─ Evidence:'));
          for (const ev of diag.evidence) {
            console.log(picocolors.cyan(`    │  ${ev.trim()}`));
          }
          console.log(picocolors.dim('    │'));
        }
        if (diag.suggestedAction) {
          console.log(picocolors.dim('    └─ Suggested Action:'));
          console.log(picocolors.magenta(`       ${diag.suggestedAction}\n`));
        } else {
          console.log(picocolors.dim('    └──────────────────────────────────────────────\n'));
        }
      }
    }
  }

  const errorsCount = result.diagnostics.filter((d) => d.severity === 'error').length;
  const warningsCount = result.diagnostics.filter((d) => d.severity === 'warning').length;

  const errStr = errorsCount === 1 ? '1 error' : `${errorsCount} errors`;
  const warnStr = warningsCount === 1 ? '1 warning' : `${warningsCount} warnings`;
  const suppressedStr = result.summary.suppressedCount ? `, ${result.summary.suppressedCount} suppressed` : '';
  const formattedSummary = `Found ${errorsCount > 0 ? picocolors.red(errStr) : errStr}, ${warningsCount > 0 ? picocolors.yellow(warnStr) : warnStr} (${result.summary.claimsVerified} claims verified, ${result.summary.contradictionsFound} contradictions${suppressedStr} in ${result.summary.verificationTimeMs}ms)\n`;

  console.log(picocolors.bold(formattedSummary));

  if (result.status === 'fail') {
    emitFailureSignal();
    console.log(picocolors.bold(picocolors.red('STATUS: FAIL — Documentation errors detected. Fix before merging.\n')));
    process.exitCode = 1;
  } else if (result.status === 'warn') {
    console.log(picocolors.bold(picocolors.yellow('STATUS: WARN — Documentation is valid with non-blocking warnings.\n')));
  } else {
    console.log(picocolors.bold(picocolors.green('STATUS: PASS — Documentation is fully verified and synchronized.\n')));
  }
}
