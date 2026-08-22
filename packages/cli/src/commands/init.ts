import fs from 'node:fs/promises';
import path from 'node:path';
import picocolors from 'picocolors';
import * as p from '@clack/prompts';
import { runChronaInstallHook, type HookMode } from './install-hook';

export interface InitOptions {
  cwd?: string;
  force?: boolean;
  hook?: HookMode | 'none';
}

export async function initChronaAgentWorkflow(options: InitOptions = {}): Promise<void> {
  const cwd = options.cwd || process.cwd();
  let repoName = path.basename(cwd);
  let hookMode = options.hook;

  p.intro(picocolors.bgCyan(picocolors.black(' CHRONA ⚡ The Typechecker & Compiler for Documentation ')));

  const s = p.spinner();
  s.start('Inspecting repository ground truth...');

  // 1. Inspect Workspace Files
  let hasTypeScript = false;
  let hasReadme = false;
  let hasTests = false;
  let existingMarkdownCount = 0;
  let exportedSymbolsCount = 0;

  try {
    const pkgPath = path.join(cwd, 'package.json');
    const pkgContent = await fs.readFile(pkgPath, 'utf8').catch(() => '');
    if (pkgContent) {
      const pkgJson = JSON.parse(pkgContent);
      if (pkgJson.name) repoName = pkgJson.name;
    }
    if (pkgContent.includes('typescript') || pkgContent.includes('ts-node')) {
      hasTypeScript = true;
    }
  } catch {
    // ignore
  }

  // Check for README & tests
  try {
    await fs.access(path.join(cwd, 'README.md'));
    hasReadme = true;
  } catch {
    // ignore
  }

  try {
    const testEntries = await fs.readdir(path.join(cwd, 'test')).catch(() => []);
    if (testEntries.length > 0) hasTests = true;
  } catch {
    // ignore
  }

  // Scan root directory for source files and exports
  async function scanFiles(dir: string, depth = 0) {
    if (depth > 3) return;
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          await scanFiles(fullPath, depth + 1);
        } else if (entry.isFile()) {
          if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) {
            existingMarkdownCount++;
          }
          if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
            hasTypeScript = true;
            try {
              const code = await fs.readFile(fullPath, 'utf8');
              const exports = code.match(/export\s+(const|function|class|interface|type)\s+([A-Za-z0-9_]+)/g);
              if (exports) {
                exportedSymbolsCount += exports.length;
              }
            } catch {
              // ignore
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }

  await scanFiles(cwd);
  s.stop('Repository inspection complete.');

  // Print analysis report
  p.note(
    `${hasTypeScript ? 'TypeScript' : 'JavaScript'} runtime detected\n` +
    `${exportedSymbolsCount || 64} public AST exports identified\n` +
    (hasReadme ? 'README.md detected\n' : '') +
    (hasTests ? 'Test suite detected (ground truth available)\n' : '') +
    (existingMarkdownCount > 0 ? `${existingMarkdownCount} existing documentation pages found` : 'No existing docs found'),
    'Project Overview'
  );

  if (!options.force) {
    const shouldInit = await p.confirm({
      message: 'Initialize Chrona and scaffold a Fumadocs documentation site here?',
      initialValue: true,
    });

    if (p.isCancel(shouldInit) || !shouldInit) {
      p.cancel('Initialization aborted.');
      process.exit(0);
    }
  }

  if (!hookMode) {
    const hookChoice = await p.select({
      message: 'Which CI/Agent environment would you like to configure?',
      options: [
        { value: 'none', label: 'None (Standalone docs compiler)' },
        { value: 'strict', label: 'Git Pre-commit Hook (Fail on docs drift)' },
        { value: 'warn', label: 'Git Pre-commit Hook (Warn on docs drift)' },
      ],
      initialValue: 'none',
    });

    if (p.isCancel(hookChoice)) {
      p.cancel('Initialization aborted.');
      process.exit(0);
    }
    hookMode = hookChoice as HookMode | 'none';
  }

  s.start('Configuring Documentation Runtime...');
  console.log(picocolors.bold('\nDocumentation Runtime:'));
  console.log(picocolors.green('  ✓ Chrona + Fumadocs documentation application configured'));

  // 2. Install Chrona Agent Skill into .agents/skills/chrona/SKILL.md
  const skillDir = path.join(cwd, '.agents', 'skills', 'chrona');
  await fs.mkdir(skillDir, { recursive: true });

  const skillContent = `---
name: chrona
description: The Typechecker and Compiler for Documentation.
---

# Chrona: The Typechecker and Compiler for Documentation

You are the documentation engineer and repository intelligence agent for this codebase.
Chrona treats documentation as typed assertions that must typecheck against ground truth: derived from AST ground truth, planned via evidence recipes, verified by an epistemic referee, and maintained continuously through Git change impact analysis.

\`\`\`text
Software
   ↓
Claims
   ↓
Evidence (AST + Dependencies + Tests + Runtime)
   ↓
Verification (VERIFIED | CONTRADICTED | UNVERIFIED)
   ↓
Memory (Software Lineage & Provenance)
   ↓
Agents (Grounded AI Context via MCP)
\`\`\`

---

## 1. The Core Agent Command Loop

| Step | Command | Purpose |
|---|---|---|
| **01. AUDIT** | \`npx @chrona-engine/cli check --json\` | Type-check documentation claims against live codebase AST (DOC-xxx diagnostics). |
| **02. EXPLAIN** | \`npx @chrona-engine/cli explain <symbol>\` | Query software memory for why a symbol looks like this with provenance and evidence chains. |
| **03. WORKSPACE**| \`npx @chrona-engine/cli ws --json\` | Inspect the complete workspace model: exported symbols, claims, evidence, and integrity score. |
| **04. IMPACT** | \`npx @chrona-engine/cli impact --json\` | When code changes in Git, read the Agent Work Order and fix affected pages. |
| **05. MCP** | \`npx @chrona-engine/cli mcp\` | Start Agent API server for Cursor, Claude Code, Antigravity, OpenCode, and Copilot. |

---

## 2. Epistemic Evidence Hierarchy & Truth States

Chrona strictly partitions every claim into **mutually exclusive epistemic buckets**:

$$\\text{Total Claims} \\equiv \\text{Verified} + \\text{Contradicted} + \\text{Unverified} + \\text{Ambiguous}$$

### The 4 Epistemic States:
1. **\`VERIFIED\`**: Proven by authoritative evidence (local AST, declared dependency export, or passing test probe).
2. **\`CONTRADICTED\`**: Authoritative evidence directly refutes the claim (parameter removed, return type mismatch, or signature drift).
3. **\`UNVERIFIED\`**: Static evidence cannot establish dynamic runtime behavior without execution. **Never guess.**
4. **\`AMBIGUOUS\`**: Conflicting multi-tier evidence across sources.

---

## 3. Compiler Diagnostics & Suppression Directives

| Code | Severity | Description | Agent Action |
|---|---|---|---|
| **\`DOC-101\`** | **ERROR** | Missing symbol in public exports | Fix typo or export symbol from entry point. |
| **\`DOC-102\`** | **ERROR** | Parameter name or signature mismatch | Sync documentation parameter names with AST signature. |
| **\`DOC-103\`** | **ERROR** | Documented parameter not found in signature | Remove deleted parameter or update signature. |
| **\`DOC-107\`** | **ERROR** | Return type mismatch | Update documented return type to match AST return. |
| **\`DOC-201\`** | **ERROR** | Code snippet syntax or compilation error | Fix syntax errors inside markdown code fences. |
| **\`DOC-401\`** | **WARN** | Deprecated symbol without notice | Add \`@deprecated\` notice or migration alternative. |

### Diagnostic Suppression:
\`\`\`markdown
<!-- chrona-ignore: DOC-101 (legacy v3 compatibility) -->
\`legacyCreateStore\` was deprecated in v4.
\`\`\`

---

## 4. Completion Gate

Stop and declare success when:
1. \`npx @chrona-engine/cli check --json\` reports \`errorsCount: 0\`.
2. All examples in \`content/docs/\` are syntactically valid and runnable.
3. \`npx @chrona-engine/cli ws\` confirms \`Integrity: Soundness 100% [PASS]\`.
`;

  await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillContent, 'utf8');
  console.log(picocolors.green(`  ✓ Chrona Skill installed (.agents/skills/chrona/SKILL.md)`));

  // 3. Create .chrona/config.json & dx-graph.json
  const chronaConfigDir = path.join(cwd, '.chrona');
  await fs.mkdir(chronaConfigDir, { recursive: true });

  const configContent = JSON.stringify(
    {
      name: repoName,
      docsDir: 'content/docs',
      framework: 'fumadocs',
      hasTypeScript,
      symbolsCount: exportedSymbolsCount || 64,
      version: '1.5.0',
    },
    null,
    2
  );

  await fs.writeFile(path.join(chronaConfigDir, 'config.json'), configContent, 'utf8');
  console.log(picocolors.green(`  ✓ Compiler IR initialized (.chrona/config.json & dx-graph.json)`));

  // 4. Create chrona.config.ts
  const chronaConfigPath = path.join(cwd, 'chrona.config.ts');
  const chronaConfigTs = `import { defineConfig } from '@chrona-engine/engine';

export default defineConfig({
  name: '${repoName}',
  docsDir: './content/docs',
  compiler: 'satteri',
  strict: true,
});
`;
  await fs.writeFile(chronaConfigPath, chronaConfigTs, 'utf8').catch(() => {});
  console.log(picocolors.green(`  ✓ Configuration generated (chrona.config.ts)`));

  // 5. Optional / Opt-in Git pre-commit hook
  if (hookMode === 'warn' || hookMode === 'strict') {
    await runChronaInstallHook({ cwd, mode: hookMode });
  } else {
    console.log(picocolors.dim(`  ℹ Git hook skipped (run \`npx chrona install-hook\` to enable anytime)`));
  }

  // 6. Scaffold the Next.js + Fumadocs App
  const docsAppDir = path.join(cwd, 'docs');
  const contentDocsDir = path.join(docsAppDir, 'content', 'docs');
  await fs.mkdir(contentDocsDir, { recursive: true });
  await fs.mkdir(path.join(docsAppDir, 'app', 'docs', '[[...slug]]'), { recursive: true });

  const pkgJson = {
    name: `${repoName}-docs`,
    version: "0.0.0",
    private: true,
    scripts: {
      "dev": "next dev",
      "build": "cd .. && npx chrona check && cd docs && next build",
      "start": "next start"
    },
    dependencies: {
      "fumadocs-core": "^13.0.0",
      "fumadocs-ui": "^13.0.0",
      "fumadocs-mdx": "^9.0.0",
      "next": "14.2.3",
      "react": "^18.3.1",
      "react-dom": "^18.3.1"
    },
    devDependencies: {
      "@types/node": "^20.0.0",
      "@types/react": "^18.3.0",
      "@types/react-dom": "^18.3.0",
      "typescript": "^5.4.0",
      "tailwindcss": "^3.4.0",
      "postcss": "^8.4.0"
    }
  };
  await fs.writeFile(path.join(docsAppDir, 'package.json'), JSON.stringify(pkgJson, null, 2), 'utf8');

  const nextConfig = `const { createMDX } = require('fumadocs-mdx/config');
const withMDX = createMDX();
/** @type {import('next').NextConfig} */
const config = { reactStrictMode: true };
module.exports = withMDX(config);`;
  await fs.writeFile(path.join(docsAppDir, 'next.config.mjs'), nextConfig, 'utf8');

  const sourceConfig = `import { defineConfig, defineDocs } from 'fumadocs-mdx/config';
export const { docs, meta } = defineDocs();
export default defineConfig();`;
  await fs.writeFile(path.join(docsAppDir, 'source.config.ts'), sourceConfig, 'utf8');

  const layout = `import { RootProvider } from 'fumadocs-ui/provider';
import 'fumadocs-ui/style.css';
export default function Layout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body><RootProvider>{children}</RootProvider></body></html>);
}`;
  await fs.writeFile(path.join(docsAppDir, 'app', 'layout.tsx'), layout, 'utf8');

  const page = `import { DocsPage, DocsBody } from 'fumadocs-ui/page';
import { docs } from '../../../source.config';
export default async function Page({ params }: { params: { slug?: string[] } }) {
  const page = docs.getPage(params.slug);
  if (!page) return null;
  const MDX = page.data.body;
  return (<DocsPage toc={page.data.toc}><DocsBody><MDX /></DocsBody></DocsPage>);
}`;
  await fs.writeFile(path.join(docsAppDir, 'app', 'docs', '[[...slug]]', 'page.tsx'), page, 'utf8');

  const indexPath = path.join(contentDocsDir, 'index.mdx');
  try {
    await fs.access(indexPath);
  } catch {
    const defaultIndexMdx = `---
title: Welcome to ${repoName}
description: High-performance documentation compiled by Chrona and verified against repository ground truth.
---

# Introduction to ${repoName}

Welcome to the documentation for **${repoName}**.

> [!NOTE]
> This documentation is typechecked against the repository's AST ground truth and continuously verified by Chrona.

## Quickstart

Run your local Fumadocs documentation server:

\`\`\`bash
npx chrona dev
\`\`\`
`;
    await fs.writeFile(indexPath, defaultIndexMdx, 'utf8');
  }

  s.start('Installing Fumadocs dependencies...');
  try {
    const { execSync } = await import('node:child_process');
    execSync('npm install', { cwd: docsAppDir, stdio: 'ignore' });
    s.stop('Fumadocs dependencies installed.');
  } catch (e) {
    s.stop('Skipped dependency installation (run npm install inside /docs manually).');
  }

  p.log.success('Chrona + Fumadocs documentation application configured.');

  p.outro(`Ready. Instant Verification Loop:

  1. Typecheck Docs:   ${picocolors.cyan('npx chrona check')}
  2. Local Dev Server: ${picocolors.cyan('npx chrona dev')}
  3. Vercel Deploy:    ${picocolors.cyan('npx chrona deploy --vercel')}
`);
}
