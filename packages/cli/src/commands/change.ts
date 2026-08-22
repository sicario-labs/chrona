import path from 'node:path';
import readline from 'node:readline';
import picocolors from 'picocolors';
import { ChangeModelBuilder, ChangeExecutor } from '@chrona-engine/engine';

export interface ChangeCommandOptions {
  cwd?: string;
  yes?: boolean;
  dryRun?: boolean;
  json?: boolean;
}

export async function runChronaChange(requestText: string, options: ChangeCommandOptions = {}): Promise<void> {
  const cwd = path.resolve(options.cwd || process.cwd());
  const builder = new ChangeModelBuilder(cwd);
  const executor = new ChangeExecutor(cwd);

  console.log(picocolors.bold(picocolors.cyan('\nAnalyzing requested change...\n')));

  const model = await builder.buildModel({ cwd, request: requestText });

  if (options.json) {
    if (options.dryRun) {
      console.log(JSON.stringify(model, null, 2));
      return;
    }
    const receipt = await executor.executeVerificationSweep({ cwd, model });
    console.log(JSON.stringify({ model, receipt }, null, 2));
    return;
  }

  // 1. Display Change Boundary Analysis
  console.log(picocolors.bold(picocolors.green('Change Boundary identified.\n')));

  console.log(picocolors.bold('Affected:'));
  console.log(`  ${picocolors.yellow(model.boundary.sourceModules.length)} source modules`);
  console.log(`  ${picocolors.yellow(model.boundary.apiEndpoints.length)} API endpoints`);
  console.log(`  ${picocolors.yellow(model.boundary.databaseTables.length)} database tables`);
  console.log(`  ${picocolors.yellow(model.boundary.tests.length)} tests`);
  console.log(`  ${picocolors.yellow(model.boundary.documentationPages.length)} documentation pages`);
  console.log(`  ${picocolors.yellow(model.boundary.environmentVariables.length)} environment variables`);
  console.log(`  ${picocolors.yellow(model.boundary.deploymentConfigs.length)} deployment configurations\n`);

  // 2. Historical Constraints
  if (model.historicalConstraints.length > 0) {
    console.log(picocolors.bold('Historical constraints:'));
    for (const c of model.historicalConstraints) {
      console.log(`  └─ ${picocolors.cyan(c.subject)} introduced in ${c.introducedDate} (${c.introducedCommit})`);
      console.log(`     └─ reason: ${picocolors.dim(c.reason)}`);
    }
    console.log();
  }

  // 3. Behavioral Contracts
  if (model.behavioralContracts.length > 0) {
    console.log(picocolors.bold('Behavioral contracts:'));
    for (const c of model.behavioralContracts) {
      console.log(`  ${picocolors.green('✓')} ${c.statement}`);
    }
    console.log();
  }

  // 4. Potential Breakage
  if (model.breakageRisks.length > 0) {
    console.log(picocolors.bold('Potential breakage:'));
    for (const r of model.breakageRisks) {
      const icon = r.level === 'HIGH' ? picocolors.red('⚠') : picocolors.yellow('⚠');
      console.log(`  ${icon} ${r.subject} (${r.description})`);
    }
    console.log();
  }

  // 5. Recommended Migration
  console.log(picocolors.bold('Recommended migration:'));
  for (const step of model.migrationSteps) {
    console.log(`  ${picocolors.cyan(`${step.order}.`)} ${picocolors.bold(step.title)}`);
    console.log(`     ${picocolors.dim(step.description)}`);
  }
  console.log();

  // 6. Evidence Summary
  console.log(picocolors.bold('Evidence:'));
  console.log(`  ${picocolors.green('✓')} ${model.evidenceSummary.codeReferences} code references`);
  console.log(`  ${picocolors.green('✓')} ${model.evidenceSummary.tests} tests`);
  console.log(`  ${picocolors.green('✓')} ${model.evidenceSummary.historicalCommits} historical commits`);
  console.log(`  ${picocolors.green('✓')} ${model.evidenceSummary.runtimeObservations} runtime observations\n`);

  if (options.dryRun) {
    console.log(picocolors.dim('(--dry-run active, stopping before verification sweep)\n'));
    return;
  }

  // 7. Proceed Prompt or Auto-confirm
  let proceed = options.yes;
  if (!proceed) {
    proceed = await promptConfirm('Proceed with a verified migration? [y/N] ');
  }

  if (!proceed) {
    console.log(picocolors.yellow('\nChange migration aborted by user.\n'));
    return;
  }

  console.log(picocolors.bold(picocolors.cyan('\nExecuting verified migration sweep & contract validation...\n')));

  const receipt = await executor.executeVerificationSweep({ cwd, model });

  console.log(picocolors.bold(picocolors.green('CHANGE VERIFIED\n')));

  console.log(`Files changed:       ${picocolors.bold(receipt.summary.filesChanged)}`);
  console.log(`Tests executed:      ${picocolors.bold(receipt.summary.testsExecuted)}`);
  console.log(`Behavioral probes:   ${picocolors.bold(receipt.summary.behavioralProbes)}`);
  console.log(`Documentation:       ${picocolors.bold(`${receipt.summary.documentationUpdated} pages updated`)}\n`);

  console.log(`Pre-change claims:   ${receipt.claims.preChange}`);
  console.log(`Invalidated:         ${receipt.claims.invalidated}`);
  console.log(`Re-verified:         ${receipt.claims.reVerified}`);
  console.log(`New contradictions:  ${receipt.claims.newContradictions}\n`);

  console.log(`Evidence coverage:   ${picocolors.green(`${(receipt.evidenceCoverage * 100).toFixed(1)}%`)}\n`);

  for (const p of receipt.contractsPreserved) {
    console.log(`  ${picocolors.green('✓')} ${p.statement}`);
  }
  for (const v of receipt.contractsViolated) {
    console.log(`  ${picocolors.red('✗')} ${v.statement} (${v.diagnostic})`);
  }
  console.log();

  console.log(picocolors.bold('Commit:'));
  console.log(`  ${picocolors.green(receipt.commit)}\n`);

  console.log(picocolors.bold('Verification receipt:'));
  console.log(`  ${picocolors.cyan(receipt.id)}`);
  console.log(picocolors.dim(`  Checksum: ${receipt.hash}`));
  console.log(picocolors.dim(`  Signature: ${receipt.signature.substring(0, 32)}...`));
  console.log();
}

function promptConfirm(promptText: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(promptText, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes');
    });
  });
}
