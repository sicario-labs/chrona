import picocolors from 'picocolors';
import { DocumentationVerifier } from '../../../engine/src/verifier';
import { analyzeChangeImpact } from '../../../engine/src/impact/analyzer';
import type { VerificationResult, ClaimResult } from '../../../engine/src/claim/types';
import type { CompilerDiagnostic, CompilerVerificationReport } from '../../../engine/src/compiler-types';
import { LiveStatus, emitFailureSignal } from '../utils/terminal-ui';
import { NdjsonStreamWriter } from '../output/stream';

export interface CheckOptions {
  cwd?: string;
  changed?: string | boolean;
  diff?: string | boolean;
  since?: string;
  json?: boolean;
  stream?: boolean;
  format?: 'pretty' | 'json' | 'ndjson';
}

export async function getChronaVerificationResult(
  cwd: string,
  changedRef?: string
): Promise<VerificationResult> {
  if (changedRef) {
    const startTime = performance.now();
    const impact = await analyzeChangeImpact({ cwd, from: changedRef });
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
        totalClaims: impact.affectedClaims.length,
        claimsVerified,
        contradictionsFound,
        unverifiedCount,
        ambiguousCount: 0,
        suppressedCount: 0,
        verificationTimeMs: Math.round(duration),
      },
      // Pass the raw impact data so we can print the tree!
      impact: impact as any
    };
  }

  const verifier = new DocumentationVerifier({ cwd, docsDir: 'content/docs' });
  return verifier.verifyWorkspace();
}

export async function getChronaCheckReport(
  cwd: string,
  changedRef?: string
): Promise<CompilerVerificationReport> {
  const result = await getChronaVerificationResult(cwd, changedRef);
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
  const changedOption = options.changed || options.diff || options.since;
  const changedRef = typeof changedOption === 'string' ? changedOption : changedOption ? 'HEAD~1' : undefined;

  if (options.format === 'ndjson' || options.stream) {
    const result = await getChronaVerificationResult(cwd, changedRef);
    const writer = new NdjsonStreamWriter();
    writer.emitVerificationStream(result, changedRef ? `changed:${changedRef}` : 'workspace');
    process.exitCode = result.status === 'fail' ? 1 : 0;
    return;
  }

  if (options.json || options.format === 'json') {
    const result = await getChronaVerificationResult(cwd, changedRef);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.status === 'fail' ? 1 : 0;
    return;
  }

  console.log(picocolors.bold(picocolors.cyan('\nCHRONA ⚡ The Typechecker for Documentation\n')));

  if (changedRef) {
    // Print custom change impact tree!
    const startTime = performance.now();
    const impact = await analyzeChangeImpact({ cwd, from: changedRef });
    const duration = performance.now() - startTime;

    console.log(picocolors.bold(`${impact.changedSymbols.length} source symbols changed.\n`));
    
    if (impact.changedSymbols.length > 0) {
      console.log(picocolors.dim('Documentation impact:\n'));
      
      for (const sym of impact.changedSymbols) {
        console.log(`  ${picocolors.cyan(`${sym.file}:${sym.symbol}`)}`);
        
        // Find claims affected by this symbol
        const affected = impact.affectedClaims.filter(c => c.subject === sym.symbol || c.claim.subject === sym.symbol || c.claim.source.text.includes(sym.symbol));
        const docs = Array.from(new Set(affected.map(c => c.claim.source.file)));
        
        if (docs.length === 0) {
          console.log(`    └── ${picocolors.dim('none')}`);
        } else {
          for (let i = 0; i < docs.length; i++) {
            const prefix = i === docs.length - 1 ? '└──' : '├──';
            console.log(`    ${prefix} ${docs[i]}`);
          }
        }
        console.log();
      }
    }

    const contradictionsFound = impact.affectedClaims.filter((c) => c.status === 'contradicted').length;
    const unverifiedCount = impact.affectedClaims.filter((c) => c.status === 'unverified').length;
    
    console.log(picocolors.dim('Verification:\n'));
    console.log(`  ${picocolors.green('✓')} ${impact.unaffected.pagesCount} unaffected documents skipped`);
    
    if (contradictionsFound > 0) {
      console.log(`  ${picocolors.red('✕')} ${contradictionsFound} affected claims contradicted`);
    } else {
       console.log(`  ${picocolors.green('✓')} 0 affected claims contradicted`);
    }

    if (unverifiedCount > 0) {
       console.log(`  ${picocolors.yellow('⚠')} ${unverifiedCount} affected claim unverified`);
    }
    
    console.log();

    if (contradictionsFound > 0 || impact.diagnostics.filter(d => d.severity === 'error').length > 0) {
      console.log(picocolors.red(`STATUS: FAIL\n`));
      process.exitCode = 1;
    } else {
      console.log(picocolors.green(`STATUS: PASS\n`));
      process.exitCode = 0;
    }
    
    return;
  }

  // Fallback to regular full check
  const live = new LiveStatus();
  const result = await getChronaVerificationResult(cwd);

  const filesMap = new Map<string, { claims: ClaimResult[]; diagnostics: CompilerDiagnostic[] }>();
  for (const c of result.claims) {
    if (!c.claim.source.file) continue;
    if (!filesMap.has(c.claim.source.file)) {
      filesMap.set(c.claim.source.file, { claims: [], diagnostics: [] });
    }
    filesMap.get(c.claim.source.file)!.claims.push(c);
  }
  for (const d of result.diagnostics) {
    if (!d.file) continue;
    if (!filesMap.has(d.file)) {
      filesMap.set(d.file, { claims: [], diagnostics: [] });
    }
    filesMap.get(d.file)!.diagnostics.push(d);
  }

  live.clear();

  for (const [file, data] of filesMap.entries()) {
    if (data.diagnostics.length > 0) {
      console.log(picocolors.cyan(file));
      for (const diag of data.diagnostics) {
        if (diag.severity === 'error') {
          console.log(`  ${picocolors.red('✖')} ${diag.code}  ${picocolors.dim(`L${diag.line}`)}  ${diag.message}`);
        } else {
          console.log(`  ${picocolors.yellow('⚠')} ${diag.code}  ${picocolors.dim(`L${diag.line}`)}  ${diag.message}`);
        }
        if (diag.evidence && diag.evidence.length > 0) {
          console.log(picocolors.dim(`    │`));
          console.log(picocolors.dim(`    ├─ Claim:`));
          console.log(`    ${picocolors.dim('│')}  ${diag.claim}`);
          console.log(picocolors.dim(`    │`));
          console.log(picocolors.dim(`    ├─ Evidence:`));
          console.log(`    ${picocolors.dim('│')}  ${diag.evidence[0]}`);
          console.log(picocolors.dim(`    │`));
          console.log(picocolors.dim(`    └─ Suggested Action:`));
          console.log(`       ${diag.suggestedAction}`);
        }
        console.log();
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
    process.exitCode = 1;
  } else if (result.status === 'warn') {
    console.log(picocolors.yellow('STATUS: WARN — Documentation is verified but has warnings.'));
    process.exitCode = 0;
  } else {
    console.log(picocolors.green('STATUS: PASS — Documentation is fully verified and synchronized.'));
    process.exitCode = 0;
  }
}
