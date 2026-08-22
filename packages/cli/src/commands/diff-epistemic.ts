import path from 'node:path';
import picocolors from 'picocolors';
import { EpistemicDiffer } from '@chrona-engine/engine';

export interface DiffCommandOptions {
  cwd?: string;
  json?: boolean;
}

export async function runChronaDiff(options: DiffCommandOptions = {}): Promise<void> {
  const cwd = path.resolve(options.cwd || process.cwd());
  const differ = new EpistemicDiffer(cwd);

  const diff = await differ.computeDiff();

  if (options.json) {
    console.log(JSON.stringify(diff, null, 2));
    return;
  }

  console.log(picocolors.bold(picocolors.cyan('\nChrona Epistemic Diff: Changes in Software Understanding\n')));

  console.log(`Soundness change:    ${picocolors.bold(picocolors.green(diff.summary.soundnessChangePercent))}`);
  console.log(`New knowledge:       ${picocolors.green(`+${diff.summary.newKnowledgeCount}`)}`);
  console.log(`Lost/drifted:        ${picocolors.red(`-${diff.summary.lostKnowledgeCount}`)}\n`);

  if (diff.contracts.established.length > 0) {
    console.log(picocolors.bold('New Behavioral Contracts Established:'));
    for (const ec of diff.contracts.established) {
      console.log(`  ${picocolors.green('+')} ${ec}`);
    }
    console.log();
  }

  if (diff.contracts.broken.length > 0) {
    console.log(picocolors.bold('Broken Contracts:'));
    for (const bc of diff.contracts.broken) {
      console.log(`  ${picocolors.red('-')} ${bc}`);
    }
    console.log();
  }

  if (diff.deltas.length > 0) {
    console.log(picocolors.bold('Epistemic Deltas:'));
    for (const d of diff.deltas.slice(0, 10)) {
      const color = d.change === 'NEW' ? picocolors.green : d.change === 'LOST' ? picocolors.red : picocolors.yellow;
      console.log(`  ${color(`[${d.change}]`)} [${d.kind}] ${d.description}`);
    }
    if (diff.deltas.length > 10) {
      console.log(picocolors.dim(`  ... and ${diff.deltas.length - 10} more deltas`));
    }
    console.log();
  }
}
