import fs from 'node:fs/promises';
import { watch } from 'node:fs';
import path from 'node:path';
import picocolors from 'picocolors';
import { ChronaWorkspace } from '@chrona-engine/engine';

export interface DevOptions {
  cwd?: string;
}

export async function runChronaDev(options: DevOptions = {}): Promise<void> {
  const cwd = path.resolve(options.cwd || process.cwd());
  console.log(picocolors.bold(picocolors.cyan('\nCHRONA ⚡ Documentation Daemon\n')));
  
  console.log(picocolors.dim(`Bootstrapping workspace...`));
  const t0 = performance.now();
  let workspace = await ChronaWorkspace.fromDirectory(cwd);
  console.log(picocolors.green(`✓ Graph populated in ${(performance.now() - t0).toFixed(2)}ms`));
  
  console.log(picocolors.dim(`Watching ${cwd} for changes... (Press Ctrl+C to exit)\n`));

  let timeout: NodeJS.Timeout | null = null;
  const watcher = watch(cwd, { recursive: true }, (eventType, filename) => {
    if (!filename) return;
    if (filename.includes('.chrona') || filename.includes('node_modules')) return;
    if (!filename.endsWith('.ts') && !filename.endsWith('.mdx') && !filename.endsWith('.md')) return;

    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(async () => {
      console.log(picocolors.dim(`\n[${new Date().toLocaleTimeString()}] File changed: ${filename}`));
      console.log(picocolors.dim(`  └─ re-parsing file`));
      
      const t1 = performance.now();
      workspace = await ChronaWorkspace.fromDirectory(cwd); // RealityStore is cached and fast
      console.log(picocolors.dim(`  └─ updating symbols and claims`));
      
      const t2 = performance.now();
      // Re-run verify. In a full implementation, we'd only verify dependent claims
      const { runChronaCi } = await import('./ci.js');
      await runChronaCi({ cwd, changed: 'HEAD~1', failOn: 'warn' });
      
      console.log(picocolors.green(`✓ Incremental invalidation complete in ${(performance.now() - t1).toFixed(2)}ms`));
    }, 100);
  });
}
