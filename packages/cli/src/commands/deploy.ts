import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import picocolors from 'picocolors';
import { getChronaCheckReport } from './check';
import { ansiLink } from '../utils/terminal-ui';
import {
  gitCommit,
  gitRemote,
  loadLedger,
  projectId,
  saveLedger,
  type DeploymentRecord,
} from '../utils/deployments';
import {
  loadDeployConfig,
  r2ConfigFor,
  deployObjectKey,
  assetObjectKey,
  manifestKey,
  contentTypeFor,
  isHashedAssetFile,
  liveUrl,
  permalinkUrl,
  edgeRegister,
  edgePromote,
  edgePromotePreview,
  edgeGetRoute,
  type ManifestEntry,
  type DeployManifest,
} from '../utils/deploy-edge';
import { r2Head, r2Put, r2UploadLarge, R2_MULTIPART_THRESHOLD } from '../utils/r2';
import { runRemoteDeploy } from '../utils/remote-deploy';
import { edgeSyncDeploy } from '../utils/edge-sync';

export interface DeployOptions {
  cwd?: string;
  output?: string;
  vercel?: boolean;
  project?: string;
  bucket?: string;
  strict?: boolean;
  prod?: boolean;
  remote?: boolean;
}

import { execSync } from 'node:child_process';

interface FileEntry {
  relPath: string;
  absolutePath: string;
  hash: string;
  size: number;
  immutable: boolean;
}

async function walkDist(dir: string, base = ''): Promise<FileEntry[]> {
  const entries: FileEntry[] = [];
  const items = await fs.readdir(dir, { withFileTypes: true });
  for (const item of items) {
    const relPath = path.posix.join(base, item.name);
    const absolutePath = path.join(dir, item.name);
    if (item.isDirectory()) {
      entries.push(...(await walkDist(absolutePath, relPath)));
    } else if (item.isFile()) {
      const buf = await fs.readFile(absolutePath);
      entries.push({
        relPath,
        absolutePath,
        hash: crypto.createHash('sha256').update(buf).digest('hex'),
        size: buf.byteLength,
        immutable: isHashedAssetFile(item.name),
      });
    }
  }
  return entries;
}

export async function runChronaDeploy(options: DeployOptions = {}) {
  const cwd = options.cwd || process.cwd();
  
  if (options.vercel) {
    console.log(picocolors.bold(picocolors.cyan('\nCHRONA ⚡ Deploying to Vercel (Free Tier)\n')));
    console.log(picocolors.dim(`Typechecking and deploying docs site to Vercel global CDN...\n`));
    
    const docsAppDir = path.join(cwd, 'docs');
    const vercelCwd = (await fs.stat(docsAppDir).catch(() => null)) ? docsAppDir : cwd;

    try {
      const args = ['vercel', 'deploy'];
      if (options.prod) args.push('--prod');
      execSync(`npx ${args.join(' ')}`, { cwd: vercelCwd, stdio: 'inherit' });
      console.log(picocolors.bold(picocolors.green('\n✓ Deployed to Vercel successfully!\n')));
    } catch (e: unknown) {
      console.error(picocolors.bold(picocolors.red('\n✗ Vercel deployment failed. Ensure you have the Vercel CLI installed and authenticated.\n')));
      process.exitCode = 1;
    }
    return;
  }

  const outDir = options.output || 'dist';
  const project = options.project || projectId(cwd);
  const bucket = options.bucket || 'chrona-builds';

  console.log(picocolors.bold(picocolors.cyan('\nCHRONA ⚡ Deployment (v3 — local build + edge sync)\n')));
  console.log(picocolors.dim(`Deploying ${picocolors.bold(project)} to Chrona Edge Network...\n`));

  // 1. Truth Referee Gate (deployments must be truthful). For the fast path
  // the check runs concurrently with the local build (edge-sync); for the
  // fleet/remote path it gates before the job is queued.
  const checkReport = getChronaCheckReport(cwd);

  // Remote mode: push source, queue a build, stream logs (Phase 3 CI/fleet).
  if (options.remote) {
    const report = await checkReport;
    if (report.errorsCount > 0 && options.strict !== false) {
      console.error(picocolors.bold(picocolors.red(`✗ Deploy aborted: ${report.errorsCount} documentation truth errors detected.`)));
      console.error(picocolors.dim('  Run `npx chrona repair` or fix DOC-xxx diagnostics before deploying.\n'));
      process.exitCode = 1;
      return;
    }
    console.log(picocolors.green('  ✓ Code Verification check passed (0 errors)'));
    try {
      await runRemoteDeploy({ cwd, project });
    } catch (err: unknown) {
      console.error(picocolors.bold(picocolors.red(`✗ Remote deploy failed: ${err instanceof Error ? err.message : String(err)}\n`)));
      process.exitCode = 1;
    }
    return;
  }

  // Fast path (default): build locally (warm node_modules) and sync dist
  // through the edge worker's R2 binding. No queue, no fleet worker, no npm ci.
  try {
    const report = await edgeSyncDeploy({
      cwd,
      project,
      output: outDir,
      prod: options.prod === true,
      gate: checkReport,
      strict: options.strict,
    });
    console.log(picocolors.green(`  ✓ ${report.files} files • ${formatBytes(report.bytes)} • build ${report.buildMs}ms • sync ${report.syncMs}ms`));
    console.log(
      picocolors.bold(picocolors.green('\n  ✓ Deployment live: ')) +
        ansiLink(report.url, picocolors.bold(picocolors.cyan(report.url)))
    );
    if (!report.isProd) {
      console.log(picocolors.dim(`    preview ${ansiLink(report.previewUrl, picocolors.cyan(report.previewUrl))}`));
    }
    console.log(picocolors.dim(`    permalink ${ansiLink(report.permalink, picocolors.cyan(report.permalink))}`));
    console.log(picocolors.dim(`    deploy ${report.deployId}\n`));

    // Only record a new ledger entry for a real deploy; an unchanged fast
    // return already has a live record and shouldn't duplicate it.
    if (!report.unchanged) {
      await recordLocal(project, cwd, bucket, report.isProd, report.commit, {
        deployId: report.deployId,
        url: report.url,
        permalinkUrl: report.permalink,
      });
    }
  } catch (err: unknown) {
    console.error(picocolors.bold(picocolors.red(`✗ Deployment failed: ${err instanceof Error ? err.message : String(err)}\n`)));
    process.exitCode = 1;
    return;
  }
}

/** Upload dist to R2 with hash dedupe, write manifest.json last, then flip the alias. */
export async function uploadAndPromote(
  config: ReturnType<typeof loadDeployConfig>,
  distDir: string,
  cwd: string,
  forceProd: boolean,
  commitOverride?: string,
  branchOverride?: string,
): Promise<{
  deployId: string;
  tenant: string;
  url: string;
  previewUrl: string;
  permalinkUrl: string;
  files: number;
  bytes: number;
  skipped: number;
  isProd: boolean;
}> {
  const commit = commitOverride ?? gitCommit(cwd);
  const branch = branchOverride ?? 'main';
  const files = await walkDist(distDir);
  const deployId = `dep_${Date.now().toString(36)}_${commit}`;
  const r2 = r2ConfigFor(config);
  let uploaded = 0;
  let bytes = 0;
  let skipped = 0;

  console.log(picocolors.dim('  Hashing files & uploading to immutable deploy store...'));

  for (const file of files) {
    // Content-hashed shared store: dedupe by hash.
    const ext = path.extname(file.relPath).slice(1) || 'bin';
    const assetKey = assetObjectKey(config.tenant, file.hash, ext);
    const assetExists = await r2Head(r2, assetKey);
    if (!assetExists) {
      const body = await fs.readFile(file.absolutePath);
      if (body.byteLength > R2_MULTIPART_THRESHOLD) {
        await r2UploadLarge(r2, assetKey, body, contentTypeFor(file.relPath));
      } else {
        await r2Put(r2, assetKey, body, contentTypeFor(file.relPath));
      }
    } else {
      skipped++;
    }

    // Immutable deploy snapshot always records the full tree (self-contained).
    const deployKey = deployObjectKey(config.tenant, deployId, file.relPath);
    const body = await fs.readFile(file.absolutePath);
    if (body.byteLength > R2_MULTIPART_THRESHOLD) {
      await r2UploadLarge(r2, deployKey, body, contentTypeFor(file.relPath));
    } else {
      await r2Put(r2, deployKey, body, contentTypeFor(file.relPath));
    }
    uploaded++;
    bytes += file.size;
  }

  // manifest.json written LAST = the deploy is ready.
  const manifest: DeployManifest = {
    deployId,
    createdAt: new Date().toISOString(),
    commit,
    branch,
    files: files.map((f): ManifestEntry => ({
      path: f.relPath,
      hash: f.hash,
      size: f.size,
      immutable: f.immutable,
    })),
  };
  const manifestBuf = Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8');
  await r2Put(r2, manifestKey(config.tenant, deployId), manifestBuf, 'application/json');

  // Register + flip alias LAST (atomic-ish: manifest exists before aliasing).
  const isProd = forceProd || (await isFirstDeploy(config));
  await edgeRegister(config, deployId, commit, branch);
  const flip = isProd ? await edgePromote(config, deployId) : await edgePromotePreview(config, deployId);
  if (!flip.ok) {
    throw new Error(`alias flip failed (${flip.status}): ${flip.error ?? 'unknown'}`);
  }

  return {
    deployId,
    tenant: config.tenant,
    url: liveUrl(config.tenant),
    previewUrl: `https://${config.tenant}.chronadocs.xyz/preview/${deployId}/`,
    permalinkUrl: permalinkUrl(config.tenant, deployId),
    files: uploaded,
    bytes,
    skipped,
    isProd,
  };
}

/** First deploy for a project = production unless --prod forces otherwise on later deploys. */
async function isFirstDeploy(config: ReturnType<typeof loadDeployConfig>): Promise<boolean> {
  try {
    const current = await edgeGetRoute(config, 'prod');
    return current === null;
  } catch {
    return true;
  }
}

async function recordLocal(
  project: string,
  cwd: string,
  bucket: string,
  isProd: boolean,
  commitOverride: string | undefined,
  report: {
    deployId: string;
    url: string;
    permalinkUrl: string;
  } | undefined,
): Promise<void> {
  const commit = commitOverride ?? gitCommit(cwd);
  const repo = gitRemote(cwd);
  const url = report?.url ?? (isProd ? liveUrl(project) : `https://${project}.chronadocs.xyz/preview/${report?.deployId ?? ''}/`);
  const record: DeploymentRecord = {
    id: report?.deployId ?? `dep_${Date.now().toString(36)}`,
    project,
    commit,
    repo,
    createdAt: new Date().toISOString(),
    url,
    status: isProd ? 'live' : 'preview',
  };

  const ledger = await loadLedger();
  const records = ledger.projects[project] || [];
  if (isProd) {
    records.forEach((r) => {
      if (r.status === 'live') r.status = 'superseded';
    });
  }
  records.unshift(record);
  ledger.projects[project] = records;
  await saveLedger(ledger);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export async function uploadDistToR2(distDir: string, bucket: string, project: string, cwd: string): Promise<void> {
  const config = loadDeployConfig();
  config.tenant = project;
  config.bucket = bucket;
  await uploadAndPromote(config, distDir, cwd, false);
}

export async function distOf(cwd: string, output = 'dist'): Promise<string | null> {
  const candidate = path.join(cwd, 'apps', 'docs', output);
  if (await fs.stat(candidate).catch(() => null)) return candidate;
  const root = path.join(cwd, output);
  if (await fs.stat(root).catch(() => null)) return root;
  return null;
}