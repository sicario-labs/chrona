import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'node:path';
import { ChronaApiServer } from '../src/server';

describe('Chrona Truth Cloud API Server', () => {
  let server: ChronaApiServer;
  const port = 4567;
  const baseUrl = `http://localhost:${port}`;
  const rootDir = path.resolve(__dirname, '../../../test-repos/radix3');

  beforeAll(async () => {
    server = new ChronaApiServer({ port });
    await server.listen(port);
  });

  afterAll(async () => {
    await server.close();
  });

  it('serves dynamic SVG status badges over HTTP', async () => {
    const res = await fetch(`${baseUrl}/badges/chrona/radix3/status.svg?status=verified`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/svg+xml');
    const svg = await res.text();
    expect(svg).toContain('<svg');
    expect(svg).toContain('verified');
  });

  it('accepts verification ingestion and returns receipt', async () => {
    const res = await fetch(`${baseUrl}/api/v1/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        org: 'chrona',
        repo: 'radix3',
        cwd: rootDir,
        plan: 'pro',
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { receiptId: string; status: string; summary: unknown };
    expect(body.receiptId).toContain('rec_');
    expect(body.status).toBeDefined();
    expect(body.summary).toBeDefined();
  });

  it('serves project status and metrics via API', async () => {
    const res = await fetch(`${baseUrl}/api/v1/projects/chrona/radix3/status`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { org: string; repo: string; verificationsThisMonth: number };
    expect(body.org).toBe('chrona');
    expect(body.repo).toBe('radix3');
    expect(body.verificationsThisMonth).toBeGreaterThanOrEqual(1);
  });
});
