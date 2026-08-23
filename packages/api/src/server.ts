import * as http from 'node:http';
import { generateBadgeSvg } from './badge/generator';
import { checkQuota, type TierPlan } from './pricing';
import { DocumentationVerifier, type VerificationResult } from '@chrona-engine/engine';
import { App } from '@octokit/app';
import { createNodeMiddleware } from '@octokit/webhooks';

export interface ProjectRecord {
  org: string;
  repo: string;
  plan: TierPlan;
  lastVerification?: VerificationResult;
  verificationCount: number;
  repoCount: number;
}

export interface ApiServerOptions {
  port?: number;
  storage?: Map<string, ProjectRecord>;
  githubAppId?: string;
  githubPrivateKey?: string;
  githubWebhookSecret?: string;
}

/**
 * Lightweight Chrona Truth Cloud Verification API Server
 */
export class ChronaApiServer {
  private server: http.Server;
  private storage: Map<string, ProjectRecord>;
  private port: number;
  private githubApp?: App;
  private webhookMiddleware?: any;

  constructor(options: ApiServerOptions = {}) {
    this.port = options.port || 3000;
    this.storage = options.storage || new Map();

    if (options.githubAppId && options.githubPrivateKey && options.githubWebhookSecret) {
      this.githubApp = new App({
        appId: options.githubAppId,
        privateKey: options.githubPrivateKey,
        webhooks: {
          secret: options.githubWebhookSecret
        }
      });

      this.githubApp.webhooks.on('pull_request.opened', async ({ octokit, payload }) => {
         console.log(`Received PR opened event for #${payload.pull_request.number}`);
         await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments', {
           owner: payload.repository.owner.login,
           repo: payload.repository.name,
           issue_number: payload.pull_request.number,
           body: `ðŸ‘‹ **Chrona Truth Referee** has acknowledged this pull request!\n\n_I will monitor your documentation claims for drift._`
         });
      });

      this.githubApp.webhooks.on('pull_request.synchronize', async ({ octokit, payload }) => {
         console.log(`Received PR synchronized event for #${payload.pull_request.number}`);
      });

      this.webhookMiddleware = createNodeMiddleware(this.githubApp.webhooks, { path: '/api/webhook' });
    }

    this.server = http.createServer(async (req, res) => {
      // Intercept webhooks
      if (this.webhookMiddleware && req.url?.startsWith('/api/webhook')) {
         return this.webhookMiddleware(req, res);
      }

      try {
        await this.handleRequest(req, res);
      } catch (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            error: 'Internal Server Error',
            message: err instanceof Error ? err.message : 'Unknown error',
          })
        );
      }
    });
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', `http://localhost:${this.port}`);
    const pathname = url.pathname;

    // 1. SVG Status Badges: GET /badges/:org/:repo/status.svg
    const badgeMatch = pathname.match(/^\/badges\/([^/]+)\/([^/]+)\/status\.svg$/);
    if (badgeMatch && req.method === 'GET') {
      const [, org, repo] = badgeMatch;
      const key = `${org}/${repo}`;
      const record = this.storage.get(key);

      const label = url.searchParams.get('label') || 'truth';
      const statusParam = url.searchParams.get('status');

      let status: 'verified' | 'drifted' | 'failing' | 'unknown' = 'unknown';
      let passRate: number | undefined;

      if (statusParam) {
        status = statusParam as typeof status;
      } else if (record?.lastVerification) {
        const v = record.lastVerification;
        const total = v.summary.claimsVerified + v.summary.contradictionsFound;
        passRate = total > 0 ? v.summary.claimsVerified / total : 1.0;
        status = v.status === 'pass' ? 'verified' : v.status === 'warn' ? 'drifted' : 'failing';
      }

      const svg = generateBadgeSvg({
        label,
        status,
        passRate,
      });

      res.statusCode = 200;
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.end(svg);
      return;
    }

    // 2. Project Status API: GET /api/v1/projects/:org/:repo/status
    const statusMatch = pathname.match(/^\/api\/v1\/projects\/([^/]+)\/([^/]+)\/status$/);
    if (statusMatch && req.method === 'GET') {
      const [, org, repo] = statusMatch;
      const key = `${org}/${repo}`;
      const record = this.storage.get(key);

      if (!record) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Project not found' }));
        return;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          org: record.org,
          repo: record.repo,
          plan: record.plan,
          lastVerification: record.lastVerification || null,
          verificationsThisMonth: record.verificationCount,
        })
      );
      return;
    }

    // 3. Verification Ingestion API: POST /api/v1/verify
    if (pathname === '/api/v1/verify' && req.method === 'POST') {
      const body = await this.readJsonBody(req);
      const { org, repo, cwd, plan = 'free' } = body as {
        org: string;
        repo: string;
        cwd?: string;
        plan?: TierPlan;
      };

      if (!org || !repo) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Missing org or repo in verification payload' }));
        return;
      }

      const key = `${org}/${repo}`;
      let record = this.storage.get(key);
      if (!record) {
        record = {
          org,
          repo,
          plan,
          verificationCount: 0,
          repoCount: 1,
        };
        this.storage.set(key, record);
      }

      // Check quota limits
      const quota = checkQuota(record.plan, record.repoCount, record.verificationCount + 1);
      if (!quota.allowed) {
        res.statusCode = 429;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Quota Exceeded', reason: quota.reason }));
        return;
      }

      // Run verification worker
      const verifier = new DocumentationVerifier({ cwd: cwd || process.cwd() });
      const verification = await verifier.verifyWorkspace();

      record.lastVerification = verification;
      record.verificationCount += 1;

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          receiptId: `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          status: verification.status,
          summary: verification.summary,
          diagnosticsCount: verification.diagnostics.length,
        })
      );
      return;
    }

    // 4. Fallback 404
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Route not found' }));
  }

  private readJsonBody(req: http.IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (chunk) => {
        data += chunk;
      });
      req.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch (e) {
          reject(e);
        }
      });
      req.on('error', reject);
    });
  }

  listen(port?: number): Promise<void> {
    const targetPort = port || this.port;
    return new Promise((resolve) => {
      this.server.listen(targetPort, () => {
        resolve();
      });
    });
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  getStorage(): Map<string, ProjectRecord> {
    return this.storage;
  }
}


