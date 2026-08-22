import path from 'node:path';
import picocolors from 'picocolors';
import { DecisionStore } from '@chrona-engine/engine';

export interface RememberCommandOptions {
  cwd?: string;
  rationale?: string;
  tags?: string;
  json?: boolean;
}

export async function runChronaRemember(decisionText: string, options: RememberCommandOptions = {}): Promise<void> {
  const cwd = path.resolve(options.cwd || process.cwd());
  const store = new DecisionStore(cwd);
  store.load();

  const tags = options.tags ? options.tags.split(',').map((t) => t.trim()) : [];
  const decision = store.recordDecision(decisionText, {
    rationale: options.rationale,
    tags,
    recordedBy: 'developer',
  });

  if (options.json) {
    console.log(JSON.stringify(decision, null, 2));
    return;
  }

  console.log(picocolors.bold(picocolors.green(`\nArchitectural Decision Recorded: [${decision.id}]\n`)));
  console.log(`Statement:   ${picocolors.bold(decision.statement)}`);
  console.log(`Rationale:   ${picocolors.dim(decision.rationale)}`);
  console.log(`Recorded:    ${picocolors.dim(decision.recordedAt)} by ${decision.recordedBy}`);
  console.log(`Status:      ${picocolors.green(decision.status.toUpperCase())}`);
  console.log(`Stored in:   ${picocolors.dim('.chrona/decisions.json')}\n`);
}
