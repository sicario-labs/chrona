import * as fs from 'node:fs';
import * as path from 'node:path';
import picocolors from 'picocolors';
import {
  RealityStore,
  AdapterRegistry,
  ChronaLivingRealityWatcher,
  SnapshotBuilder,
} from '@chrona-engine/engine';

export interface WatchCommandOptions {
  cwd?: string;
  debounceMs?: number;
}

export async function runChronaWatch(options: WatchCommandOptions = {}): Promise<void> {
  const rootDir = options.cwd || process.cwd();
  const debounceMs = options.debounceMs || 200;

  console.clear();
  console.log(picocolors.bold(picocolors.cyan('⚡ CHRONA LIVING REALITY WATCHER (v0.2.0)')));
  console.log(picocolors.dim(`Watching repository: ${rootDir}\n`));

  const store = new RealityStore(rootDir);
  const adapters = new AdapterRegistry();
  const builder = new SnapshotBuilder(rootDir, store);

  // Initial full sync
  console.log(picocolors.dim('Compiling baseline software reality snapshot...'));
  const snapshot = await builder.buildSnapshot();

  const watcher = new ChronaLivingRealityWatcher(rootDir, store, adapters);

  const initialGraph = store.getDependencyGraph();
  const initialContracts = store.getContracts();
  const initialSymbols = store.getSnapshot().symbols;

  console.log(picocolors.green(`✓ Baseline Reality Compiled:`));
  console.log(`  • Snapshot ID: ${picocolors.bold(snapshot.id)}`);
  console.log(`  • Modules: ${picocolors.bold(String(initialGraph.totalModules))}`);
  console.log(`  • Indexed Symbols: ${picocolors.bold(String(initialSymbols.size))}`);
  console.log(`  • Active Contracts: ${picocolors.bold(String(initialContracts.length))}`);
  console.log(picocolors.dim('\nListening for filesystem changes (Press Ctrl+C to exit)...\n'));
  console.log('────────────────────────────────────────────────────────────────────────');

  // Event Listeners
  watcher.on('snapshot_advanced', ({ previousSnapshotId, newSnapshotId, changedFiles }) => {
    const time = new Date().toLocaleTimeString();
    console.log(
      `${picocolors.dim(`[${time}]`)} ${picocolors.green('SNAPSHOT ADVANCED')} ` +
      `${picocolors.dim(previousSnapshotId)} → ${picocolors.bold(newSnapshotId)} ` +
      `(${changedFiles.length} file(s) modified: ${changedFiles.join(', ')})`
    );
  });

  watcher.on('workspace_staleness', ({ workspaceId, report }) => {
    const time = new Date().toLocaleTimeString();
    const color = report.severity === 'CRITICAL' ? picocolors.red : report.severity === 'HIGH' ? picocolors.yellow : picocolors.blue;
    console.log(
      `${picocolors.dim(`[${time}]`)} ${color(`STALENESS [${report.severity} / ${report.scope}]`)} ` +
      `Workspace: ${workspaceId} | Reasons: ${report.reasons.join(', ')}`
    );
  });

  watcher.on('critical_invalidation', ({ workspaceId, report }) => {
    const time = new Date().toLocaleTimeString();
    console.log(
      `${picocolors.dim(`[${time}]`)} ${picocolors.bgRed(picocolors.white(' CRITICAL INVALIDATION '))} ` +
      `Agent workspace ${workspaceId} target mutated: ${report.affectedTargetFiles.join(', ')}. Agent recompile mandatory.`
    );
  });

  // Native Filesystem Watcher with debounce
  const supportedExts = new Set(adapters.getSupportedExtensions());
  let pendingFiles = new Set<string>();
  let debounceTimer: NodeJS.Timeout | null = null;

  const fsWatcher = fs.watch(rootDir, { recursive: true }, (eventType, filename) => {
    if (!filename) return;
    const norm = filename.replace(/\\/g, '/');

    // Skip ignored directories
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
      } catch (err: any) {
        console.error(picocolors.red(`Watcher sync error: ${err.message}`));
      }
    }, debounceMs);
  });

  const cleanup = () => {
    console.log(picocolors.yellow('\nStopping Chrona Living Reality Watcher...'));
    fsWatcher.close();
    store.close();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}
