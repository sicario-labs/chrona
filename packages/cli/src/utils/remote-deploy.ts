// Remote deploy protocol (Phase 3): pack the source tree, push it through the
// edge worker into R2, create a build job, and stream its logs until it
// reaches a terminal state. No direct R2 credentials are needed — the worker
// holds the bucket binding.
import picocolors from 'picocolors';
import { packSourceBundle } from './source-bundle';
import { ensureProject } from './ensure-project';
import { API_URL, getAuthToken } from './device-auth';

export interface RemoteDeployOptions {
  cwd: string;
  project?: string;
  /** Poll for log updates this often (ms). */
  pollMs?: number;
}

export interface RemoteDeployResult {
  jobId: string;
  projectId: string;
  commit: string;
  branch: string;
  deployId?: string | null;
  url?: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
}

async function api(path: string, init?: RequestInit): Promise<Response> {
  const token = await getAuthToken();
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Origin: API_URL,
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
}

/**
 * Stream a job's log from `after` bytes, printing lines as they arrive.
 * Long-polls for up to 25s per request (edge cap) and follows the cursor.
 * Resolves when the job reaches a terminal state.
 */
async function streamJobLog(
  jobId: string,
  apiKey: string,
  { after = 0, pollMs = 800 }: { after?: number; pollMs?: number } = {},
): Promise<{ status: string; next: number }> {
  const base = `${API_URL}/api/builds/jobs/job/${jobId}/log`;
  let cursor = after;
  for (;;) {
    const res = await fetch(`${base}?after=${cursor}&poll=25`, {
      headers: { Origin: API_URL, Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      await new Promise((r) => setTimeout(r, pollMs));
      continue;
    }
    const body = (await res.json()) as {
      data?: { log?: string; next?: number; status?: string; complete?: boolean };
    };
    const data = body.data ?? {};
    const text = data.log ?? '';
    if (text) process.stdout.write(text);
    cursor = data.next ?? cursor;
    if (data.complete) {
      return { status: data.status ?? 'succeeded', next: cursor };
    }
  }
}

/**
 * Push a source bundle and create a remote build job. Waits for the fleet
 * builder to pick it up, streaming logs until the build finishes.
 */
export async function runRemoteDeploy(options: RemoteDeployOptions): Promise<RemoteDeployResult> {
  const cwd = options.cwd;
  const apiKey = await getAuthToken();

  // 1. Ensure the project exists in the control plane (tenant == project slug).
  const project = options.project ?? cwd.split(/[\\/]/).filter(Boolean).pop() ?? 'project';
  const { projectId } = await ensureProject(project);
  console.log(picocolors.dim(`  project ${picocolors.bold(project)} (${projectId})`));

  // 2. Pack the source tree; sha256 of the bundle is the commit (idempotency key).
  const bundle = await packSourceBundle({ cwd });
  console.log(picocolors.dim(`  packed ${bundle.fileCount} files → commit ${bundle.commit.slice(0, 12)}…`));

  // 3. Create the build job (idempotent per project+commit).
  const createRes = await api('/api/builds/jobs', {
    method: 'POST',
    body: JSON.stringify({
      projectId,
      commit: bundle.commit,
      branch: 'main',
    }),
  });
  if (!createRes.ok) throw new Error(`Failed to create build job (${createRes.status}): ${await createRes.text()}`);
  const created = (await createRes.json()) as {
    data?: { id: string; status: string; deployId?: string | null };
    requeued?: boolean;
  };
  const jobId = created.data?.id;
  if (!jobId) throw new Error('Build job creation returned no id.');

  if (created.requeued) {
    console.log(picocolors.yellow('  ↻ existing terminal build requeued'));
  }

  // 4. Push the source bundle through the edge into R2 (worker binding).
  console.log(picocolors.dim(`  uploading source bundle (${(bundle.tarGz.byteLength / 1024).toFixed(0)} KB)...`));
  const pushRes = await fetch(`${API_URL}/api/builds/jobs/job/${jobId}/source`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/gzip',
      Origin: API_URL,
      Authorization: `Bearer ${apiKey}`,
    },
    body: bundle.tarGz,
  });
  if (!pushRes.ok) throw new Error(`Source upload failed (${pushRes.status}): ${await pushRes.text()}`);

  console.log(picocolors.dim(`  build job ${jobId.slice(0, 8)} queued — waiting for a fleet worker...`));

  // 5. Stream logs until terminal.
  const pollMs = options.pollMs ?? 800;
  const result = await streamJobLog(jobId, apiKey, { pollMs });

  // Fetch the terminal job to surface the deployId.
  let deployId: string | null = null;
  const getRes = await api(`/api/builds/jobs/job/${jobId}`);
  if (getRes.ok) {
    const got = (await getRes.json()) as { data?: { deployId?: string | null } };
    deployId = got.data?.deployId ?? null;
  }

  const url = deployId ? `https://${deployId}--${project}.chronadocs.xyz/` : `https://${project}.chronadocs.xyz/`;
  if (result.status === 'succeeded') {
    console.log(picocolors.bold(picocolors.green(`\n  ✓ Build succeeded → ${url}\n`)));
  } else {
    console.log(picocolors.bold(picocolors.red(`\n  ✗ Build ${result.status}\n`)));
    throw new Error(`Remote build ${result.status}`);
  }

  return {
    jobId,
    projectId,
    commit: bundle.commit,
    branch: 'main',
    deployId,
    url,
    status: result.status as RemoteDeployResult['status'],
  };
}