import path from 'node:path';
import picocolors from 'picocolors';
import { WhyEngine } from '@chrona-engine/engine';

export interface WhyCommandOptions {
  cwd?: string;
  change?: string;
  json?: boolean;
}

export async function runChronaWhy(target: string, options: WhyCommandOptions = {}): Promise<void> {
  const cwd = path.resolve(options.cwd || process.cwd());
  const engine = new WhyEngine(cwd);

  const result = await engine.explainWhy({
    cwd,
    target,
    changeIntent: options.change,
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // If this was a change/deletion safety query
  if (options.change || result.deletionSafety) {
    const safety = result.deletionSafety!;
    console.log(picocolors.bold(picocolors.cyan(`\nWhy Analysis: "${options.change || `Impact of ${target}`}"\n`)));

    if (!safety.safeToDelete) {
      console.log(picocolors.bold(picocolors.red('DO NOT DELETE / MODIFY WITHOUT PREPARATION')));
      console.log(picocolors.bold(`Confidence: ${(safety.confidence * 100).toFixed(1)}%\n`));

      console.log(picocolors.bold('This component is currently required by:'));
      for (const mod of result.dependents.modules) {
        console.log(`  ${picocolors.yellow(mod)}`);
      }
      if (result.dependents.modulesCount > result.dependents.modules.length) {
        console.log(picocolors.dim(`  ... and ${result.dependents.modulesCount - result.dependents.modules.length} more modules`));
      }
      console.log();

      if (safety.blockingContracts.length > 0) {
        console.log(picocolors.bold('Removing it would violate:'));
        for (const contract of safety.blockingContracts) {
          console.log(`  ${picocolors.red('✗')} ${contract.id}: "${picocolors.bold(contract.statement)}"`);
        }
        console.log();
      }

      console.log(picocolors.bold('Recommendation:'));
      console.log(`  ${picocolors.cyan(safety.recommendation)}\n`);
      return;
    }
  }

  // Standard Why explanation
  console.log(picocolors.bold(picocolors.cyan(`\nWhy does ${target} exist?\n`)));

  console.log(picocolors.bold('Created:'));
  console.log(`  commit ${picocolors.green(result.created.commit)}`);
  console.log(`  ${picocolors.dim(result.created.date)} by ${result.created.author}\n`);

  console.log(picocolors.bold('Reason:'));
  console.log(`  ${result.created.reason}\n`);

  console.log(picocolors.bold('Evidence:'));
  if (result.evidenceSummary.commitMessage) {
    console.log(`  ${picocolors.green('✓')} commit message`);
  }
  if (result.evidenceSummary.prReference) {
    console.log(`  ${picocolors.green('✓')} ${result.evidenceSummary.prReference}`);
  }
  console.log(`  ${picocolors.green('✓')} ${result.evidenceSummary.codeReferences} subsequent references`);
  console.log(`  ${picocolors.green('✓')} ${result.evidenceSummary.tests} tests`);
  console.log(`  ${picocolors.green('✓')} ${result.evidenceSummary.runtimeProbes} historical touchpoint(s)\n`);

  console.log(picocolors.bold('Current status:'));
  const statusColor = result.status === 'CRITICAL'
    ? picocolors.red(result.status)
    : result.status === 'ACTIVE'
    ? picocolors.green(result.status)
    : picocolors.yellow(result.status);
  console.log(`  ${statusColor}\n`);

  console.log(picocolors.bold('Dependents:'));
  console.log(`  ${result.dependents.modulesCount} modules`);
  console.log(`  ${result.dependents.servicesCount} services`);
  console.log(`  ${result.dependents.clientsCount} clients\n`);

  console.log(picocolors.bold('Last verified:'));
  console.log(`  ${picocolors.dim(result.lastVerifiedAt)}\n`);
}
