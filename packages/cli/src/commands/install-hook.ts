import fs from 'node:fs/promises';
import path from 'node:path';
import picocolors from 'picocolors';

export type HookMode = 'warn' | 'strict';

export interface InstallHookOptions {
  cwd?: string;
  mode?: HookMode;
}

export async function runChronaInstallHook(options: InstallHookOptions = {}) {
  const cwd = options.cwd || process.cwd();
  const mode: HookMode = options.mode || 'warn';
  const gitHooksDir = path.join(cwd, '.git', 'hooks');

  const hookScript = `#!/bin/sh
# Chrona Developer Experience Pre-Commit Hook (Mode: ${mode})
if [ -n "$CHRONA_SKIP_HOOK" ]; then
  exit 0
fi

# Run Chrona Impact Analysis (deterministic, fast, zero LLM calls)
node ./node_modules/@chrona/cli/dist/index.js impact --json > /tmp/chrona-impact.json 2>/dev/null || npx chrona impact --json > /tmp/chrona-impact.json 2>/dev/null

STATUS=$(grep '"status":' /tmp/chrona-impact.json 2>/dev/null | tr -d ' ",' | cut -d: -f2)

if [ "$STATUS" = "needs_repair" ]; then
  echo ""
  echo "CHRONA ⚡ Documentation Impact Detected"
  echo "Code changes require documentation updates."
  echo ""
  echo "Run to repair:"
  echo "  npx chrona repair"
  echo ""

  if [ "${mode}" = "strict" ]; then
    echo "ERROR: Commit blocked in strict mode due to documentation debt."
    echo "Bypass locally with CHRONA_SKIP_HOOK=1 git commit"
    echo ""
    exit 1
  else
    echo "NOTE: Non-blocking warning in warn mode. Remember to repair before CI merge."
    echo ""
  fi
fi
`;

  try {
    await fs.mkdir(gitHooksDir, { recursive: true });
    const preCommitPath = path.join(gitHooksDir, 'pre-commit');
    await fs.writeFile(preCommitPath, hookScript, { mode: 0o755 });

    console.log(picocolors.bold(picocolors.cyan('\nCHRONA ⚡ Pre-Commit Hook Installed\n')));
    console.log(picocolors.green(`  ✓ Installed pre-commit hook at ${picocolors.bold('.git/hooks/pre-commit')}`));
    console.log(`  • Mode: ${picocolors.bold(mode === 'strict' ? picocolors.red('strict (blocking)') : picocolors.yellow('warn (non-blocking)'))}`);
    console.log(picocolors.dim('  • Fast, deterministic Git hook execution (0ms LLM overhead).'));
    console.log(picocolors.dim('  • Run `npx chrona repair` anytime to dispatch work orders to your agent.\n'));
  } catch (err) {
    console.error(picocolors.red('Failed to install Git pre-commit hook:'), err);
  }
}
