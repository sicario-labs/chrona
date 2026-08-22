import { Command } from 'commander';
import { ChronaWorkspace } from '@chrona-engine/engine';
import pc from 'picocolors';
import path from 'node:path';

export function runMemoryCommand(program: Command) {
  program
    .command('memory [symbol]')
    .description('Query persistent software memory and temporal knowledge graph')
    .option('-c, --cwd <dir>', 'Working directory', process.cwd())
    .option('--drift-report', 'Show drift metrics across all symbols')
    .option('--breaking-changes', 'Show breaking signature changes')
    .option('--since <date>', 'Filter events since ISO date')
    .option('--json', 'Output raw JSON memory data')
    .action(async (symbol, options) => {
      try {
        const cwd = path.resolve(options.cwd);
        const workspace = await ChronaWorkspace.fromDirectory(cwd);
        const memory = workspace.getMemory();

        if (!memory) {
          console.error(pc.red('Memory store not initialized for workspace.'));
          process.exit(1);
        }

        if (options.json) {
          console.log(JSON.stringify(memory.getData(), null, 2));
          return;
        }

        if (options.driftReport) {
          const report = memory.getDriftMetrics();
          console.log(`\n${pc.bold('Chrona Drift Report')}\n`);
          console.log(`Total Drift Events:  ${pc.yellow(report.totalDriftEvents)}`);
          console.log(`Fix Rate:            ${pc.green((report.fixRate * 100).toFixed(1))}%`);
          console.log(`Suppression Rate:    ${pc.gray((report.suppressionRate * 100).toFixed(1))}%`);
          console.log(`Mean Time to Fix:    ${(report.meanDriftDurationMs / 1000 / 60 / 60).toFixed(1)} hours\n`);
          
          if (report.topDriftingSymbols.length > 0) {
            console.log(pc.bold('Top Drifting Symbols:'));
            for (const sym of report.topDriftingSymbols) {
              console.log(`  ${pc.cyan(sym.symbol)} (${sym.count} events)`);
            }
          }
          console.log();
          return;
        }

        if (symbol) {
          const timeline = memory.getSymbolTimeline(symbol);
          if (!timeline) {
            console.log(pc.yellow(`No memory found for symbol: ${symbol}`));
            return;
          }

          console.log(`\n${pc.bold(`Timeline: ${symbol}`)} ${pc.gray(`(${timeline.file})`)}`);
          console.log(`Current Signature: ${pc.cyan(timeline.currentSignature)}\n`);

          if (timeline.history.length > 0) {
            console.log(pc.bold('Signature History:'));
            for (const hist of timeline.history) {
              const breaking = hist.breaking ? pc.red('[BREAKING]') : pc.green('[SAFE]');
              console.log(`  ${pc.gray(hist.timestamp.substring(0, 10))} ${breaking} ${hist.signature} ${pc.gray(`(commit: ${hist.commit})`)}`);
            }
            console.log();
          }

          if (timeline.driftEvents.length > 0) {
            console.log(pc.bold('Drift Events:'));
            for (const event of timeline.driftEvents) {
              const status = event.resolution === 'fixed' 
                ? pc.green('[FIXED]') 
                : event.resolution === 'suppressed' 
                ? pc.gray('[SUPPRESSED]') 
                : pc.red('[UNRESOLVED]');
              console.log(`  ${pc.gray(event.detectedAt.substring(0, 10))} ${status} ${event.code} in ${event.claimFile}:${event.claimLine}`);
            }
            console.log();
          }
          return;
        }

        // Default overview
        const data = memory.getData();
        console.log(`\n${pc.bold('Chrona Software Memory')}`);
        console.log(`Project:    ${data.projectName}`);
        console.log(`Created:    ${new Date(data.createdAt).toLocaleDateString()}`);
        console.log(`Snapshots:  ${data.snapshots.length}`);
        console.log(`Symbols:    ${Object.keys(data.symbols).length}\n`);

      } catch (err: any) {
        console.error(pc.red(`Fatal Error: ${err.message}`));
        process.exit(1);
      }
    });
}
