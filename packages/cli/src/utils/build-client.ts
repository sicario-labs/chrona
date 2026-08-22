// Fleet build-client: the external builder's control-plane surface. It leases
// jobs, streams logs, heartbeats, and completes/fails them — all over the
// public edge API with an org API key (chr_...) as the bearer credential.
// Source download and artifact upload are proxied through the edge worker's
// R2 binding, so the fleet never needs direct R2 credentials.
import { API_URL } from './device-auth';

export interface LeasedJob {
  id: string;
  projectId: string;
  commit: string;
  branch: string;
  sourceKey: string | null;
  sourceSize: number | null;
  retries: number;
  leaseToken: string;
}

export interface JobStatusPayload {
  log?: string;
  next?: number;
  status?: string;
  complete?: boolean;
  timedOut?: boolean;
}

export interface SealFile {
  path: string;
  hash: string;
  size: number;
  immutable?: boolean;
}

function baseUrl(): string {
  return (API_URL.endsWith('/') ? API_URL.slice(0, -1) : API_URL) + '/api/builds/jobs';
}

function leaseTokenOf(job: LeasedJob): string {
  return job.leaseToken;
}

async function json(res: Response): Promise<Record<string, unknown> | unknown[] | null> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

export class BuildClient {
  private apiKey: string;
  private origin: string;

  constructor(apiKey: string, edgeUrl?: string) {
    this.apiKey = apiKey;
    this.origin = edgeUrl ?? API_URL;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Origin: this.origin,
      Authorization: `Bearer ${this.apiKey}`,
      ...extra,
    };
  }

  /** Lease the next queued job this org may build, or null when the queue is empty/gated. */
  async lease(): Promise<LeasedJob | null> {
    const res = await fetch(`${baseUrl()}/queue/lease`, {
      method: 'POST',
      headers: this.headers(),
    });
    if (res.status === 401) throw new Error('Unauthorized: invalid API key for fleet build client.');
    const body = await json(res);
    const data = body && typeof body === 'object' && !Array.isArray(body) ? (body as { data?: unknown }).data : null;
    return (data as LeasedJob | null) ?? null;
  }

  async getJob(jobId: string): Promise<{ status: string; logBytes?: number } | null> {
    const res = await fetch(`${baseUrl()}/job/${jobId}`, { headers: this.headers() });
    const body = await json(res);
    const data = body && typeof body === 'object' && !Array.isArray(body) ? (body as { data?: unknown }).data : null;
    return (data as { status: string; logBytes?: number } | null) ?? null;
  }

  async appendLog(job: LeasedJob, text: string): Promise<void> {
    await fetch(`${baseUrl()}/job/${job.id}/log`, {
      method: 'POST',
      headers: this.headers({ 'X-Lease-Token': leaseTokenOf(job) }),
      body: JSON.stringify({ log: text }),
    });
  }

  async heartbeat(job: LeasedJob): Promise<void> {
    await fetch(`${baseUrl()}/job/${job.id}/heartbeat`, {
      method: 'POST',
      headers: this.headers({ 'X-Lease-Token': leaseTokenOf(job) }),
    });
  }

  /** Download the source bundle as raw gzip bytes. */
  async downloadSource(job: LeasedJob): Promise<Uint8Array> {
    const res = await fetch(`${baseUrl()}/job/${job.id}/source`, {
      headers: this.headers({ 'X-Lease-Token': leaseTokenOf(job) }),
    });
    if (!res.ok) throw new Error(`source download failed (${res.status}): ${await res.text()}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  /** Upload a dist artifact for the given deployId. */
  async uploadArtifact(job: LeasedJob, deployId: string, relPath: string, body: Uint8Array): Promise<void> {
    const res = await fetch(`${baseUrl()}/job/${job.id}/artifacts/${encodeURIComponent(deployId)}/${encodeURIComponent(relPath)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        Origin: this.origin,
        Authorization: `Bearer ${this.apiKey}`,
        'X-Lease-Token': leaseTokenOf(job),
      },
      body,
    });
    if (!res.ok) throw new Error(`artifact upload ${relPath} failed (${res.status}): ${await res.text()}`);
  }

  /** Seal the deploy (write manifest + register + promote) and return its URL. */
  async seal(job: LeasedJob, deployId: string, branch: string, prod: boolean, files: SealFile[]): Promise<{ url: string; permalink: string; isProd: boolean }> {
    const res = await fetch(`${baseUrl()}/job/${job.id}/seal`, {
      method: 'POST',
      headers: this.headers({ 'X-Lease-Token': leaseTokenOf(job) }),
      body: JSON.stringify({ deployId, branch, prod, files }),
    });
    if (!res.ok) throw new Error(`seal failed (${res.status}): ${await res.text()}`);
    const body = await json(res);
    const data = body && typeof body === 'object' && !Array.isArray(body) ? (body as { data?: unknown }).data : null;
    return data as { url: string; permalink: string; isProd: boolean };
  }

  async complete(job: LeasedJob, deployId: string): Promise<void> {
    const res = await fetch(`${baseUrl()}/job/${job.id}/complete`, {
      method: 'POST',
      headers: this.headers({ 'X-Lease-Token': leaseTokenOf(job) }),
      body: JSON.stringify({ deployId }),
    });
    if (!res.ok) throw new Error(`complete failed (${res.status}): ${await res.text()}`);
  }

  async fail(job: LeasedJob, error: string): Promise<void> {
    const res = await fetch(`${baseUrl()}/job/${job.id}/fail`, {
      method: 'POST',
      headers: this.headers({ 'X-Lease-Token': leaseTokenOf(job) }),
      body: JSON.stringify({ error: error.slice(0, 2000) }),
    });
    if (!res.ok) throw new Error(`fail failed (${res.status}): ${await res.text()}`);
  }
}