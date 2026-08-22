import picocolors from 'picocolors';
import { discoverEvidence } from '../../../engine/src/discover';

export interface DiscoverOptions {
  cwd?: string;
  sourceDir?: string;
  json?: boolean;
}

export async function runChronaDiscover(options: DiscoverOptions = {}) {
  const cwd = options.cwd || process.cwd();
  const evidence = await discoverEvidence({ cwd, sourceDir: options.sourceDir });

  if (options.json) {
    console.log(JSON.stringify(evidence, null, 2));
    return;
  }

  console.log(picocolors.bold(picocolors.cyan('\nCHRONA ⚡ Evidence Discovery (v1)\n')));
  console.log(picocolors.dim(`Repository: ${evidence.repository}`));
  console.log(picocolors.dim(`Source Commit: ${evidence.sourceCommit}\n`));

  console.log(picocolors.bold('Discovered Public Exports:'));
  if (evidence.exports.length === 0) {
    console.log(picocolors.dim('  (none found)'));
  } else {
    evidence.exports.forEach((e) => {
      const depNotice = e.isDeprecated ? picocolors.yellow(' [DEPRECATED]') : '';
      console.log(`  ✓ ${picocolors.cyan(e.name)}${depNotice} ${picocolors.dim(`(${e.file}:${e.line})`)}`);
    });
  }

  console.log(picocolors.bold('\nDiscovered Type Declarations:'));
  if (evidence.types.length === 0) {
    console.log(picocolors.dim('  (none found)'));
  } else {
    evidence.types.forEach((t) => {
      console.log(`  • ${picocolors.magenta(t.name)} ${picocolors.dim(`(${t.file})`)}`);
    });
  }

  console.log(picocolors.bold('\nDiscovered Test Suites:'));
  if (evidence.tests.length === 0) {
    console.log(picocolors.dim('  (none found)'));
  } else {
    evidence.tests.forEach((t) => {
      const target = t.targetSymbol ? picocolors.dim(`-> targets ${t.targetSymbol}`) : '';
      console.log(`  ✓ ${t.name} ${target}`);
    });
  }

  if (evidence.cliCommands.length > 0) {
    console.log(picocolors.bold('\nDiscovered CLI Commands:'));
    evidence.cliCommands.forEach((c) => {
      console.log(`  ⚡ ${picocolors.yellow(c.command)} ${picocolors.dim(`(${c.description})`)}`);
    });
  }

  console.log(
    picocolors.bold(
      picocolors.green(
        `\nDiscovery complete: ${evidence.exports.length} exports, ${evidence.types.length} types, ${evidence.tests.length} tests.\n`
      )
    )
  );
}
