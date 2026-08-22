import path from 'node:path';
import picocolors from 'picocolors';
import { Forgetter } from '@chrona-engine/engine';

export interface ForgetCommandOptions {
  cwd?: string;
  json?: boolean;
}

export async function runChronaForget(options: ForgetCommandOptions = {}): Promise<void> {
  const cwd = path.resolve(options.cwd || process.cwd());
  const forgetter = new Forgetter(cwd);

  const report = await forgetter.findOrphanedKnowledge();

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(picocolors.bold(picocolors.cyan('\nChrona Orphaned Knowledge Audit\n')));

  if (report.totalOrphanedCount === 0) {
    console.log(picocolors.green('✓ All software knowledge is 100% corroborated by live code, tests, and AST ground truth.\n'));
    return;
  }

  console.log(picocolors.bold(picocolors.yellow(`Found ${report.totalOrphanedCount} orphaned knowledge item(s):\n`)));

  if (report.orphanedClaims.length > 0) {
    console.log(picocolors.bold('Orphaned Documentation Claims:'));
    for (const c of report.orphanedClaims) {
      console.log(`  ${picocolors.red('✗')} ${c.sourceFile}: "${c.statement}"`);
      console.log(`     └─ ${picocolors.dim(c.lostEvidence)}`);
    }
    console.log();
  }

  if (report.staleContracts.length > 0) {
    console.log(picocolors.bold('Stale Behavioral Contracts:'));
    for (const sc of report.staleContracts) {
      console.log(`  ${picocolors.yellow('⚠')} [${sc.id}] ${sc.statement}`);
    }
    console.log();
  }

  if (report.staleDecisions.length > 0) {
    console.log(picocolors.bold('Challenged Architectural Decisions:'));
    for (const sd of report.staleDecisions) {
      console.log(`  ${picocolors.yellow('⚠')} [${sd.id}] ${sd.statement}`);
    }
    console.log();
  }

  console.log(picocolors.bold('Recommendation:'));
  console.log(`  ${picocolors.cyan(report.recommendation)}\n`);
}
