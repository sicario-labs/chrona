import picocolors from 'picocolors';
import { API_URL, getAuthToken } from '../utils/device-auth';
import { projectId } from '../utils/deployments';
import { ensureProject } from '../utils/ensure-project';

interface ApiKeyRecord {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt?: string;
  lastUsedAt?: string | null;
  expiresAt?: string | null;
  revokedAt?: string | null;
}

interface CreateResponse {
  data?: { id: string; name: string; keyPrefix: string; key: string };
  error?: string;
}

interface ListResponse {
  data?: ApiKeyRecord[];
  error?: string;
}

/** Resolve the tenant slug from the current directory (same rule the deploy path uses). */
async function resolveTenant(): Promise<string> {
  try {
    return await projectId(process.cwd());
  } catch {
    throw new Error('Not inside a Chrona project. Run this from your docs repo.');
  }
}

export async function runChronaAuthCreateKey(options: { name?: string }) {
  try {
    const tenant = await resolveTenant();
    const { orgId } = await ensureProject(tenant);
    const token = await getAuthToken();

    const res = await fetch(`${API_URL}/api/orgs/${orgId}/api-keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: options.name ?? tenant }),
    });
    const json = (await res.json()) as CreateResponse;
    if (!res.ok || !json.data) {
      throw new Error(json.error || `Failed to create API key (${res.status}).`);
    }

    console.log(picocolors.bold(picocolors.cyan('\n  ✓ API key created\n')));
    console.log(`  ${picocolors.bold('Key:')}       ${picocolors.yellow(json.data.key)}`);
    console.log(`  ${picocolors.bold('Name:')}      ${json.data.name}`);
    console.log(`  ${picocolors.bold('Scope:')}     tenant:${tenant} (org ${orgId})`);
    console.log(picocolors.dim('\n  Store this key now — it is shown only once.\n'));
    console.log(picocolors.dim('  Use it with:  CHRONA_AUTH_TOKEN=<key> chrona deploy\n'));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(picocolors.red(`\n  ✖ ${message}\n`));
    process.exitCode = 1;
  }
}

export async function runChronaAuthListKeys() {
  try {
    const tenant = await resolveTenant();
    const { orgId } = await ensureProject(tenant);
    const token = await getAuthToken();

    const res = await fetch(`${API_URL}/api/orgs/${orgId}/api-keys`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as ListResponse;
    if (!res.ok) throw new Error(json.error || `Failed to list API keys (${res.status}).`);

    const keys = json.data ?? [];
    if (keys.length === 0) {
      console.log(picocolors.dim('\n  No API keys. Create one with `chrona auth:create-key`.\n'));
      return;
    }
    console.log(picocolors.bold('\n  API keys\n'));
    for (const k of keys) {
      const last = k.lastUsedAt ? `  last used ${new Date(k.lastUsedAt).toISOString()}` : '  never used';
      const created = k.createdAt ? new Date(k.createdAt).toISOString() : '?';
      console.log(`  ${k.keyPrefix}  ${picocolors.dim(k.name)}  (created ${created}${last})`);
    }
    console.log('');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(picocolors.red(`\n  ✖ ${message}\n`));
    process.exitCode = 1;
  }
}

export async function runChronaAuthRevokeKey(options: { id: string }) {
  try {
    const tenant = await resolveTenant();
    const { orgId } = await ensureProject(tenant);
    const token = await getAuthToken();

    const res = await fetch(`${API_URL}/api/orgs/${orgId}/api-keys/${options.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(json.error || `Failed to revoke API key (${res.status}).`);
    }
    console.log(picocolors.green(`\n  ✓ API key ${options.id} revoked.\n`));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(picocolors.red(`\n  ✖ ${message}\n`));
    process.exitCode = 1;
  }
}
