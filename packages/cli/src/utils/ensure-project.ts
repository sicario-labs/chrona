import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { API_URL, getAuthToken } from './device-auth';

/** Local cache of {tenant → {projectId, orgId}} to skip API round-trips on repeat deploys. */
interface ProjectCache {
  projects: Record<string, { projectId: string; orgId: string; at: number }>;
}

function cachePath(): string {
  return path.join(os.homedir(), '.chrona', 'project-cache.json');
}

async function loadCache(): Promise<ProjectCache> {
  try {
    return JSON.parse(await fs.readFile(cachePath(), 'utf-8')) as ProjectCache;
  } catch {
    return { projects: {} };
  }
}

async function saveCache(cache: ProjectCache): Promise<void> {
  await fs.mkdir(path.dirname(cachePath()), { recursive: true });
  await fs.writeFile(cachePath(), JSON.stringify(cache, null, 2), 'utf-8');
}

interface OrgResponse {
  data?: { id: string; name?: string; slug?: string } | { id: string; name?: string; slug?: string }[];
}

interface ProjectResponse {
  data?: { id: string; slug: string; name?: string } | { id: string; slug: string; name?: string }[];
}

interface SessionResponse {
  user?: { id: string; email?: string; name?: string };
}

async function bearerHeaders(): Promise<Record<string, string>> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${await getAuthToken()}`,
  };
}

async function getSessionUser(): Promise<{ id: string; email?: string } | null> {
  const res = await fetch(`${API_URL}/api/auth/get-session`, {
    headers: await bearerHeaders(),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as SessionResponse | null;
  return data?.user ?? null;
}

/**
 * Ensure the tenant (project slug) exists in the control plane under an org
 * the current user is a member of. The edge worker refuses control RPCs for
 * tenants that have no project row (ownership check).
 *
 * Returns the org id + project id the tenant maps to. A local cache avoids
 * the API round-trips on repeat deploys; the cache is skipped when the API
 * is unavailable so offline deploys still fail loudly rather than lying.
 */
/** Read a cached {projectId, orgId} for a tenant without any API call (used by the unchanged fast-return path). */
export async function cachedProject(tenant: string): Promise<{ orgId: string; projectId: string } | null> {
  const cache = await loadCache();
  const cached = cache.projects[tenant];
  if (cached) return { orgId: cached.orgId, projectId: cached.projectId };
  return null;
}

export async function ensureProject(tenant: string): Promise<{ orgId: string; projectId: string }> {
  const cache = await loadCache();
  const cached = cache.projects[tenant];
  if (cached && Date.now() - cached.at < 60 * 60 * 1000) {
    return { orgId: cached.orgId, projectId: cached.projectId };
  }

  const resolved = await resolveProjectNetwork(tenant);
  cache.projects[tenant] = { projectId: resolved.projectId, orgId: resolved.orgId, at: Date.now() };
  await saveCache(cache);
  return resolved;
}

async function resolveProjectNetwork(tenant: string): Promise<{ orgId: string; projectId: string }> {
  // First try the consolidated /api/projects/ensure endpoint (works with both API keys and user sessions)
  try {
    const ensureRes = await fetch(`${API_URL}/api/projects/ensure`, {
      method: 'POST',
      headers: await bearerHeaders(),
      body: JSON.stringify({ slug: tenant, name: tenant }),
    });

    if (ensureRes.ok) {
      const json = (await ensureRes.json()) as { data?: { projectId: string; orgId: string } };
      if (json.data?.projectId && json.data?.orgId) {
        return { projectId: json.data.projectId, orgId: json.data.orgId };
      }
    }

    if (ensureRes.status === 401) {
      throw new Error('Not authenticated. Run `chrona login` or set CHRONA_AUTH_TOKEN.');
    }

    if (ensureRes.status === 409 || ensureRes.status === 422) {
      const err = await ensureRes.json().catch(() => ({ error: 'Invalid project' })) as { error?: string };
      throw new Error(err.error || 'Failed to ensure project.');
    }
  } catch (err: unknown) {
    if (err instanceof Error && (err.message.includes('Not authenticated') || err.message.includes('taken') || err.message.includes('Slug'))) {
      throw err;
    }
  }

  // Fallback to manual session resolution if endpoint is unavailable
  const user = await getSessionUser();
  if (!user) {
    throw new Error('Not authenticated. Run `chrona login` or set CHRONA_AUTH_TOKEN.');
  }

  // Resolve the user's org (reuse the console's "first org, else create" model).
  const orgsRes = await fetch(`${API_URL}/api/orgs`, { headers: await bearerHeaders() });
  if (!orgsRes.ok) throw new Error(`Failed to list organizations (${orgsRes.status}).`);
  const orgs = (await orgsRes.json()) as OrgResponse;
  const orgList = Array.isArray(orgs.data) ? orgs.data : orgs.data ? [orgs.data] : [];
  let orgId: string | undefined = orgList[0]?.id;
  if (!orgId) {
    const slug = `org-${user.id.slice(0, 8).toLowerCase()}`;
    const createRes = await fetch(`${API_URL}/api/orgs`, {
      method: 'POST',
      headers: await bearerHeaders(),
      body: JSON.stringify({ name: user.email?.split('@')[0] || 'My Org', slug }),
    });
    if (!createRes.ok) throw new Error(`Failed to create organization (${createRes.status}).`);
    const created = (await createRes.json()) as OrgResponse;
    const createdOrg = Array.isArray(created.data) ? created.data[0] : created.data;
    orgId = createdOrg?.id;
  }
  if (!orgId) throw new Error('No usable organization found for the current user.');

  // Find or create the project by slug (== tenant).
  const projectsRes = await fetch(`${API_URL}/api/orgs/${orgId}/projects`, {
    headers: await bearerHeaders(),
  });
  if (!projectsRes.ok) throw new Error(`Failed to list projects (${projectsRes.status}).`);
  const projects = (await projectsRes.json()) as ProjectResponse;
  const projectList = Array.isArray(projects.data) ? projects.data : projects.data ? [projects.data] : [];
  const existing = projectList.find((p) => p.slug === tenant);
  if (existing) return { orgId, projectId: existing.id };

  const slugCheck = isValidTenantSlug(tenant);
  if (!slugCheck.ok) throw new Error(slugCheck.reason);

  const createRes = await fetch(`${API_URL}/api/orgs/${orgId}/projects`, {
    method: 'POST',
    headers: await bearerHeaders(),
    body: JSON.stringify({ name: tenant, slug: tenant }),
  });
  if (!createRes.ok) {
    if (createRes.status === 409) {
      throw new Error(`Tenant slug "${tenant}" is already in use. Pick a different directory name.`);
    }
    throw new Error(`Failed to create project (${createRes.status}).`);
  }
  const created = (await createRes.json()) as ProjectResponse;
  const createdProject = Array.isArray(created.data) ? created.data[0] : created.data;
  const projectId = createdProject?.id;
  if (!projectId) throw new Error('Project creation returned no id.');

  return { orgId, projectId };
}

/** Keep in sync with apps/edge/src/api/slugs.ts (authoritative). */
const RESERVED_TENANT_SLUGS = new Set([
  'www', 'api', 'admin', 'app', 'docs', 'preview', 'previews', 'dev', 'staging',
  'stage', 'test', 'testing', 'demo', 'status', 'help', 'support', 'mail', 'smtp',
  'imap', 'ftp', 'blog', 'cdn', 'static', 'assets', 'img', 'images', 'fonts',
  'files', 'download', 'uploads', 'auth', 'login', 'signin', 'signup', 'register',
  'account', 'accounts', 'user', 'users', 'profile', 'me', 'org', 'orgs',
  'organization', 'organizations', 'project', 'projects', 'tenant', 'tenants',
  'console', 'dashboard', 'internal', 'backend', 'gateway', 'api-gateway',
  'service', 'services', 'mcp', 'llm', 'agent', 'agents', 'proxy', 'vpn',
  'webhook', 'webhooks', 'callback', 'verify', 'confirm', 'reset', 'token',
  'oauth', 'sso', 'health', 'metrics', 'monitor', 'monitoring', 'logs',
  'analytics', 'tracking', 'events', 'search', 'discover', 'explore',
  'docs-app', 'root', 'home', 'index', 'about', 'terms', 'privacy', 'legal',
  'security', 'trust', 'robots', 'sitemap', 'favicon', 'manifest', '_next',
  '_assets', '__chrona',
]);

function isValidTenantSlug(slug: string): { ok: true } | { ok: false; reason: string } {
  if (!slug || slug.length < 3 || slug.length > 40) {
    return { ok: false, reason: 'Slug must be 3–40 characters.' };
  }
  if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/.test(slug)) {
    return { ok: false, reason: 'Slug may only contain lowercase letters, numbers, and hyphens (no leading/trailing hyphen).' };
  }
  if (RESERVED_TENANT_SLUGS.has(slug)) {
    return { ok: false, reason: `"${slug}" is a reserved name and cannot be used.` };
  }
  return { ok: true };
}
