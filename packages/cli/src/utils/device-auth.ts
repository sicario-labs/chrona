import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export interface DeviceAuthSession {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
  interval: number;
}

export interface UserCredentials {
  accessToken: string;
  expiresAt: number;
  user: {
    id: string;
    email: string;
    name?: string;
  };
}

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri?: string;
  verification_uri_complete?: string;
  expires_in?: number;
  interval?: number;
}

interface DeviceTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
}

/**
 * The Chrona control-plane API base URL. Defaults to the local edge worker
 * (wrangler dev); override for a deployed environment.
 */
export const API_URL = process.env.CHRONA_API_URL || 'http://localhost:8787';

/**
 * Get credentials storage path
 */
function getCredentialsPath(): string {
  return path.join(os.homedir(), '.chrona', 'credentials.json');
}

/**
 * Save user credentials to ~/.chrona/credentials.json (chmod 0600 on POSIX)
 */
export async function saveCredentials(creds: UserCredentials): Promise<void> {
  const credPath = getCredentialsPath();
  await fs.mkdir(path.dirname(credPath), { recursive: true });
  await fs.writeFile(credPath, JSON.stringify(creds, null, 2), 'utf-8');
  await fs.chmod(credPath, 0o600).catch(() => {});
}

/**
 * Read user credentials from ~/.chrona/credentials.json
 */
export async function getStoredCredentials(): Promise<UserCredentials | null> {
  try {
    const data = await fs.readFile(getCredentialsPath(), 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Resolve the bearer token the CLI should use for control-plane calls.
 * Precedence: CHRONA_AUTH_TOKEN env var, then stored device credentials.
 */
export async function getAuthToken(): Promise<string> {
  const envToken = process.env.CHRONA_AUTH_TOKEN;
  if (envToken) return envToken;
  const creds = await getStoredCredentials();
  if (creds?.accessToken) return creds.accessToken;
  throw new Error('Not authenticated. Run `chrona login` or set CHRONA_AUTH_TOKEN.');
}

/**
 * Initiate RFC 8628 Device Authorization Grant against the better-auth
 * device-authorization plugin (mounted under /api/auth/device/*).
 */
export async function initiateDeviceAuth(): Promise<DeviceAuthSession> {
  const res = await fetch(`${API_URL}/api/auth/device/code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: 'chrona-cli',
      scope: 'read write deploy',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Device authorization failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as DeviceCodeResponse;
  if (!data.device_code || !data.user_code) {
    throw new Error('Device authorization failed: no usable device code was returned.');
  }

  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri || `${API_URL}/device`,
    verificationUriComplete: data.verification_uri_complete || `${API_URL}/device?user_code=${data.user_code}`,
    expiresIn: data.expires_in || 1800,
    interval: data.interval || 5,
  };
}

/**
 * Poll for the access token until granted.
 *
 * The better-auth device plugin returns a session token as `access_token`
 * (Bearer-usable via the bearer plugin). It does not include a `user` object,
 * so we fetch it from get-session after the exchange.
 */
export async function pollDeviceToken(
  session: DeviceAuthSession,
  onTick?: (elapsed: number) => void
): Promise<UserCredentials> {
  const startTime = Date.now();
  const timeoutMs = session.expiresIn * 1000;

  while (Date.now() - startTime < timeoutMs) {
    if (onTick) {
      onTick(Math.floor((Date.now() - startTime) / 1000));
    }

    await new Promise((r) => setTimeout(r, session.interval * 1000));

    const res = await fetch(`${API_URL}/api/auth/device/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: session.deviceCode,
        client_id: 'chrona-cli',
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as DeviceTokenResponse;
      const accessToken = data.access_token;
      if (!accessToken) {
        throw new Error('Device authorization returned no access token.');
      }
      const expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
      const user = await fetchCurrentUser(accessToken);
      return { accessToken, expiresAt, user };
    }

    const err = (await res.json().catch(() => ({}))) as { error?: string };
    if (err.error === 'authorization_pending') {
      continue;
    }
    if (err.error === 'slow_down') {
      session.interval += 5;
      continue;
    }
    if (err.error === 'access_denied') {
      throw new Error('Device authorization denied. Try `chrona login` again.');
    }
    if (err.error === 'expired_token') {
      throw new Error('Device code expired. Please try `chrona login` again.');
    }
  }

  throw new Error('Device authorization timed out. Please try `chrona login` again.');
}

/**
 * Fetch the signed-in user for a Bearer session token via get-session.
 */
async function fetchCurrentUser(accessToken: string): Promise<UserCredentials['user']> {
  const res = await fetch(`${API_URL}/api/auth/get-session`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Authenticated, but failed to fetch session (${res.status}).`);
  }
  const data = (await res.json()) as { user?: { id: string; email: string; name?: string } } | null;
  if (!data?.user) {
    throw new Error('Authenticated, but session returned no user.');
  }
  return data.user;
}
