import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as http from 'node:http';
import { runChronaDaemon } from '../src/commands/daemon';
import type { TaskWorkspacePacket } from '@chrona-engine/engine';

describe('Chrona Living Reality Daemon & Agent API', () => {
  let tempDir: string;
  let server: http.Server;
  let port: number;

  beforeEach(async () => {
    tempDir = path.join(process.cwd(), '.chrona-daemon-test-' + Math.random().toString(36).slice(2, 8));
    fs.mkdirSync(tempDir, { recursive: true });

    // Mock codebase file
    fs.writeFileSync(
      path.join(tempDir, 'auth.ts'),
      `export function verifyAuth(token: string): boolean {
  if (!token) throw new Error('Token required');
  return true;
}`
    );

    port = 4900 + Math.floor(Math.random() * 500);
    server = await runChronaDaemon({ cwd: tempDir, port, host: '127.0.0.1' });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('serves health endpoint and returns valid reality metadata', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.status).toBe('ok');
    expect(json.version).toBe('0.2.0');
    expect(json.snapshotId).toBeDefined();
    expect(json.totalModules).toBeGreaterThanOrEqual(1);
    expect(json.totalContracts).toBeGreaterThanOrEqual(1);
  });

  it('projects TaskWorkspacePacket and performs staleness assertion over HTTP', async () => {
    // 1. Project workspace packet
    const projectRes = await fetch(`http://127.0.0.1:${port}/workspace/project`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task: 'Verify token authentication', target: 'auth.ts', tokenBudget: 4000 }),
    });

    expect(projectRes.status).toBe(200);
    const packet: TaskWorkspacePacket = await projectRes.json();
    expect(packet.workspaceId).toBeDefined();
    expect(packet.snapshotId).toBeDefined();
    expect(packet.reality.target.file).toBe('auth.ts');

    // 2. Check staleness
    const stalenessRes = await fetch(`http://127.0.0.1:${port}/workspace/check-staleness`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packet }),
    });

    expect(stalenessRes.status).toBe(200);
    const stalenessJson = await stalenessRes.json();
    expect(stalenessJson.isStale).toBe(false);
    expect(stalenessJson.severity).toBe('NONE');

    // 3. Assert OCC valid
    const assertRes = await fetch(`http://127.0.0.1:${port}/workspace/assert-not-stale`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packet }),
    });

    expect(assertRes.status).toBe(200);
    const assertJson = await assertRes.json();
    expect(assertJson.valid).toBe(true);
  });
});
