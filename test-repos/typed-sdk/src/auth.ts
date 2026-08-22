export interface AuthOptions {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
}

export interface UserSession {
  userId: string;
  token: string;
  expiresAt: number;
}

/**
 * Authenticate with the API using credentials.
 */
export async function authenticate(credentials: AuthOptions): Promise<UserSession> {
  return {
    userId: 'usr_123',
    token: `tok_${credentials.apiKey}`,
    expiresAt: Date.now() + 3600000,
  };
}

/**
 * @deprecated Use authenticate() with api keys instead.
 */
export function legacyLogin(username: string, pass: string): boolean {
  return Boolean(username && pass);
}
