import { Command } from 'commander';
import { ChronaGuard } from '@chrona-engine/engine';
import pc from 'picocolors';

export function runGuardCommand(program: Command) {
  program
    .command('guard')
    .description('Watch files and verify documentation claims in real-time')
    .option('--cwd <path>', 'Working directory', process.cwd())
    .option('--watch <paths...>', 'Specific paths to watch')
    .option('--format <format>', 'Output format (text, ndjson)', 'text')
    .action(async (options) => {
      const isNdjson = options.format === 'ndjson';
      if (!isNdjson) {
        console.log(pc.blue('🛡️  Starting Chrona Guard mode...'));
      }

      const guard = new ChronaGuard({
        cwd: options.cwd,
        watchPaths: options.watch,
        onEvent: (event) => {
          if (isNdjson) {
            console.log(JSON.stringify(event));
            return;
          }

          const time = pc.gray(new Date(event.timestamp).toLocaleTimeString());
          let prefix = '';
          switch (event.type) {
            case 'contradiction':
              prefix = pc.red('✗ CONTRADICTION');
              break;
            case 'drift':
              prefix = pc.yellow('⚠ DRIFT');
              break;
            case 'new-claim':
              prefix = pc.cyan('ℹ NEW CLAIM');
              break;
            case 'resolved':
              prefix = pc.green('✓ RESOLVED');
              break;
          }

          console.log(`${time} ${prefix} [${event.symbol}] ${event.message}`);
          console.log(`    ${pc.gray(`${event.file}:${event.line}`)}`);
          if (event.code) {
             console.log(`    Rule: ${event.code}`);
          }
          console.log('');
        }
      });

      await guard.start();

      if (!isNdjson) {
        console.log(pc.gray('Watching for file changes... (Press Ctrl+C to stop)'));
      }

      // Keep process alive
      process.on('SIGINT', () => {
        if (!isNdjson) console.log('\nStopping Chrona Guard...');
        guard.stop();
        process.exit(0);
      });
    });
}
