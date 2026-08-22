#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import { createOrLoadConfig } from '@/config';
import { type JsonTreeNode, treeToJavaScript, treeToMdx } from '@/commands/file-tree';
import { runTree } from '@/utils/file-tree/run-tree';
import packageJson from '../package.json';
import { customise } from '@/commands/customise';
import { add } from '@/commands/add';
import { exportEpub } from '@/commands/export-epub';
import { initChronaAgentWorkflow } from '@/commands/init';
import { runChronaLogin } from '@/commands/login';
import {
  runChronaAuthCreateKey,
  runChronaAuthListKeys,
  runChronaAuthRevokeKey,
} from '@/commands/auth-keys';
import { runChronaDev } from '@/commands/dev';
import { runChronaBuild } from '@/commands/build';
import { runBuildWorker } from '@/commands/build-worker';
import { runChronaPreview } from '@/commands/preview';
import { runChronaDiscover } from '@/commands/discover';
import { runChronaPlan } from '@/commands/plan';
import { runChronaImpact } from '@/commands/impact';
import { runChronaCheck } from '@/commands/check';
import { runChronaCi } from '@/commands/ci';
import { runChronaBench } from '@/commands/bench';
import { runChronaDeploy } from '@/commands/deploy';
import { runChronaLs } from '@/commands/ls';
import { runChronaRollback } from '@/commands/rollback';
import {
  runChronaEnvSet,
  runChronaEnvList,
  runChronaEnvGet,
  runChronaEnvUnset,
} from '@/commands/env';
import { runChronaInstallHook, type HookMode } from '@/commands/install-hook';
import { runChronaRepair } from './commands/repair';
import { runChronaUpgrade } from './commands/upgrade';
import { runChronaWatch } from './commands/watch';
import { runChronaDaemon } from './commands/daemon';
import { runMcpServer } from '@/commands/mcp';
import { runChronaBadge } from '@/commands/badge';
import { runChronaAudit } from '@/commands/audit';
import { runChronaWorkspace } from '@/commands/workspace';
import { runChronaExplain } from '@/commands/explain';
import { runChronaWhy } from '@/commands/why';
import { runChronaProve } from '@/commands/prove';
import { runChronaChange } from '@/commands/change';
import { runChronaAsk } from '@/commands/ask';
import { runChronaRemember } from '@/commands/remember';
import { runChronaForget } from '@/commands/forget';
import { runChronaDiff } from '@/commands/diff-epistemic';
import { runChronaVerify } from '@/commands/verify';
import { runMemoryCommand } from '@/commands/memory';
import { runGuardCommand } from './commands/guard';
import { runPublishCommand } from './commands/publish';
import type { AgentPlatform } from '@/mcp/config-generator';
import { HttpRegistryConnector, LocalRegistryConnector } from 'fuma-cli/registry/connector';

const program = new Command().option('--config <string>');

program
  .name('chrona')
  .description('Chrona CLI: The Typechecker and Compiler for Documentation')
  .version(packageJson.version)
  .action(async () => {
    await initChronaAgentWorkflow();
  });

program
  .command('login')
  .description('Authenticate terminal session using RFC 8628 Device Authorization Grant')
  .action(async () => {
    await runChronaLogin();
  });

program
  .command('auth:create-key')
  .description('Create an org-scoped API key (chr_...) for CI/agent deploys')
  .option('--name <name>', 'Human-readable name for the key')
  .action(async (options: { name?: string }) => {
    await runChronaAuthCreateKey(options);
  });

program
  .command('auth:list-keys')
  .description('List the active API keys for your organization')
  .action(async () => {
    await runChronaAuthListKeys();
  });

program
  .command('auth:revoke-key')
  .description('Revoke (invalidate) an API key by id')
  .argument('<id>', 'API key id to revoke')
  .action(async (id: string) => {
    await runChronaAuthRevokeKey({ id });
  });

program
  .command('init')
  .description('Initialize Chrona Fumadocs documentation workspace')
  .option('--cwd <path>', 'Working directory for the repository')
  .option('--force', 'Bypass interactive confirmation prompts')
  .option('--hook <mode>', 'Optional pre-commit hook mode: warn, strict, or none', 'none')
  .action(async (options: { cwd?: string; hook?: HookMode | 'none'; force?: boolean }) => {
    await initChronaAgentWorkflow({ cwd: options.cwd, hook: options.hook, force: options.force });
  });

program
  .command('dev')
  .description('Start local Vite documentation runtime with real-time Code Verification and AI endpoints')
  .option('--cwd <path>', 'Working directory for the repository')
  .option('--port <number>', 'Port for Vite dev server', (val) => parseInt(val, 10), 5174)
  .action(async (options: { cwd?: string; port?: number }) => {
    await runChronaDev({ cwd: options.cwd, port: options.port });
  });

program
  .command('build')
  .description('Audit documentation truth and compile static production bundle with /llms.txt manifests')
  .option('--cwd <path>', 'Working directory for the repository')
  .option('--output <path>', 'Output directory for static assets', 'dist')
  .option('--no-strict', 'Allow build to proceed with non-fatal warnings')
  .action(async (options: { cwd?: string; output?: string; strict?: boolean }) => {
    await runChronaBuild({ cwd: options.cwd, output: options.output, strict: options.strict });
  });

program
  .command('build-worker')
  .description('Fleet build worker: pull queued remote builds, run them, and promote')
  .option('--once', 'Process a single job and exit (for CI runners)')
  .option('--prod', 'Promote builds to production')
  .option('--edge-url <url>', 'Edge worker base URL (defaults to CHRONA_API_URL)')
  .option('--poll-interval <ms>', 'Idle poll interval in ms', (v) => parseInt(v, 10), 5000)
  .action(async (options: { once?: boolean; prod?: boolean; edgeUrl?: string; pollInterval?: number }) => {
    await runBuildWorker({
      once: options.once,
      prod: options.prod,
      edgeUrl: options.edgeUrl,
      pollIntervalMs: options.pollInterval,
    });
  });

program
  .command('preview')
  .description('Preview production static documentation build locally')
  .option('--cwd <path>', 'Working directory for the repository')
  .option('--port <number>', 'Port for preview server', (val) => parseInt(val, 10), 4173)
  .action(async (options: { cwd?: string; port?: number }) => {
    await runChronaPreview({ cwd: options.cwd, port: options.port });
  });

program
  .command('install-hook')
  .description('Install Git pre-commit hook for automated documentation impact analysis')
  .option('--cwd <path>', 'Working directory for the repository')
  .option('--mode <mode>', 'Hook mode: warn (non-blocking) or strict (blocking)', 'warn')
  .action(async (options: { cwd?: string; mode?: HookMode }) => {
    await runChronaInstallHook({ cwd: options.cwd, mode: options.mode });
  });

program
  .command('repair')
  .description('Inspect outstanding documentation debt and execute agent repair work order')
  .option('--cwd <path>', 'Working directory for the repository')
  .option('--json', 'Output repair order as JSON (v1)')
  .action(async (options: { cwd?: string; json?: boolean }) => {
    await runChronaRepair({ cwd: options.cwd, json: options.json });
  });

program
  .command('discover')
  .description('Extract codebase structure, exported symbols, types, and test suites into Evidence Graph')
  .option('--cwd <path>', 'Working directory for the repository')
  .option('--json', 'Output evidence graph as JSON (v1)')
  .action(async (options: { cwd?: string; json?: boolean }) => {
    await runChronaDiscover({ cwd: options.cwd, json: options.json });
  });

program
  .command('plan')
  .description('Inspect compiler intermediate representation (Developer Tasks DAG & coverage)')
  .option('--cwd <path>', 'Working directory for the repository')
  .option('--json', 'Output documentation plan as JSON (v1)')
  .action(async (options: { cwd?: string; json?: boolean }) => {
    await runChronaPlan({ cwd: options.cwd, json: options.json });
  });

program
  .command('impact')
  .description('Calculate documentation impact across the Developer Experience Graph for code commits')
  .option('--cwd <path>', 'Working directory for the repository')
  .option('--commit <hash>', 'Target commit or git ref to calculate impact for')
  .option('--since <ref>', 'Base git ref or commit range (e.g. HEAD~1, main)')
  .option('--base <branch>', 'Base branch to compare against')
  .option('--json', 'Output Agent Work Order as JSON (v1)')
  .action(async (options: { cwd?: string; commit?: string; since?: string; base?: string; json?: boolean }) => {
    await runChronaImpact({
      cwd: options.cwd,
      commit: options.commit,
      since: options.since,
      base: options.base,
      json: options.json,
    });
  });

program
  .command('check')
  .description('Audit documentation against live code with DOC-xxx compiler diagnostics')
  .option('--cwd <path>', 'Working directory for the repository')
  .option('--diff [ref]', 'Only check documentation claims affected by git diff (default: HEAD~1)')
  .option('--since <ref>', 'Alias for --diff <ref>')
  .option('--format <format>', 'Output format: pretty, json, ndjson', 'pretty')
  .option('--stream', 'Stream incremental verification events as NDJSON')
  .option('--json', 'Output verification report as machine-readable JSON protocol (v1)')
  .action(async (options: { cwd?: string; diff?: string | boolean; since?: string; format?: 'pretty' | 'json' | 'ndjson'; stream?: boolean; json?: boolean }) => {
    await runChronaCheck({
      cwd: options.cwd,
      diff: options.diff,
      since: options.since,
      format: options.format,
      stream: options.stream,
      json: options.json,
    });
  });

program
  .command('ci')
  .description('Audit documentation truth gate in CI pipelines with strict exit codes and GitHub annotations')
  .option('--cwd <path>', 'Working directory for the repository')
  .option('--fail-on <severity>', 'Failure threshold: error (default) or warn', 'error')
  .option('--diff [ref]', 'Only check documentation claims affected by git diff (default: HEAD~1)')
  .option('--since <ref>', 'Alias for --diff <ref>')
  .option('--format <format>', 'Output format: pretty, json, ndjson, junit, github')
  .option('--output <path>', 'Write report to output file')
  .action(async (options: { cwd?: string; failOn?: 'error' | 'warn'; diff?: string | boolean; since?: string; format?: 'pretty' | 'json' | 'ndjson' | 'junit' | 'github'; output?: string }) => {
    await runChronaCi({
      cwd: options.cwd,
      failOn: options.failOn,
      diff: options.diff,
      since: options.since,
      format: options.format,
      output: options.output,
    });
  });

program
  .command('bench')
  .description('Measure Developer Task Success Rate (DTSR), Time to First Success, and DX Integrity')
  .option('--cwd <path>', 'Working directory for the repository')
  .option('--json', 'Output benchmark evaluation as JSON (v1)')
  .action(async (options: { cwd?: string; json?: boolean }) => {
    await runChronaBench({ cwd: options.cwd, json: options.json });
  });

program
  .command('mcp')
  .description('Start Chrona Agent API server for Claude Code, Cursor, Antigravity, Kiro, OpenCode, and Copilot')
  .option('--cwd <path>', 'Working directory for the repository')
  .option(
    '--install <platform>',
    'Auto-install MCP configuration for agent (antigravity, claude, cursor, kiro, kilo, opencode, qoder, mimo, deepseek, windsurf, zed, continue, jetbrains, goose, all)'
  )
  .option('--generate <platform>', 'Print MCP configuration for agent platform')
  .option('--scope <scope>', 'Configuration scope: project (default) or user', 'project')
  .action(async (options: { cwd?: string; install?: AgentPlatform; generate?: AgentPlatform; scope?: 'project' | 'user' }) => {
    await runMcpServer({
      cwd: options.cwd,
      install: options.install,
      generate: options.generate,
      scope: options.scope,
    });
  });

program
  .command('badge')
  .description('Generate live Chrona verification status badge markdown for README.md')
  .option('--org <name>', 'GitHub organization or owner', 'owner')
  .option('--repo <name>', 'Repository name', 'repo')
  .option('--host <url>', 'Chrona Cloud API host', 'https://api.chronadocs.xyz')
  .option('--label <text>', 'Custom badge label (default: truth)')
  .option('--format <type>', 'Output format: markdown, html, url', 'markdown')
  .action((options: { org?: string; repo?: string; host?: string; label?: string; format?: 'markdown' | 'html' | 'url' }) => {
    runChronaBadge(options);
  });

program
  .command('audit')
  .description('Run verification audits across real repositories and measure precision scorecards')
  .option('--json', 'Output audit matrix as structured JSON')
  .action(async (options: { json?: boolean }) => {
    await runChronaAudit({ json: options.json });
  });

program
  .command('workspace')
  .alias('ws')
  .description('Inspect the epistemic model of the software workspace: sources, claims, evidence, and integrity')
  .option('--cwd <path>', 'Working directory for the repository')
  .option('--docs-dir <path>', 'Documentation directory path')
  .option('--scope <name>', 'Retrieve verified context for a specific symbol or scope')
  .option('--explain <symbol>', 'Deep epistemic explanation for why a symbol looks like this and why docs drift')
  .option('--task <task>', 'Compile a bounded task workspace packet for an AI coding agent')
  .option('--intent <intent>', 'Intent for task compilation (modify, create, delete, investigate, evaluate, refactor)')
  .option('--target <target>', 'Primary target symbol, endpoint, or file for the task')
  .option('--token-budget <budget>', 'Token budget for materialized source slices', (v) => parseInt(v, 10), 8000)
  .option('--no-source-slices', 'Exclude raw source code slices (emit structured reality, boundary, and contracts only)')
  .option('--json', 'Output full workspace model as structured JSON')
  .action(async (options: {
    cwd?: string;
    docsDir?: string;
    scope?: string;
    explain?: string;
    task?: string;
    intent?: 'modify' | 'create' | 'delete' | 'investigate' | 'evaluate' | 'refactor';
    target?: string;
    tokenBudget?: number;
    sourceSlices?: boolean;
    json?: boolean;
  }) => {
    await runChronaWorkspace({
      ...options,
      includeSourceSlices: options.sourceSlices,
    });
  });

program
  .command('explain')
  .description('Explain why a software symbol looks like this, what docs claim about it, and why drift occurred')
  .argument('<symbol>', 'Symbol or query to explain with epistemic provenance')
  .option('--cwd <path>', 'Working directory for the repository')
  .option('--docs-dir <path>', 'Documentation directory path')
  .option('--json', 'Output explanation as structured JSON')
  .action(async (symbol: string, options: { cwd?: string; docsDir?: string; json?: boolean }) => {
    await runChronaExplain(symbol, options);
  });

program
  .command('deploy')
  .description('Deploy documentation site to Vercel or Chrona Edge')
  .option('--cwd <path>', 'Working directory for the repository')
  .option('--output <path>', 'Output directory for static assets', 'dist')
  .option('--vercel', 'Deploy instantly to Vercel for free')
  .option('--project <name>', 'Project id (defaults to directory name)')
  .option('--bucket <name>', 'R2 bucket to upload to', 'chrona-builds')
  .option('--prod', 'Promote to production (default: first deploy is prod, later deploys preview)')
  .option('--remote', 'Push source and build remotely on the fleet (streams logs)')
  .option('--no-strict', 'Allow deploy to proceed with non-fatal warnings')
  .action(async (options: { cwd?: string; output?: string; vercel?: boolean; project?: string; bucket?: string; strict?: boolean; prod?: boolean; remote?: boolean }) => {
    await runChronaDeploy(options);
  });

program
  .command('ls')
  .description('List deployment history for the current project')
  .option('--cwd <path>', 'Working directory for the repository')
  .option('--project <name>', 'Project id (defaults to directory name)')
  .action(async (options: { cwd?: string; project?: string }) => {
    await runChronaLs(options);
  });

program
  .command('rollback')
  .description('Flip the production alias to a retained deployment (instant, no re-upload)')
  .argument('<token>', 'Deployment id (or prefix) from `chrona ls`')
  .option('--cwd <path>', 'Working directory for the repository')
  .option('--project <name>', 'Project id (defaults to directory name)')
  .option('--bucket <name>', 'R2 bucket to restore to', 'chrona-builds')
  .action(async (token: string, options: { cwd?: string; project?: string; bucket?: string }) => {
    await runChronaRollback(token, options);
  });

const envCmd = program
  .command('env')
  .description('Manage per-project environment variables');

envCmd
  .command('set')
  .description('Set an environment variable for the current project')
  .argument('<key>', 'Variable name')
  .argument('<value>', 'Variable value')
  .option('--cwd <path>', 'Working directory for the repository')
  .option('--project <name>', 'Project id (defaults to directory name)')
  .action(async (key: string, value: string, options: { cwd?: string; project?: string }) => {
    await runChronaEnvSet(key, value, options);
  });

envCmd
  .command('get')
  .description('Get an environment variable for the current project')
  .argument('<key>', 'Variable name')
  .option('--cwd <path>', 'Working directory for the repository')
  .option('--project <name>', 'Project id (defaults to directory name)')
  .action(async (key: string, options: { cwd?: string; project?: string }) => {
    await runChronaEnvGet(key, options);
  });

envCmd
  .command('unset')
  .description('Remove an environment variable for the current project')
  .argument('<key>', 'Variable name')
  .option('--cwd <path>', 'Working directory for the repository')
  .option('--project <name>', 'Project id (defaults to directory name)')
  .action(async (key: string, options: { cwd?: string; project?: string }) => {
    await runChronaEnvUnset(key, options);
  });

envCmd
  .command('ls')
  .description('List environment variables for the current project')
  .option('--cwd <path>', 'Working directory for the repository')
  .option('--project <name>', 'Project id (defaults to directory name)')
  .action(async (options: { cwd?: string; project?: string }) => {
    await runChronaEnvList(options);
  });

program
  .command('customise')
  .alias('customize')
  .description('simple way to customize layouts with Chrona UI')
  .option('--dir <string>', 'the root url or directory to resolve registry')
  .action(async (options: { config?: string; dir?: string }) => {
    const config = await createOrLoadConfig(options.config);
    await customise(config, createClientFromDir(options.dir));
  });

const dirShortcuts: Record<string, string> = {
  ':preview': 'https://preview.chrona.dev/registry',
  ':dev': 'http://localhost:3000/registry',
};

program
  .command('add')
  .description('add a new component to your docs')
  .argument('[components...]', 'components to download')
  .option('--dir <string>', 'the root url or directory to resolve registry')
  .action(async (input: string[], options: { config?: string; dir?: string }) => {
    const config = await createOrLoadConfig(options.config);
    const client = createClientFromDir(options.dir);
    await add(input, client, config);
  });

const exportCmd = program.command('export').description('export documentation to various formats');

exportCmd
  .command('epub')
  .description('export documentation to EPUB format (run after production build)')
  .requiredOption(
    '--framework <name>',
    'framework: next, astro, tanstack-start, react-router, waku',
  )
  .option('--output <path>', 'output file path', 'docs.epub')
  .option('--scaffold-only', 'only scaffold the EPUB route, do not copy')
  .action(async (options: { output?: string; framework: string; scaffoldOnly?: boolean }) => {
    await exportEpub({
      output: options.output,
      framework: options.framework,
      scaffoldOnly: options.scaffoldOnly,
    });
  });

program
  .command('tree')
  .argument('[json_or_args]', 'JSON output of `tree` command or arguments for the `tree` command')
  .argument('[output]', 'output path of file')
  .option('--js', 'output as JavaScript file')
  .option('--no-root', 'remove the root node')
  .option('--import-name <name>', 'where to import components (JS only)')
  .action(
    async (
      str: string | undefined,
      output: string | undefined,
      { js, root, importName }: { js: boolean; root: boolean; importName?: string },
    ) => {
      const jsExtensions = ['.js', '.tsx', '.jsx'];
      const noRoot = !root;
      let nodes: JsonTreeNode[];

      try {
        nodes = JSON.parse(str ?? '') as JsonTreeNode[];
      } catch {
        nodes = await runTree(str ?? './');
      }

      const out =
        js || (output && jsExtensions.includes(path.extname(output)))
          ? treeToJavaScript(nodes, noRoot, importName)
          : treeToMdx(nodes, noRoot);

      if (output) {
        await fs.mkdir(path.dirname(output), { recursive: true });
        await fs.writeFile(output, out);
      } else {
        console.log(out);
      }
    },
  );

function createClientFromDir(dir = 'https://chrona.dev/registry') {
  if (dir in dirShortcuts) dir = dirShortcuts[dir];

  return dir.startsWith('http://') || dir.startsWith('https://')
    ? new HttpRegistryConnector(dir)
    : new LocalRegistryConnector(dir);
}

program
  .command('why <target>')
  .description('Explain why a software symbol or component exists with Git provenance and deletion safety analysis')
  .option('--cwd <path>', 'Working directory')
  .option('--change <intent>', 'Evaluate safety of an intended change or deletion (e.g. "delete session.ts")')
  .option('--json', 'Output raw JSON explanation and safety analysis')
  .action(async (target: string, options: { cwd?: string; change?: string; json?: boolean }) => {
    await runChronaWhy(target, options);
  });

program
  .command('prove <claim>')
  .description('Authoritatively prove or disprove a software claim using multi-tier AST, test, and contract evidence')
  .option('--cwd <path>', 'Working directory')
  .option('--json', 'Output raw JSON proof result')
  .action(async (claim: string, options: { cwd?: string; json?: boolean }) => {
    await runChronaProve(claim, options);
  });

program
  .command('change <request>')
  .description('Plan, execute, and cryptographically verify a software change against the codebase model')
  .option('--cwd <path>', 'Working directory')
  .option('-y, --yes', 'Proceed with migration without interactive confirmation')
  .option('--dry-run', 'Inspect the change boundary and migration model without executing')
  .option('--json', 'Output raw JSON change model and proof receipt')
  .action(async (request: string, options: { cwd?: string; yes?: boolean; dryRun?: boolean; json?: boolean }) => {
    await runChronaChange(request, options);
  });

program
  .command('ask <question>')
  .description('Ask natural-language architectural questions grounded in authoritative codebase evidence')
  .option('--cwd <path>', 'Working directory')
  .option('--json', 'Output raw JSON architecture answer')
  .action(async (question: string, options: { cwd?: string; json?: boolean }) => {
    await runChronaAsk(question, options);
  });

program
  .command('remember <decision>')
  .description('Record an institutional architectural decision with provenance and attach to software memory')
  .option('--cwd <path>', 'Working directory')
  .option('-r, --rationale <rationale>', 'Rationale or context for the decision')
  .option('-t, --tags <tags>', 'Comma-separated tags (e.g. auth,security,database)')
  .option('--json', 'Output raw JSON decision object')
  .action(async (decision: string, options: { cwd?: string; rationale?: string; tags?: string; json?: boolean }) => {
    await runChronaRemember(decision, options);
  });

program
  .command('forget')
  .description('Find software knowledge, claims, contracts, or decisions no longer supported by code reality')
  .option('--cwd <path>', 'Working directory')
  .option('--json', 'Output raw JSON orphaned knowledge report')
  .action(async (options: { cwd?: string; json?: boolean }) => {
    await runChronaForget(options);
  });

program
  .command('diff')
  .description('Inspect changes in the software understanding of itself across commits (contracts, decisions, claims)')
  .option('--cwd <path>', 'Working directory')
  .option('--json', 'Output raw JSON epistemic diff report')
  .action(async (options: { cwd?: string; json?: boolean }) => {
    await runChronaDiff(options);
  });

program
  .command('verify')
  .description('Run complete epistemic verification sweep across all claims, contracts, and decisions with signed proof receipt')
  .option('--cwd <path>', 'Working directory')
  .option('--docs-dir <path>', 'Path to documentation directory')
  .option('--json', 'Output raw JSON verification result and proof receipt')
  .action(async (options: { cwd?: string; docsDir?: string; json?: boolean }) => {
    await runChronaVerify(options);
  });

program
  .command('watch')
  .description('Live interactive terminal dashboard for continuous RealityStore sync and staleness tracking')
  .option('--cwd <path>', 'Working directory for the repository')
  .option('--debounce <ms>', 'Debounce milliseconds for filesystem events (default: 200)')
  .action(async (options: { cwd?: string; debounce?: string }) => {
    await runChronaWatch({ cwd: options.cwd, debounceMs: options.debounce ? parseInt(options.debounce, 10) : undefined });
  });

program
  .command('daemon')
  .description('Start background Chrona Agent Reality Daemon with HTTP, JSON-RPC, SSE, and OCC endpoints')
  .option('--cwd <path>', 'Working directory for the repository')
  .option('--port <number>', 'Port to listen on (default: 4790)')
  .option('--host <host>', 'Host to bind to (default: 127.0.0.1)')
  .action(async (options: { cwd?: string; port?: string; host?: string }) => {
    await runChronaDaemon({
      cwd: options.cwd,
      port: options.port ? parseInt(options.port, 10) : undefined,
      host: options.host,
    });
  });

runMemoryCommand(program);
runGuardCommand(program);
runPublishCommand(program);

program
  .command('upgrade [packageSpec]')
  .description('Compute the semantic differential between two package versions and output an Agent Migration Work Order')
  .option('--from <version>', 'Starting version of the package')
  .option('--to <version>', 'Target version of the package')
  .option('--json', 'Output Migration Work Order as JSON')
  .option('--cwd <path>', 'Working directory for the repository')
  .action(async (packageSpec: string | undefined, options: { from?: string; to?: string; json?: boolean; cwd?: string }) => {
    await runChronaUpgrade({ cwd: options.cwd, packageSpec, from: options.from, to: options.to, json: options.json });
  });

program.parse(process.argv);
