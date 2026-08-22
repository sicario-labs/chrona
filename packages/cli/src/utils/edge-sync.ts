// Fast deploy path (Phase 3 direct sync): build the docs locally with warm
// node_modules (no `npm ci`, no fleet queue), then push the dist through the
// edge worker's R2 binding with project access — no build job, lease, or fleet
// worker involved. Deterministic, ~3-5s for a typical docs site.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import picocolors from 'picocolors';
import { compileStaticBundle, type BuildResult } from '../commands/build';
import { ensureProject, cachedProject } from './ensure-project';
import { API_URL, getAuthToken } from './device-auth';
import { loadLedger } from './deployments';

export interface EdgeSyncOptions {
  cwd: string;
  project?: string;
  output?: string;
  prod?: boolean;
  /** Optional commit override (defaults to the git HEAD sha when present). */
  commit?: string;
  branch?: string;
  /**
   * Truth Referee gate, resolved concurrently with the local build. When
   * provided and `strict !== false`, a report with errors aborts the deploy
   * before anything is uploaded.
   */
  gate?: Promise<{ errorsCount: number }>;
  strict?: boolean;
}

export interface EdgeSyncResult {
  deployId: string;
  projectId: string;
  tenant: string;
  commit: string;
  branch: string;
  url: string;
  permalink: string;
  previewUrl: string;
  isProd: boolean;
  files: number;
  bytes: number;
  buildMs: number;
  syncMs: number;
  /** True when this commit was already live and nothing was built or uploaded. */
  unchanged?: boolean;
}

interface DistFile {
  relPath: string;
  hash: string;
  size: number;
  immutable: boolean;
}

const HASHED_ASSET = /[-.][0-9a-f]{8,}\.[a-z0-9]+$/i;

async function walkDist(dir: string, base = ''): Promise<DistFile[]> {
  const entries: DistFile[] = [];
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
        hash: crypto.createHash('sha256').update(buf).digest('hex'),
        size: buf.byteLength,
        immutable: HASHED_ASSET.test(item.name),
      });
    }
  }
  return entries;
}

/**
 * Deploy a locally-built dist directory by syncing artifacts through the edge
 * worker (no build job / fleet worker). Returns the live URL.
 */
export async function edgeSyncDeploy(options: EdgeSyncOptions): Promise<EdgeSyncResult> {
  const cwd = options.cwd;
  const outDir = options.output || 'dist';
  const tenant = options.project ?? cwd.split(/[\\/]/).filter(Boolean).pop() ?? 'project';

  const commit = options.commit ?? await gitHeadShort(cwd);
  const branch = options.branch ?? 'main';

  // Unchanged-commit fast return: this exact commit already went live, so skip
  // the build + sync entirely and just report the previous result.
  const ledger = await loadLedger();
  const prior = (ledger.projects[tenant] ?? []).find((r) => r.commit === commit && r.status === 'live');
  if (prior?.id && !options.prod) {
    const cached = await cachedProject(tenant);
    console.log(picocolors.dim(`  commit ${commit.slice(0, 8)} already live (${prior.id}) — nothing to build`));
    return {
      deployId: prior.id,
      projectId: cached?.projectId ?? '',
      tenant,
      commit,
      branch,
      url: `https://${tenant}.chronadocs.xyz/`,
      permalink: `https://${prior.id}--${tenant}.chronadocs.xyz/`,
      previewUrl: `https://${tenant}.chronadocs.xyz/preview/${prior.id}/`,
      isProd: true,
      files: 0,
      bytes: 0,
      buildMs: 0,
      syncMs: 0,
      unchanged: true,
    };
  }

  // Truth Referee gate runs concurrently with the build (no extra latency when
  // the docs pass). Fail fast before anything is uploaded.
  const gate = options.gate ?? Promise.resolve({ errorsCount: 0 });

  const apiKey = await getAuthToken();
  const { projectId } = await ensureProject(tenant);
  console.log(picocolors.dim(`  project ${picocolors.bold(tenant)} (${projectId})`));

  // 1. Local build (warm node_modules → no npm ci, seconds not minutes).
  const tBuild = performance.now();
  let result: BuildResult;
  try {
    result = await compileStaticBundle(cwd, outDir);
  } catch (err: unknown) {
    throw new Error(`Local build failed: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }
  const buildMs = Math.round(performance.now() - tBuild);
  console.log(picocolors.green(`  ✓ built ${picocolors.bold(result.repoName)} in ${buildMs}ms`));

  const report = await gate;
  if (report.errorsCount > 0 && options.strict !== false) {
    throw new Error(
      `Deploy aborted: ${report.errorsCount} documentation truth errors detected. ` +
        `Run \`npx chrona repair\` or fix DOC-xxx diagnostics before deploying.`,
    );
  }
  console.log(picocolors.green('  ✓ Truth Referee check passed (0 errors)'));

  // 2. Deploy id + file list (content-hashed, immutable).
  const deployId = `dep_${Date.now().toString(36)}_${commit.slice(0, 8)}`;
  const files = await walkDist(result.distDir);

  const origin = API_URL;
  const headers = (extra: Record<string, string> = {}): Record<string, string> => ({
    Origin: origin,
    Authorization: `Bearer ${apiKey}`,
    ...extra,
  });

  // 3. Upload the whole dist tree in ONE round-trip (framed payload) so large
  // sites don't serialize hundreds of requests. Content-hashed assets dedupe
  // server-side; unchanged deploys seal in place.
  const tSync = performance.now();
  console.log(picocolors.dim(`  syncing ${files.length} files to edge...`));

  // Frame: [u32 pathLen][path][u32 contentLen][content]... — little-endian.
  const parts: Buffer[] = [];
  let bytes = 0;
  for (const f of files) {
    const content = await fs.readFile(path.join(result.distDir, f.relPath));
    const pathBuf = Buffer.from(f.relPath, 'utf-8');
    const head = Buffer.alloc(8);
    head.writeUInt32LE(pathBuf.byteLength, 0);
    head.writeUInt32LE(content.byteLength, 4);
    parts.push(head, pathBuf, content);
    bytes += f.size;
  }
  const payload = Buffer.concat(parts);
  const uploadRes = await fetch(
    `${origin}/api/deploys/${encodeURIComponent(projectId)}/${encodeURIComponent(deployId)}/upload`,
    {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/octet-stream' }),
      body: payload,
    },
  );
  if (!uploadRes.ok) throw new Error(`artifact sync failed (${uploadRes.status}): ${await uploadRes.text()}`);

  // 4. Seal: manifest.json written last + register + promote.
  const sealRes = await fetch(
    `${origin}/api/deploys/${encodeURIComponent(projectId)}/${encodeURIComponent(deployId)}/seal`,
    {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        deployId,
        commit,
        branch,
        prod: options.prod === true,
        files: files.map((f) => ({
          path: f.relPath,
          hash: f.hash,
          size: f.size,
          immutable: f.immutable,
        })),
      }),
    },
  );
  if (!sealRes.ok) throw new Error(`seal failed (${sealRes.status}): ${await sealRes.text()}`);
  const sealed = (await sealRes.json()) as { data: { url: string; permalink: string; isProd: boolean } };
  const syncMs = Math.round(performance.now() - tSync);

  return {
    deployId,
    projectId,
    tenant,
    commit,
    branch,
    url: sealed.data.url,
    permalink: sealed.data.permalink,
    previewUrl: `https://${tenant}.chronadocs.xyz/preview/${deployId}/`,
    isProd: sealed.data.isProd,
    files: files.length,
    bytes,
    buildMs,
    syncMs,
  };
}

async function gitHeadShort(cwd: string): Promise<string> {
  try {
    const { execSync } = await import('node:child_process');
    const sha = execSync('git rev-parse HEAD', { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return sha || 'HEAD';
  } catch {
    return `local-${Date.now().toString(36)}`;
  }
}