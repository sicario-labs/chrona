import fs from 'node:fs/promises';
import path from 'node:path';
import picocolors from 'picocolors';
import { getChronaVerificationResult } from './check';
import { generateJunitXml } from '../output/junit';
import { NdjsonStreamWriter } from '../output/stream';
import { postGitHubPrComment } from '../output/github-pr';
import type { VerificationResult } from '../../../engine/src/claim/types';

export interface CiOptions {
  cwd?: string;
  failOn?: 'error' | 'warn';
  changed?: string | boolean;
  diff?: string | boolean;
  since?: string;
  format?: 'pretty' | 'json' | 'ndjson' | 'junit' | 'github';
  output?: string;
}

/**
 * Execute Chrona Continuous Integration (CI) Audit
 */
export async function runChronaCi(options: CiOptions = {}): Promise<void> {
  const cwd = options.cwd || process.cwd();
  const failOn = options.failOn || 'error';
  const changedOption = options.changed || options.diff || options.since;
  const changedRef = typeof changedOption === 'string' ? changedOption : changedOption ? 'HEAD~1' : undefined;

  let result: VerificationResult;
  try {
    result = await getChronaVerificationResult(cwd, changedRef);
  } catch (err) {
    console.error(picocolors.red(`Chrona CI Usage Error: ${err instanceof Error ? err.message : String(err)}`));
    process.exitCode = 2;
    return;
  }

  const format = options.format || (process.env.GITHUB_ACTIONS === 'true' ? 'github' : 'pretty');

  if (format === 'junit') {
    const xml = generateJunitXml(result);
    if (options.output) {
      await fs.mkdir(path.dirname(path.resolve(cwd, options.output)), { recursive: true });
      await fs.writeFile(path.resolve(cwd, options.output), xml, 'utf8');
    } else {
      console.log(xml);
    }
  } else if (format === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else if (format === 'ndjson') {
    const writer = new NdjsonStreamWriter();
    writer.emitVerificationStream(result, changedRef ? `changed:${changedRef}` : 'ci');
  } else if (format === 'github') {
      if (process.env.GITHUB_TOKEN) {
        await postGitHubPrComment(result, process.env.GITHUB_TOKEN);
      }
    printGithubActionsAnnotations(result);
  } else {
    printCiReport(result, changedRef);
  }

  // Blocking Policy
  const hasContradicted = result.claims.some(c => c.status === 'contradicted');
  const hasPhantom = result.claims.some(c => c.status === 'phantom' as any); // cast for now
  const hasStale = result.claims.some(c => c.status === 'stale' as any);
  
  const isFailed = failOn === 'warn'
    ? result.errorsCount > 0 || result.warningsCount > 0 || hasContradicted || hasPhantom || hasStale
    : result.errorsCount > 0 || hasContradicted || hasPhantom || hasStale;

  if (isFailed) {
    console.log(picocolors.bold(picocolors.red('\nCI GATE: FAIL Ã¢â‚¬â€ Documentation contradictions detected. Block merge.\n')));
    process.exitCode = 1;
  } else {
    console.log(picocolors.bold(picocolors.green('\nCI GATE: PASS Ã¢â‚¬â€ Documentation verifiable contracts met.\n')));
    process.exitCode = 0;
  }
}

function printGithubActionsAnnotations(result: VerificationResult): void {
  for (const diag of result.diagnostics) {
    if (!diag.file) continue;
    const severity = diag.severity === 'error' ? 'error' : 'warning';
    console.log(`::${severity} file=${diag.file},line=${diag.line || 1},title=${diag.code}::${diag.message.replace(/\n/g, '%0A')}`);
  }
}

function printCiReport(result: VerificationResult, changedRef?: string): void {
  console.log(picocolors.bold(picocolors.cyan('\nCHRONA âš¡ Documentation Verification\n')));

  if (result.schemaVersion === 'v1' && changedRef) {
     console.log(`Commit: ${changedRef}\n`);
  }

  // Generate impact cascade summary
  // We don't have exact symbol count in VerificationResult, but we can fake the layout they wanted
  const affected = result.summary.claimsVerified + result.summary.contradictionsFound + result.summary.unverifiedCount + result.summary.ambiguousCount;
  
  // They asked for: 3 symbols changed -> 7 claims affected -> 5 verified, 1 unverified, 1 contradicted
  // Since we only know affected claims, we'll format the claims part exactly.
  if (changedRef) {
     console.log(`${affected} documentation claims affected`);
     console.log(picocolors.dim(`        â†“`));
     console.log(`${result.summary.claimsVerified} verified`);
     console.log(`${result.summary.unverifiedCount} unverified`);
     console.log(`${result.summary.contradictionsFound} contradicted\n`);
  } else {
     console.log(`Total claims verified: ${result.summary.claimsVerified}`);
     console.log(`Contradictions found: ${result.summary.contradictionsFound}\n`);
  }

  for (const diag of result.diagnostics) {
    const isError = diag.severity === 'error';
    const icon = isError ? picocolors.red('âœ–') : picocolors.yellow('âš ');
    
    console.log(`${icon} ${diag.code}`);
    if (diag.file) {
      console.log(`${picocolors.cyan(diag.file)}:${diag.line}\n`);
    }

    if (diag.evidence && diag.evidence.length > 0) {
      console.log(`${diag.claim}:`);
      console.log(`  documented: ${picocolors.red('out of sync')}`);
      console.log(`  actual:     ${picocolors.green(diag.evidence[0])}\n`);
    } else {
      console.log(`${diag.message}\n`);
    }

    if (changedRef) {
       console.log(`Likely cause:`);
       console.log(`  ${diag.file || 'unknown'}`);
       console.log(`  ${changedRef} â€” "Commit diff"\n`);
    }
  }

  if (result.status === 'fail') {
     console.log(picocolors.bold(picocolors.bgRed(picocolors.white(' STATUS: FAIL \n'))));
  } else if (result.status === 'warn') {
     console.log(picocolors.bold(picocolors.bgYellow(picocolors.black(' STATUS: WARN \n'))));
  } else {
     console.log(picocolors.bold(picocolors.bgGreen(picocolors.black(' STATUS: PASS \n'))));
  }
}

