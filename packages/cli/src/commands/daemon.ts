import * as http from 'node:http';
import * as path from 'node:path';
import * as fs from 'node:fs';
import picocolors from 'picocolors';
import {
  RealityStore,
  AdapterRegistry,
  ChronaLivingRealityWatcher,
  SnapshotBuilder,
  WorkspaceProjector,
  ContextStalenessDetector,
  type TaskWorkspacePacket,
} from '@chrona-engine/engine';

export interface DaemonOptions {
  cwd?: string;
  port?: number;
  host?: string;
}

export async function runChronaDaemon(options: DaemonOptions = {}): Promise<http.Server> {
  const rootDir = options.cwd || process.cwd();
  const port = options.port || 4790;
  const host = options.host || '127.0.0.1';

  console.log(picocolors.bold(picocolors.cyan(`\n⚡ CHRONA AGENT REALITY DAEMON (v0.2.0)`)));
  console.log(picocolors.dim(`Repository: ${rootDir}`));
  console.log(picocolors.dim(`Initializing persistent RealityStore & Living Reality Watcher...\n`));

  const store = new RealityStore(rootDir);
  const adapters = new AdapterRegistry();
  const builder = new SnapshotBuilder(rootDir, store);
  const projector = new WorkspaceProjector(rootDir);

  // Baseline compilation
  const baselineSnapshot = await builder.buildSnapshot();
  const watcher = new ChronaLivingRealityWatcher(rootDir, store, adapters);

  // SSE client connections
  const sseClients = new Set<http.ServerResponse>();

  watcher.on('snapshot_advanced', (data) => {
    broadcastSSE('snapshot_advanced', data);
  });

  watcher.on('workspace_staleness', (data) => {
    broadcastSSE('workspace_staleness', data);
  });

  watcher.on('critical_invalidation', (data) => {
    broadcastSSE('critical_invalidation', data);
  });

  function broadcastSSE(event: string, data: any) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of sseClients) {
      try {
        client.write(payload);
      } catch {
        sseClients.delete(client);
      }
    }
  }

  // Setup FS Watcher
  const supportedExts = new Set(adapters.getSupportedExtensions());
  let pendingFiles = new Set<string>();
  let debounceTimer: NodeJS.Timeout | null = null;

  fs.watch(rootDir, { recursive: true }, (eventType, filename) => {
    if (!filename) return;
    const norm = filename.replace(/\\/g, '/');

    if (
      norm.includes('node_modules/') ||
      norm.includes('.git/') ||
      norm.includes('.chrona/') ||
      norm.includes('dist/') ||
      norm.includes('.turbo/') ||
      norm.endsWith('.d.ts')
    ) {
      return;
    }

    const ext = path.extname(filename).toLowerCase();
    if (!supportedExts.has(ext) && !norm.endsWith('.md') && !norm.endsWith('.mdx')) {
      return;
    }

    pendingFiles.add(norm);

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const filesToProcess = Array.from(pendingFiles);
      pendingFiles.clear();
      try {
        await watcher.handleFileChanges(filesToProcess);
      } catch {}
    }, 200);
  });

  // HTTP & JSON-RPC Daemon Server
  const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || `${host}:${port}`}`);

    // 1. Health & Status
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          version: '0.2.0',
          snapshotId: watcher.getCurrentSnapshotId(),
          activeWorkspaces: watcher.getActiveWorkspaceCount(),
          totalModules: store.getDependencyGraph().totalModules,
          totalContracts: store.getContracts().length,
        })
      );
      return;
    }

    // 2. Real-time Server-Sent Events (SSE) Stream
    if (req.method === 'GET' && url.pathname === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write(`data: ${JSON.stringify({ message: 'Connected to Chrona Living Reality Event Stream', snapshotId: watcher.getCurrentSnapshotId() })}\n\n`);
      sseClients.add(res);

      req.on('close', () => {
        sseClients.delete(res);
      });
      return;
    }

    // Parse JSON body for POST requests
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });

    req.on('end', async () => {
      try {
        const json = body ? JSON.parse(body) : {};

        // 3. Project Task Workspace Packet
        if (req.method === 'POST' && url.pathname === '/workspace/project') {
          const freshSnapshot = await builder.buildSnapshot();
          const packet = await projector.project(freshSnapshot, {
            task: json.task || 'General task',
            target: json.target,
            tokenBudget: json.tokenBudget || 8000,
          });

          // Automatically subscribe workspace if requested
          if (json.subscribe !== false) {
            watcher.registerWorkspace(packet);
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(packet));
          return;
        }

        // 4. Check Staleness
        if (req.method === 'POST' && url.pathname === '/workspace/check-staleness') {
          const packet: TaskWorkspacePacket = json.packet;
          if (!packet) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing packet in request body' }));
            return;
          }

          const report = ContextStalenessDetector.check(packet, store);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(report));
          return;
        }

        // 5. Assert Not Stale (Optimistic Concurrency Control)
        if (req.method === 'POST' && url.pathname === '/workspace/assert-not-stale') {
          const packet: TaskWorkspacePacket = json.packet;
          if (!packet) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing packet in request body' }));
            return;
          }

          try {
            ContextStalenessDetector.assertNotStale(packet, store);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ valid: true, snapshotId: watcher.getCurrentSnapshotId() }));
          } catch (err: any) {
            res.writeHead(409, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ valid: false, error: err.message, report: err.report }));
          }
          return;
        }

        // 6. Subscribe Workspace
        if (req.method === 'POST' && url.pathname === '/workspace/subscribe') {
          const packet: TaskWorkspacePacket = json.packet;
          if (packet) {
            watcher.registerWorkspace(packet);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ subscribed: true, workspaceId: packet.workspaceId }));
            return;
          }
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      console.log(picocolors.green(`✓ Chrona Living Reality Daemon running at http://${host}:${port}`));
      console.log(`  • SSE Event Stream: ${picocolors.cyan(`http://${host}:${port}/events`)}`);
      console.log(`  • Health & Status:  ${picocolors.cyan(`http://${host}:${port}/health`)}`);
      console.log(`  • Project Context:  ${picocolors.cyan(`POST http://${host}:${port}/workspace/project`)}`);
      console.log(picocolors.dim('\nReady for external agent connections (Claude Code, Cursor, Cline, Windsurf)...\n'));
      resolve(server);
    });
  });
}
