import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import picocolors from 'picocolors';
import { execSync } from 'node:child_process';
import { BuildClient, type SealFile } from '../utils/build-client';
import { extractTarGz } from '../utils/source-bundle';
import { compileStaticBundle } from './build';
import { API_URL } from '../utils/device-auth';

export interface BuildWorkerOptions {
  once?: boolean;
  pollIntervalMs?: number;
  apiKey?: string;
  edgeUrl?: string;
  /** Force production promotion (default: first deploy is prod). */
  prod?: boolean;
  /** Override the build directory used for npm ci + vite (default: repo root). */
  cwd?: string;
}

interface DistFile {
  relPath: string;
  content: Uint8Array;
  hash: string;
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
      const content = new Uint8Array(await fs.readFile(absolutePath));
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      entries.push({ relPath, content, hash });
    }
  }
  return entries;
}

/**
 * Run the static-docs build pipeline inside an extracted source tree.
 * Returns the dist directory. Streams captured command output to the job log.
 */
async function buildSourceTree(
  sourceDir: string,
  log: (line: string) => void,
  options: { cwd?: string },
): Promise<{ distDir: string; repoName: string }> {
  const run = (cmd: string, cwd: string) => {
    log(`$ ${cmd}`);
    try {
      const out = execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf-8', maxBuffer: 16 * 1024 * 1024 });
      for (const line of out.split('\n')) {
        if (line.trim()) log(line.replace(/\s+$/g, ''));
      }
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; message?: string };
      for (const line of (e.stdout ?? '').split('\n')) {
        if (line.trim()) log(line.replace(/\s+$/g, ''));
      }
      for (const line of (e.stderr ?? '').split('\n')) {
        if (line.trim()) log(line.replace(/\s+$/g, ''));
      }
      throw new Error(`command failed: ${cmd} — ${e.message ?? String(err)}`, { cause: err });
    }
  };

  const targetDir = options.cwd ? path.join(sourceDir, options.cwd) : sourceDir;
  const hasPkg = await fs.stat(path.join(targetDir, 'package.json')).catch(() => null);
  if (!hasPkg) {
    throw new Error('No package.json found in the source bundle; cannot run a Vite build.');
  }

  const lockFile = await fs.stat(path.join(targetDir, 'pnpm-lock.yaml')).then(() => 'pnpm-lock.yaml')
    .catch(() => fs.stat(path.join(targetDir, 'package-lock.json')).then(() => 'package-lock.json'))
    .catch(() => null);

  log('Installing dependencies...');
  const isPnpm = lockFile?.startsWith('pnpm') ?? false;
  run(isPnpm ? 'pnpm install --frozen-lockfile' : 'npm ci', targetDir);

  const result = await compileStaticBundle(targetDir, 'dist');
  log(`✓ built ${result.distDir} (${result.repoName})`);
  return { distDir: result.distDir, repoName: result.repoName };
}

/**
 * Download the source bundle for a job, extract it to a temp dir, and run the
 * full remote build: install → pre-build → vite → llms.txt → upload → seal.
 */
export async function processBuildJob(options: BuildWorkerOptions = {}): Promise<boolean> {
  const apiKey = options.apiKey ?? process.env.CHRONA_AUTH_TOKEN ?? '';
  if (!apiKey) throw new Error('A fleet API key is required. Set CHRONA_AUTH_TOKEN=chr_...');
  const edgeUrl = options.edgeUrl ?? API_URL;
  const client = new BuildClient(apiKey, edgeUrl);

  const job = await client.lease();
  if (!job) return false;
  console.log(picocolors.dim(`Leased job ${job.id.slice(0, 8)} (${job.commit.slice(0, 8)}, retries ${job.retries})`));

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chrona-build-'));
  let heart: NodeJS.Timeout | null = null;
  let buffer = '';

  const log = (line: string) => {
    const lineOut = `${line}\n`;
    process.stdout.write(lineOut);
    buffer += lineOut;
    if (buffer.length >= 4096) {
      void client.appendLog(job, buffer).catch(() => {});
      buffer = '';
    }
  };
  const flush = () => {
    if (buffer) {
      void client.appendLog(job, buffer).catch(() => {});
      buffer = '';
    }
  };

  try {
    // Heartbeat every 60s keeps the lease alive (lease TTL = 5 min).
    heart = setInterval(() => void client.heartbeat(job).catch(() => {}), 60_000);

    log(`Downloading source bundle (${job.sourceKey ?? '?'})...`);
    const sourceBytes = await client.downloadSource(job);
    const files = extractTarGz(Buffer.from(sourceBytes));
    for (const [relPath, content] of files) {
      const dest = path.join(workDir, relPath);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, content);
    }
    log(`Extracted ${files.size} files from source bundle.`);

    const { distDir } = await buildSourceTree(workDir, log, { cwd: options.cwd });

    // Upload dist to the edge (content-hashed assets + immutable deploy tree).
    const deployId = `dep_${Date.now().toString(36)}_${job.commit.slice(0, 8)}`;
    const distFiles = await walkDist(distDir);
    log(`Uploading ${distFiles.length} artifacts for ${deployId}...`);
    const sealFiles: SealFile[] = [];
    for (const f of distFiles) {
      await client.uploadArtifact(job, deployId, f.relPath, f.content);
      sealFiles.push({
        path: f.relPath,
        hash: f.hash,
        size: f.content.byteLength,
        immutable: HASHED_ASSET.test(f.relPath.split('/').pop() ?? ''),
      });
    }
    flush();

    const sealed = await client.seal(job, deployId, job.branch, options.prod === true, sealFiles);
    log(`✓ Deploy ${deployId} → ${sealed.url}`);
    flush();

    await client.complete(job, deployId);
    console.log(picocolors.green(`\n  ✓ Build complete → ${sealed.url}`));
    return true;
  } catch (err: unknown) {
    flush();
    const message = err instanceof Error ? err.message : String(err);
    await client.fail(job, message).catch(() => {});
    console.error(picocolors.red(`\n  ✗ Build failed: ${message}`));
    return false;
  } finally {
    if (heart) clearInterval(heart);
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Fleet build worker: loop over the queue, pulling one job at a time.
 * `--once` processes a single job and exits.
 */
export async function runBuildWorker(options: BuildWorkerOptions = {}) {
  const pollMs = options.pollIntervalMs ?? 5_000;
  console.log(picocolors.bold(picocolors.cyan('\nCHRONA ⚡ Fleet Build Worker\n')));
  console.log(picocolors.dim(`Polling ${API_URL} for queued builds... (Ctrl+C to stop)\n`));

  if (options.once) {
    const processed = await processBuildJob(options);
    if (!processed) {
      console.log(picocolors.dim('  Queue idle — no job available.'));
    }
    return;
  }

  let idlePolls = 0;
  for (;;) {
    try {
      const processed = await processBuildJob(options);
      idlePolls = processed ? 0 : idlePolls + 1;
      if (!processed && idlePolls % 12 === 1) {
        console.log(picocolors.dim(`  idle (${idlePolls} polls) — waiting for jobs...`));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(picocolors.red(`  ✖ poll error: ${message}`));
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
}