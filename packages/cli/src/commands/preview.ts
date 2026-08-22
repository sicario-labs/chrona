import fs from 'node:fs/promises';
import path from 'node:path';
import picocolors from 'picocolors';
import { spawn } from 'node:child_process';

export interface PreviewOptions {
  cwd?: string;
  port?: number;
}

export async function runChronaPreview(options: PreviewOptions = {}) {
  const cwd = options.cwd || process.cwd();
  const port = options.port || 4173;

  console.log(picocolors.bold(picocolors.cyan('\nCHRONA ⚡ Production Preview Server (v1)\n')));
  console.log(`  Local URL: ${picocolors.bold(picocolors.green(`http://localhost:${port}/`))}\n`);

  const docsAppDir = path.join(cwd, 'apps', 'docs');
  const targetDir = (await fs.stat(docsAppDir).catch(() => null)) ? docsAppDir : cwd;

  const child = spawn('npx', ['vite', 'preview', '--port', String(port)], {
    cwd: targetDir,
    stdio: 'inherit',
    shell: true,
  });

  child.on('error', (err) => {
    console.error(picocolors.red('Failed to start Vite preview server:'), err);
  });
}
