import picocolors from 'picocolors';
import { ansiLink } from '../utils/terminal-ui';
import { loadLedger, projectId, shortCommit, type DeploymentRecord } from '../utils/deployments';
import {
  loadDeployConfig,
  edgeList,
  edgeGetRoute,
  liveUrl,
  permalinkUrl,
} from '../utils/deploy-edge';

export interface LsOptions {
  cwd?: string;
  project?: string;
}

interface RemoteDeploy {
  deploy_id: string;
  status: string;
  commit: string | null;
  branch: string | null;
  created_at: number;
  promoted_at: number | null;
}

export async function runChronaLs(options: LsOptions = {}) {
  const cwd = options.cwd || process.cwd();
  const project = options.project || projectId(cwd);

  console.log(picocolors.bold(picocolors.cyan('\nCHRONA ⚡ Deployment History\n')));

  const config = loadDeployConfig();
  config.tenant = project;

  // Prefer real edge state; fall back to the local ledger offline.
  let remoteDeploys: RemoteDeploy[] | null = null;
  let prodId: string | null = null;

  try {
    const data = await edgeList(config);
    if (data) {
      remoteDeploys = data.deploys as unknown as RemoteDeploy[];
      prodId = await edgeGetRoute(config, 'prod');
    }
  } catch {
    remoteDeploys = null;
  }

  if (remoteDeploys !== null) {
    console.log(picocolors.dim(`  Project: ${picocolors.bold(project)} (${remoteDeploys.length} deployment${remoteDeploys.length === 1 ? '' : 's'})\n`));
    if (remoteDeploys.length === 0) {
      console.log(picocolors.dim('  No deployments yet. Run `chrona deploy` to publish.'));
      return;
    }
    for (const dep of remoteDeploys) {
      const isLive = dep.deploy_id === prodId;
      renderRemote(dep, isLive, project);
    }
    return;
  }

  // Offline fallback: local ledger
  const ledger = await loadLedger();
  const records = ledger.projects[project] || [];
  console.log(picocolors.dim(`  Project: ${picocolors.bold(project)} (${records.length} deployment${records.length === 1 ? '' : 's'} · offline ledger)\n`));
  if (records.length === 0) {
    console.log(picocolors.dim('  No deployments yet. Run `chrona deploy` to publish.'));
    return;
  }
  for (const record of records) {
    renderRecord(record);
  }
}

function renderRemote(
  dep: RemoteDeploy,
  isLive: boolean,
  project: string,
): void {
  const status = isLive
    ? picocolors.green('● live')
    : dep.status === 'pinned'
      ? picocolors.cyan('● pinned')
      : dep.status === 'superseded'
        ? picocolors.dim('○ superseded')
        : picocolors.yellow('◌ preview');
  const time = new Date(dep.created_at).toLocaleString();
  const url = isLive ? liveUrl(project) : permalinkUrl(project, dep.deploy_id);
  const link = ansiLink(url, picocolors.bold(picocolors.cyan(url)));

  console.log(`  ${status} ${dep.deploy_id}`);
  console.log(`    ${picocolors.dim('commit')}   ${shortCommit(dep.commit ?? 'unknown')}   ${picocolors.dim(time)}`);
  console.log(`    ${picocolors.dim('url')}     ${link}`);
  console.log('');
}

export function renderRecord(record: DeploymentRecord): void {
  const status = statusColor(record.status);
  const time = new Date(record.createdAt).toLocaleString();
  const link = ansiLink(record.url, picocolors.bold(picocolors.cyan(record.url)));

  console.log(`  ${status} ${record.id}`);
  console.log(`    ${picocolors.dim('commit')}   ${shortCommit(record.commit)}   ${picocolors.dim(time)}`);
  console.log(`    ${picocolors.dim('url')}     ${link}`);
  console.log('');
}

function statusColor(status: DeploymentRecord['status']): string {
  if (status === 'live') return picocolors.green('● live');
  if (status === 'preview') return picocolors.yellow('◌ preview');
  if (status === 'rolled-back') return picocolors.red('◌ rolled-back');
  return picocolors.dim('○ superseded');
}