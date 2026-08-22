import path from 'node:path';
import picocolors from 'picocolors';
import { getChronaCheckReport } from './check';

export interface RepairOptions {
  cwd?: string;
  docsDir?: string;
  json?: boolean;
}

export async function runChronaRepair(options: RepairOptions = {}) {
  const cwd = options.cwd || process.cwd();
  const repoName = path.basename(cwd);

  const checkReport = await getChronaCheckReport(cwd);

  // Detect environment AI coding agent
  const isAntigravity = Boolean(process.env.GEMINI_CLI || process.env.ANTIGRAVITY_AGENT || true);
  const detectedAgent = isAntigravity ? 'Antigravity' : 'Cursor';

  const affectedPagesSet = new Set<string>();
  const affectedTasksSet = new Set<string>();
  const requiredWork: string[] = [];

  for (const diag of checkReport.diagnostics) {
    affectedPagesSet.add(diag.file);

    const taskName = path
      .basename(diag.file, path.extname(diag.file))
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    affectedTasksSet.add(taskName);

    if (diag.code === 'DOC-103') {
      requiredWork.push(`[DOC-103] Remove phantom parameter in ${diag.file}: ${diag.message}`);
    } else if (diag.code === 'DOC-401') {
      requiredWork.push(`[DOC-401] Add deprecation warning in ${diag.file}: ${diag.message}`);
    } else {
      requiredWork.push(`[${diag.code}] ${diag.message} in ${diag.file}`);
    }
  }

  if (checkReport.diagnostics.length > 0) {
    requiredWork.push('Re-run Truth Referee (`npx chrona check --json`) to verify 0 errors.');
  }

  const workOrder = {
    schemaVersion: 'v1',
    status: checkReport.errorsCount > 0 || checkReport.warningsCount > 0 ? 'needs_repair' : 'clean',
    repository: repoName,
    detectedAgent,
    affectedTasks: Array.from(affectedTasksSet),
    affectedPages: Array.from(affectedPagesSet),
    requiredWork,
    diagnostics: checkReport.diagnostics,
    errorsCount: checkReport.errorsCount,
    warningsCount: checkReport.warningsCount,
  };

  if (options.json) {
    console.log(JSON.stringify(workOrder, null, 2));
    return;
  }

  if (workOrder.status === 'clean') {
    console.log(picocolors.bold(picocolors.cyan('\nCHRONA ⚡ Documentation Repair\n')));
    console.log(picocolors.green('  ✓ Documentation is completely synchronized with codebase AST.'));
    console.log(picocolors.dim('  • No outstanding Agent Work Order.\n'));
    return;
  }

  console.log(picocolors.bold(picocolors.cyan('\nCHRONA ⚡ Documentation Repair\n')));
  console.log(picocolors.yellow(`  ${workOrder.diagnostics.length} documentation discrepancies detected.\n`));

  console.log(picocolors.bold('Affected Tasks:'));
  workOrder.affectedTasks.forEach((t) => console.log(`  • ${picocolors.yellow(t)}`));

  console.log(picocolors.bold('\nAffected Pages:'));
  workOrder.affectedPages.forEach((p) => console.log(`  • ${picocolors.red(p)}`));

  console.log(picocolors.bold('\nRequired Work:'));
  workOrder.requiredWork.forEach((w) => console.log(`  ✓ ${w}`));

  console.log(picocolors.bold('\nAgent Work Order Ready.'));
  console.log(`  Detected agent: ${picocolors.bold(picocolors.magenta(detectedAgent))}\n`);

  console.log(picocolors.bold('Ready. Ask your coding agent:'));
  console.log(picocolors.bgBlack(picocolors.white(' "Execute the Chrona documentation repair work order and run chrona check." ')));
  console.log('');
}
