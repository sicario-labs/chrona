import { type AuthOptions, type UserSession, authenticate } from './auth';

export interface ClientConfig {
  apiKey: string;
  region?: 'us-east' | 'eu-west';
  retries?: number;
}

export class ApiClient {
  private config: ClientConfig;

  constructor(config: ClientConfig) {
    this.config = config;
  }

  async login(): Promise<UserSession> {
    return authenticate({ apiKey: this.config.apiKey });
  }

  async sendRequest(endpoint: string, data?: unknown): Promise<{ ok: boolean; data: unknown }> {
    return { ok: true, data: { endpoint, payload: data } };
  }
}
