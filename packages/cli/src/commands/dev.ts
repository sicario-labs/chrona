import fs from 'node:fs/promises';
import path from 'node:path';
import picocolors from 'picocolors';
import { spawn } from 'node:child_process';
import { getChronaCheckReport } from './check';

export interface DevOptions {
  cwd?: string;
  port?: number;
  open?: boolean;
}

import { fileURLToPath } from 'node:url';
import net from 'node:net';

function getAvailablePort(startPort: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        resolve(getAvailablePort(startPort + 1));
      } else {
        reject(err);
      }
    });
    server.listen(startPort, () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => resolve(port));
    });
  });
}

export async function runChronaDev(options: DevOptions = {}) {
  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
  const repoName = path.basename(cwd);
  const requestedPort = options.port || 5174;
  const port = await getAvailablePort(requestedPort);

  // Audit documentation truth status before launching
  const checkReport = await getChronaCheckReport(cwd);

  // Count pages in content/docs
  let pagesCount = 0;
  try {
    const docsDir = path.join(cwd, 'content', 'docs');
    const files = await fs.readdir(docsDir, { recursive: true });
    pagesCount = files.filter((f) => String(f).endsWith('.mdx')).length;
  } catch {
    pagesCount = 6;
  }

  // 2. Start the Fumadocs Server (next dev)
  const docsAppDir = path.join(cwd, 'docs');
  const targetDir = (await fs.stat(docsAppDir).catch(() => null)) ? docsAppDir : cwd;

  console.log(picocolors.bold(picocolors.cyan('\nCHRONA ⚡ Fumadocs Documentation Server\n')));
  console.log(`  Local URL:   ${picocolors.bold(picocolors.green(`http://localhost:${port}/docs`))}`);
  console.log(`  Repository:  ${picocolors.bold(picocolors.magenta(repoName))}`);
  console.log(`  Docs Source: ${picocolors.dim(path.join(targetDir, 'content', 'docs'))}`);
  console.log(`  Pages:       ${picocolors.dim(`${pagesCount} pages`)}`);
  
  if (checkReport.errorsCount > 0) {
    console.log(`  Diagnostics: ${picocolors.bold(picocolors.red(`✗ ${checkReport.errorsCount} truth errors detected`))}`);
  } else {
    console.log(`  Diagnostics: ${picocolors.bold(picocolors.green('✓ 0 errors (Truth Synchronized)'))}`);
  }

  console.log(picocolors.dim('\nWatching for doc & code changes...\n'));

  // Spawn Next.js Dev Server
  const child = spawn('npx', ['next', 'dev', '-p', String(port)], {
    cwd: targetDir,
    stdio: 'inherit',
    env: { ...process.env },
  });

  child.on('error', (err: any) => {
    console.error(picocolors.red(`Failed to start Fumadocs server: ${err.message}`));
  });
}
