import { r2Head, r2Delete, type R2Config } from './r2';
import { getAuthToken } from './device-auth';

export const TENANT_SUFFIX = '.chronadocs.xyz';

export interface DeployConfig {
  tenant: string;
  bucket: string;
  accountId?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  edgeUrl: string;
}

export function loadDeployConfig(): DeployConfig {
  return {
    tenant: process.env.CHRONA_PROJECT || '',
    bucket: process.env.CHRONA_R2_BUCKET || 'chrona-builds',
    accountId: process.env.CHRONA_R2_ACCOUNT_ID || undefined,
    accessKeyId: process.env.CHRONA_R2_ACCESS_KEY_ID || undefined,
    secretAccessKey: process.env.CHRONA_R2_SECRET_ACCESS_KEY || undefined,
    edgeUrl: process.env.CHRONA_EDGE_URL || 'https://chrona-edge.workers.dev',
  };
}

export function isR2Configured(config: DeployConfig): boolean {
  return Boolean(config.accountId && config.accessKeyId && config.secretAccessKey);
}

export function r2ConfigFor(config: DeployConfig): R2Config {
  if (!config.accountId || !config.accessKeyId || !config.secretAccessKey) {
    throw new Error('R2 not configured. Set CHRONA_R2_ACCOUNT_ID, CHRONA_R2_ACCESS_KEY_ID, CHRONA_R2_SECRET_ACCESS_KEY.');
  }
  return {
    accountId: config.accountId,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    bucket: config.bucket,
  };
}

/** Immutable deploy snapshot key. */
export function deployObjectKey(tenant: string, deployId: string, path: string): string {
  return `${tenant}/deploys/${deployId}/${path}`;
}

/** Content-hashed shared asset key. */
export function assetObjectKey(tenant: string, hash: string, ext: string): string {
  return `${tenant}/assets/${hash}.${ext}`;
}

/** Manifest ready-marker key for a deploy. */
export function manifestKey(tenant: string, deployId: string): string {
  return deployObjectKey(tenant, deployId, 'manifest.json');
}

export interface ManifestEntry {
  path: string;
  hash: string;
  size: number;
  immutable: boolean;
}

export interface DeployManifest {
  deployId: string;
  createdAt: string;
  commit: string;
  branch: string;
  files: ManifestEntry[];
}

export function contentTypeFor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    html: 'text/html; charset=utf-8',
    htm: 'text/html; charset=utf-8',
    css: 'text/css; charset=utf-8',
    js: 'text/javascript; charset=utf-8',
    mjs: 'text/javascript; charset=utf-8',
    json: 'application/json; charset=utf-8',
    md: 'text/markdown; charset=utf-8',
    mdx: 'text/markdown; charset=utf-8',
    txt: 'text/plain; charset=utf-8',
    xml: 'application/xml; charset=utf-8',
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    avif: 'image/avif',
    ico: 'image/x-icon',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    eot: 'application/vnd.ms-fontobject',
    wasm: 'application/wasm',
    map: 'application/json; charset=utf-8',
    pdf: 'application/pdf',
  };
  return map[ext] ?? 'application/octet-stream';
}

/** Is this a content-hashed asset (immutable across deploys)? */
export function isHashedAssetFile(filename: string): boolean {
  return /[-.][0-9a-f]{8,}\.[a-z0-9]+$/i.test(filename);
}

export interface DeployReport {
  deployId: string;
  tenant: string;
  url: string;
  previewUrl: string;
  permalinkUrl: string;
  files: number;
  bytes: number;
  skipped: number;
  isProd: boolean;
}

export function liveUrl(tenant: string): string {
  return `https://${tenant}${TENANT_SUFFIX}/`;
}

export function permalinkUrl(tenant: string, deployId: string): string {
  return `https://${deployId}--${tenant}${TENANT_SUFFIX}/`;
}

export function previewUrl(tenant: string): string {
  return `https://${tenant}${TENANT_SUFFIX}/preview/`;
}

export interface EdgeRpcResult {
  ok: boolean;
  status: number;
  data: Record<string, unknown> | null;
  error?: string;
}

async function edgeRpc(config: DeployConfig, action: string, body: Record<string, unknown>): Promise<EdgeRpcResult> {
  const url = `${config.edgeUrl.replace(/\/$/, '')}/__chrona/tenants/${encodeURIComponent(config.tenant)}/${action}`;
  let authHeader: Record<string, string> = {};
  try {
    authHeader = { Authorization: `Bearer ${await getAuthToken()}` };
  } catch {
    // Unauthenticated fallback: control RPC may still accept anonymous (dev).
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: Record<string, unknown> | null = null;
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data, error: data?.error as string | undefined };
}

export async function edgeRegister(config: DeployConfig, deployId: string, commit: string, branch: string): Promise<EdgeRpcResult> {
  return edgeRpc(config, 'register', { deployId, commit, branch });
}

export async function edgePromote(config: DeployConfig, deployId: string): Promise<EdgeRpcResult> {
  return edgeRpc(config, 'promote', { deployId });
}

export async function edgePromotePreview(config: DeployConfig, deployId: string): Promise<EdgeRpcResult> {
  return edgeRpc(config, 'promotePreview', { deployId });
}

export async function edgeRollback(config: DeployConfig, deployId: string): Promise<EdgeRpcResult> {
  return edgeRpc(config, 'rollback', { deployId });
}

export async function edgeList(config: DeployConfig): Promise<{ deploys: unknown[]; aliases: unknown[] } | null> {
  const url = `${config.edgeUrl.replace(/\/$/, '')}/__chrona/tenants/${encodeURIComponent(config.tenant)}/list`;
  let authHeader: Record<string, string> = {};
  try {
    authHeader = { Authorization: `Bearer ${await getAuthToken()}` };
  } catch {
    // Unauthenticated fallback: control RPC may still accept anonymous (dev).
  }
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', ...authHeader },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { deploys: unknown[]; aliases: unknown[] };
  return data;
}

export async function edgeGetRoute(config: DeployConfig, alias = 'prod'): Promise<string | null> {
  const url = `${config.edgeUrl.replace(/\/$/, '')}/__chrona/tenants/${encodeURIComponent(config.tenant)}/getRoute?alias=${encodeURIComponent(alias)}`;
  let authHeader: Record<string, string> = {};
  try {
    authHeader = { Authorization: `Bearer ${await getAuthToken()}` };
  } catch {
    // Unauthenticated fallback: control RPC may still accept anonymous (dev).
  }
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', ...authHeader },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { deployId?: string | null };
  return data.deployId ?? null;
}

/** Check whether an object already exists in R2 (hash dedupe). */
export async function r2Exists(config: DeployConfig, key: string): Promise<boolean> {
  try {
    const head = await r2Head(r2ConfigFor(config), key);
    return head !== null;
  } catch {
    return false;
  }
}

export async function r2DeleteObject(config: DeployConfig, key: string): Promise<void> {
  await r2Delete(r2ConfigFor(config), key);
}