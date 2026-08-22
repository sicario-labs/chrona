import path from 'node:path';
import picocolors from 'picocolors';
import { ChronaWorkspace } from '@chrona-engine/engine';

export interface ExplainCommandOptions {
  cwd?: string;
  docsDir?: string;
  json?: boolean;
}

/**
 * CLI command: chrona explain <symbol_or_question>
 */
export async function runChronaExplain(
  target: string,
  options: ExplainCommandOptions = {}
): Promise<void> {
  const cwd = path.resolve(options.cwd || process.cwd());
  const workspace = await ChronaWorkspace.fromDirectory(cwd, options.docsDir);

  // Extract clean symbol name if user passed a sentence or query
  const cleanTarget = target.replace(/[^a-zA-Z0-9_$]/g, ' ').trim().split(/\s+/)[0] || target;
  let explanation = workspace.explainSymbol(target) || workspace.explainSymbol(cleanTarget);

  if (!explanation) {
    // Search matching symbols in workspace
    for (const [name] of workspace.software.symbols.entries()) {
      if (name.toLowerCase() === target.toLowerCase() || name.toLowerCase().includes(cleanTarget.toLowerCase())) {
        explanation = workspace.explainSymbol(name);
        if (explanation) break;
      }
    }
  }

  if (!explanation) {
    console.log(picocolors.red(`\nNo symbol or verifiable evidence found for [${target}] in workspace AST.\n`));
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(explanation, null, 2));
    return;
  }

  console.log(picocolors.bold(picocolors.cyan(`\nWhy does ${explanation.symbol} look like this?\n`)));

  console.log(picocolors.bold('Current Implementation:'));
  console.log(`  ${picocolors.green((explanation.implementation.file || 'src/index.ts') + ':' + explanation.implementation.line)}`);
  console.log(`  ${picocolors.yellow(explanation.implementation.signature)}`);

  console.log(picocolors.bold('\nDocumentation References:'));
  console.log(`  Total References: ${explanation.documentation.totalReferences}`);
  for (const v of explanation.documentation.verified.slice(0, 10)) {
    console.log(`  ${picocolors.green('✓')} ${v.file}:${v.line}`);
  }
  if (explanation.documentation.verified.length > 10) {
    console.log(picocolors.dim(`  ... and ${explanation.documentation.verified.length - 10} more verified references`));
  }
  for (const c of explanation.documentation.contradictions) {
    console.log(`  ${picocolors.red('✗')} ${c.file}:${c.line} → [${c.code}] ${c.message}`);
  }

  console.log(picocolors.bold('\nEpistemic Verdict:'));
  const statusColor = explanation.verdict.status === 'VERIFIED'
    ? picocolors.green('VERIFIED')
    : explanation.verdict.status === 'CONTRADICTED'
    ? picocolors.red('CONTRADICTED')
    : picocolors.yellow('UNVERIFIED');

  console.log(`  [${statusColor}] ${explanation.verdict.explanation}`);

  console.log(picocolors.bold('\nEvidence Chain:'));
  for (const ev of explanation.evidenceChain) {
    console.log(`  • ${picocolors.dim(ev)}`);
  }
  console.log();
}
