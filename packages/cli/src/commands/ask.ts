import path from 'node:path';
import picocolors from 'picocolors';
import { AskEngine } from '@chrona-engine/engine';

export interface AskCommandOptions {
  cwd?: string;
  json?: boolean;
}

export async function runChronaAsk(question: string, options: AskCommandOptions = {}): Promise<void> {
  const cwd = path.resolve(options.cwd || process.cwd());
  const engine = new AskEngine(cwd);

  const answer = await engine.ask(question);

  if (options.json) {
    console.log(JSON.stringify(answer, null, 2));
    return;
  }

  console.log(picocolors.bold(picocolors.cyan(`\nQuestion: "${question}"\n`)));

  const verdictColor = answer.verdict === 'SAFE'
    ? picocolors.green(answer.verdictStatement)
    : answer.verdict === 'UNSAFE'
    ? picocolors.red(answer.verdictStatement)
    : picocolors.yellow(answer.verdictStatement);

  console.log(picocolors.bold(verdictColor));
  console.log(`Confidence: ${picocolors.bold((answer.confidence * 100).toFixed(1))}%\n`);

  if (answer.participatesIn.length > 0) {
    console.log(picocolors.bold('Participates in:'));
    for (const part of answer.participatesIn) {
      console.log(`  • ${picocolors.yellow(part)}`);
    }
    console.log();
  }

  console.log(picocolors.bold('Evidence:'));
  console.log(`  ${picocolors.green('✓')} ${answer.evidenceSummary.sourceReferences} source references`);
  console.log(`  ${picocolors.green('✓')} ${answer.evidenceSummary.runtimeObservations} runtime observations`);
  console.log(`  ${picocolors.green('✓')} ${answer.evidenceSummary.tests} tests`);
  console.log(`  ${picocolors.green('✓')} ${answer.evidenceSummary.deploymentConfigurations} deployment configurations`);
  console.log(`  ${picocolors.green('✓')} ${answer.evidenceSummary.historicalCommits} historical commits\n`);

  if (answer.consequencesIfRemoved.length > 0) {
    console.log(picocolors.bold('If removed:'));
    for (const cons of answer.consequencesIfRemoved) {
      const icon = cons.type === 'break' ? picocolors.red('✗') : picocolors.yellow('⚠');
      console.log(`  ${icon} ${cons.statement}`);
    }
    console.log();
  }

  if (answer.suggestedMigration) {
    console.log(picocolors.bold('Suggested migration:'));
    console.log(`  ${picocolors.cyan(answer.suggestedMigration)}\n`);
  }
}
