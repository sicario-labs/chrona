import picocolors from 'picocolors';
import { ansiLink } from '../utils/terminal-ui';
import { loadLedger, projectId, saveLedger, type DeploymentRecord } from '../utils/deployments';
import {
  loadDeployConfig,
  edgeRollback,
  liveUrl,
} from '../utils/deploy-edge';

export interface RollbackOptions {
  cwd?: string;
  project?: string;
  bucket?: string;
}

export async function runChronaRollback(token: string, options: RollbackOptions = {}) {
  const cwd = options.cwd || process.cwd();
  const project = options.project || projectId(cwd);
  const bucket = options.bucket || 'chrona-builds';

  const ledger = await loadLedger();
  const records = ledger.projects[project] || [];
  const target = findDeployment(records, token);

  if (!target) {
    console.error(picocolors.red(`✗ No deployment found for token "${token}" in project ${project}.`));
    console.error(picocolors.dim('  Run `chrona ls` to list deployments.\n'));
    process.exitCode = 1;
    return;
  }

  console.log(picocolors.bold(picocolors.cyan('\nCHRONA ⚡ Rollback\n')));

  const config = loadDeployConfig();
  config.tenant = project;
  config.bucket = bucket;

  try {
    const res = await edgeRollback(config, target.id);
    if (!res.ok) {
      console.error(picocolors.bold(picocolors.red(`✗ Rollback failed (${res.status}): ${res.error ?? 'unknown'}`)));
      process.exitCode = 1;
      return;
    }
    console.log(picocolors.green('  ✓ Alias flipped to retained deploy (instant, no re-upload)'));
  } catch (err: unknown) {
    console.warn(picocolors.yellow('  ⚠ Remote alias flip failed (offline / local ledger mode)'));
    console.warn(picocolors.dim(`    ${err instanceof Error ? err.message : String(err)}\n`));
  }

  // 2. Mark the target deployment live locally, others superseded
  records.forEach((r) => {
    r.status = r.id === target.id ? 'live' : 'superseded';
  });
  ledger.projects[project] = records;
  await saveLedger(ledger);

  const url = liveUrl(project);
  console.log(picocolors.green('\n  ✓ Rolled back to ') + ansiLink(url, picocolors.bold(picocolors.cyan(url))));
  console.log(picocolors.dim(`    ${target.id} • commit ${target.commit}\n`));
}

export function findDeployment(
  records: DeploymentRecord[],
  token: string
): DeploymentRecord | undefined {
  return records.find((r) => r.id === token || (token && r.id.startsWith(token)));
}