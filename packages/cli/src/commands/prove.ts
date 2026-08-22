import path from 'node:path';
import picocolors from 'picocolors';
import { ClaimProver } from '@chrona-engine/engine';

export interface ProveCommandOptions {
  cwd?: string;
  json?: boolean;
}

export async function runChronaProve(claimText: string, options: ProveCommandOptions = {}): Promise<void> {
  const cwd = path.resolve(options.cwd || process.cwd());
  const prover = new ClaimProver(cwd);

  const result = await prover.proveClaim({ cwd, claim: claimText });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(picocolors.bold(picocolors.cyan(`\nChrona Claim Prover\n`)));
  console.log(picocolors.bold(`Claim: "${claimText}"\n`));

  const verdictColor = result.verdict === 'PROVEN'
    ? picocolors.green('PROVEN')
    : result.verdict === 'DISPROVEN'
    ? picocolors.red('DISPROVEN')
    : result.verdict === 'CONTRADICTORY'
    ? picocolors.red('CONTRADICTORY')
    : picocolors.yellow('INSUFFICIENT EVIDENCE');

  console.log(`Verdict:    [${verdictColor}]`);
  console.log(`Confidence: ${picocolors.bold((result.confidence * 100).toFixed(1))}%`);
  console.log(`Summary:    ${result.explanation}\n`);

  if (result.evidenceFor.length > 0) {
    console.log(picocolors.bold('Supporting Evidence:'));
    for (const ev of result.evidenceFor) {
      console.log(`  ${picocolors.green('✓')} [${ev.source}] ${ev.description || ev.file}`);
    }
    console.log();
  }

  if (result.evidenceAgainst.length > 0) {
    console.log(picocolors.bold('Counter Evidence:'));
    for (const ev of result.evidenceAgainst) {
      console.log(`  ${picocolors.red('✗')} [${ev.source}] ${ev.description || ev.file}`);
    }
    console.log();
  }

  if (result.contracts.length > 0) {
    console.log(picocolors.bold('Related Behavioral Contracts:'));
    for (const c of result.contracts) {
      const statusIcon = c.status === 'active' ? picocolors.green('✓') : picocolors.red('✗');
      console.log(`  ${statusIcon} [${c.id}] ${c.statement}`);
    }
    console.log();
  }

  if (result.suggestedAction) {
    console.log(picocolors.bold('Suggested Action:'));
    console.log(`  ${picocolors.cyan(result.suggestedAction)}\n`);
  }
}
