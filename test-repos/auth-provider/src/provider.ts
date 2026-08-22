export interface OAuthOptions {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes?: string[];
}

export class OAuthProvider {
  private options: OAuthOptions;

  constructor(options: OAuthOptions) {
    this.options = options;
  }

  getAuthorizationUrl(): string {
    return `https://auth.example.com/oauth/authorize?client_id=${this.options.clientId}`;
  }

  async exchangeCode(code: string): Promise<{ accessToken: string }> {
    return { accessToken: `tok_${code}` };
  }
}
