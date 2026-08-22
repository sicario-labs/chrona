import picocolors from 'picocolors';
import { analyzeChangeImpact } from '../../../engine/src/impact/analyzer';
import { computeChangeImpact } from '../../../engine/src/impact';

export interface ImpactOptions {
  cwd?: string;
  commit?: string;
  since?: string;
  base?: string;
  sourceDir?: string;
  docsDir?: string;
  json?: boolean;
}

export async function runChronaImpact(options: ImpactOptions = {}) {
  const cwd = options.cwd || process.cwd();
  const commitRef = options.commit || options.since || options.base || 'HEAD';

  const impact = await analyzeChangeImpact({
    cwd,
    from: commitRef,
    sourceDir: options.sourceDir,
    docsDir: options.docsDir,
  });

  const legacyWorkOrder = await computeChangeImpact({
    cwd,
    commit: commitRef,
    sourceDir: options.sourceDir,
    docsDir: options.docsDir,
  });

  if (options.json) {
    console.log(JSON.stringify({ ...legacyWorkOrder, ...impact }, null, 2));
    return;
  }

  console.log(picocolors.bold(picocolors.cyan('\nCHRONA ⚡ Documentation Impact v1\n')));

  const totalAffected = impact.affectedClaims.length;
  console.log(
    picocolors.bold(
      `${totalAffected} documentation claim${totalAffected === 1 ? '' : 's'} affected by commit ${impact.commit}`
    )
  );
  console.log(picocolors.dim(`Summary: ${impact.summary}\n`));

  // 1. Diagnostics on affected claims
  if (impact.diagnostics.length > 0) {
    for (const diag of impact.diagnostics) {
      console.log(picocolors.bold(picocolors.red(`${diag.code}`)));
      console.log(picocolors.dim(`${diag.file}:${diag.line || 1}\n`));
    }
  }

  // 2. Modified symbol signature diffs
  const modifiedChanges = impact.changedSymbols.filter((c) => c.type === 'modified' && c.before && c.after);
  if (modifiedChanges.length > 0) {
    for (const change of modifiedChanges) {
      console.log(picocolors.bold(`${change.symbol}()`));
      console.log(picocolors.yellow('signature changed:\n'));

      console.log(picocolors.bold(picocolors.red('BEFORE')));
      console.log(picocolors.red(`  ${change.before}\n`));

      console.log(picocolors.bold(picocolors.green('AFTER')));
      console.log(picocolors.green(`  ${change.after}\n`));
    }
  }

  // 3. Affected documentation files
  console.log(picocolors.bold('Affected documentation:'));
  if (impact.affectedFiles.length === 0) {
    console.log(picocolors.dim('  (none)'));
  } else {
    impact.affectedFiles.forEach((p) => console.log(`  ${picocolors.red(p)}`));
  }

  // 4. Affected Tasks & Recipes
  if (impact.affectedTasks.length > 0) {
    console.log(picocolors.bold('\nAffected Developer Tasks:'));
    impact.affectedTasks.forEach((t) => console.log(picocolors.yellow(`  • ${t}`)));
  }

  if (impact.affectedRecipes.length > 0) {
    console.log(picocolors.bold('\nAffected Recipes:'));
    impact.affectedRecipes.forEach((r) => console.log(picocolors.yellow(`  • ${r}`)));
  }

  // 5. Summary Scope
  console.log(picocolors.bold('\nImpact Scope:'));
  console.log(
    totalAffected > 0
      ? picocolors.red(`  ✗ ${totalAffected} claims affected (require agent repair)`)
      : picocolors.green(`  ✓ 0 claims affected`)
  );
  console.log(picocolors.green(`  ✓ ${impact.unaffected.tasksCount} tasks unaffected`));
  console.log(picocolors.green(`  ✓ ${impact.unaffected.pagesCount} pages unaffected`));
  console.log(picocolors.green(`  ✓ ${impact.unaffected.claimsCount} claims unaffected`));

  console.log(picocolors.bold('\nStructured Agent Work Order:'));
  if (legacyWorkOrder.requiredActions.length === 0) {
    console.log(picocolors.green('  ✓ All documentation claims are synchronized. No action needed.'));
  } else {
    legacyWorkOrder.requiredActions.forEach((a, i) => {
      console.log(`  ${i + 1}. [${picocolors.cyan(a.type)}] ${a.description}`);
    });
  }

  console.log('');
}
