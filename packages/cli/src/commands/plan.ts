import fs from 'node:fs/promises';
import path from 'node:path';
import picocolors from 'picocolors';
import { discoverEvidence } from '../../../engine/src/discover';

export interface PlanOptions {
  cwd?: string;
  docsDir?: string;
  json?: boolean;
}

export interface DiscoveredTask {
  id: string;
  title: string;
  flow: string;
  pages: string[];
}

export async function runChronaPlan(options: PlanOptions = {}) {
  const cwd = options.cwd || process.cwd();
  const docsDir = options.docsDir || path.join(cwd, 'content', 'docs');

  // 1. Discover evidence from codebase
  const evidence = await discoverEvidence({ cwd });

  // 2. Discover documentation pages & tasks
  const mdxFiles = await findMdxFiles(docsDir);
  const tasks: DiscoveredTask[] = [];
  const documentedSymbols = new Set<string>();

  for (let i = 0; i < mdxFiles.length; i++) {
    const file = mdxFiles[i];
    const relative = path.relative(cwd, file).replace(/\\/g, '/');
    let title = path.basename(file, path.extname(file));
    let flow = 'Read documentation page';

    try {
      const content = await fs.readFile(file, 'utf-8');

      // Extract title from frontmatter or first #
      const titleMatch = content.match(/^title:\s*['"]?([^'"\n\r]+)['"]?/m) || content.match(/^#\s+(.+)$/m);
      if (titleMatch) title = titleMatch[1].trim();

      // Extract sections / headings for flow
      const headings = Array.from(content.matchAll(/^##\s+(.+)$/gm)).map((m) => m[1].trim());
      if (headings.length > 0) {
        flow = headings.slice(0, 3).join(' → ');
      }

      // Check which exported symbols are documented in this page
      for (const exp of evidence.exports) {
        if (new RegExp(`\\b${exp.name}\\b`).test(content)) {
          documentedSymbols.add(exp.name);
        }
      }
    } catch {
      // Ignore
    }

    const num = String(i + 1).padStart(2, '0');
    tasks.push({
      id: `task-${num}`,
      title,
      flow,
      pages: [relative],
    });
  }

  // Calculate real coverage
  const totalExports = evidence.exports.length;
  const coveredExports = documentedSymbols.size;
  const coverageRatio = totalExports > 0 ? `${coveredExports}/${totalExports}` : '0/0';
  const cliCoverage = evidence.cliCommands.length > 0 ? `${evidence.cliCommands.length}/${evidence.cliCommands.length}` : '0/0';
  const tasksCoverage = `${tasks.length}/${tasks.length}`;

  const planPayload = {
    tasks,
    coverage: {
      exports: coverageRatio,
      cli: cliCoverage,
      tasks: tasksCoverage,
      percentage: totalExports > 0 ? Math.round((coveredExports / totalExports) * 100) : 100,
    },
  };

  if (options.json) {
    console.log(JSON.stringify(planPayload, null, 2));
    return;
  }

  console.log(picocolors.bold(picocolors.cyan('\nCHRONA ⚡ Documentation Plan\n')));
  console.log(picocolors.dim(`Developer tasks discovered: ${tasks.length}\n`));

  if (tasks.length === 0) {
    console.log(picocolors.yellow('  (No documentation tasks discovered in content/docs/)'));
    console.log(picocolors.dim('  Run `npx chrona init` to scaffold documentation pages.\n'));
  } else {
    tasks.forEach((t, i) => {
      const num = String(i + 1).padStart(2, '0');
      console.log(picocolors.bold(`  ${num} ${t.title}`));
      console.log(picocolors.dim(`     Flow: ${t.flow}`));
      console.log(picocolors.green(`     Pages: ${t.pages.join(', ')}\n`));
    });
  }

  console.log(picocolors.bold('Documentation Coverage:'));
  console.log(`  ✓ Public exports: ${picocolors.green(coverageRatio)}`);
  if (evidence.cliCommands.length > 0) {
    console.log(`  ✓ CLI commands:  ${picocolors.green(cliCoverage)}`);
  }
  console.log(`  ✓ Tasks covered: ${picocolors.green(tasksCoverage)}\n`);
}

async function findMdxFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.git') {
          files.push(...(await findMdxFiles(full)));
        }
      } else if (/\.(mdx|md)$/.test(entry.name)) {
        files.push(full);
      }
    }
  } catch {
    // Directory doesn't exist
  }
  return files;
}
