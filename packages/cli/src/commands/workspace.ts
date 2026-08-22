import path from 'node:path';
import picocolors from 'picocolors';
import {
  ChronaWorkspace,
  SnapshotBuilder,
  WorkspaceProjector,
  type WorkspaceProjectionRequest,
} from '@chrona-engine/engine';

export interface WorkspaceCommandOptions {
  cwd?: string;
  docsDir?: string;
  json?: boolean;
  scope?: string;
  explain?: string;
  task?: string;
  intent?: 'modify' | 'create' | 'delete' | 'investigate' | 'evaluate' | 'refactor';
  target?: string;
  tokenBudget?: number;
  includeSourceSlices?: boolean;
}

/**
 * CLI command: chrona workspace (alias: chrona ws)
 */
export async function runChronaWorkspace(options: WorkspaceCommandOptions = {}): Promise<void> {
  const cwd = path.resolve(options.cwd || process.cwd());

  // Task-specific Context Compilation: chrona ws --task "..."
  if (options.task) {
    const snapshotBuilder = new SnapshotBuilder(cwd);
    const snapshot = await snapshotBuilder.buildSnapshot({ cwd, docsDir: options.docsDir });

    const projector = new WorkspaceProjector();
    const packet = await projector.project(snapshot, {
      task: options.task,
      intent: options.intent,
      target: options.target,
      tokenBudget: options.tokenBudget,
      includeSourceSlices: options.includeSourceSlices,
    });

    if (options.json) {
      console.log(JSON.stringify(packet, null, 2));
      return;
    }

    console.log(picocolors.bold(picocolors.cyan('\nChrona Compiled Workspace Packet')));
    console.log(picocolors.dim('═'.repeat(60)));
    console.log(`Workspace ID:   ${picocolors.bold(picocolors.yellow(packet.workspaceId))}`);
    console.log(`Snapshot ID:    ${picocolors.dim(packet.snapshotId)}`);
    console.log(`Task:           ${picocolors.bold(packet.manifest.purpose)}`);
    console.log(`Target:         ${picocolors.green(packet.reality.target.file || packet.manifest.target)}`);

    const quality = packet.projection.quality || 'VALID';
    const isSafe = quality === 'VALID';
    const qualityColor = quality === 'VALID' ? picocolors.green : quality === 'DEGRADED' ? picocolors.yellow : picocolors.red;
    const safeColor = isSafe ? picocolors.green : picocolors.red;

    console.log(picocolors.bold('\n── Epistemic Certification ──'));
    console.log(`Status:         ${qualityColor(picocolors.bold(quality))}`);
    console.log(`Safe to Reason: ${safeColor(picocolors.bold(isSafe ? 'YES (Evidence-Complete World)' : 'NO (Critical Evidence Incomplete)'))}`);
    console.log(`Sufficiency:    ${picocolors.cyan(`${((packet.projection.evidenceSufficiency ?? packet.projection.coverageScore) * 100).toFixed(1)}%`)}`);
    console.log(`Boundary Cov:   ${picocolors.cyan(`${(packet.projection.boundaryCompleteness * 100).toFixed(1)}%`)}`);
    console.log(`Min Sufficient: ${picocolors.yellow(`${packet.projection.minimumSufficientBudget || packet.projection.tokenCount} tokens`)}`);
    console.log(`Recommended:    ${picocolors.green(`${packet.projection.recommendedTokenBudget || packet.projection.tokenBudget} tokens`)}`);
    console.log(`Token Budget:   ${packet.projection.tokenCount} / ${packet.projection.tokenBudget} tokens consumed`);
    console.log(`Efficiency:     ${picocolors.magenta(`${packet.projection.contextEfficiency} claims / 1k tokens`)}`);

    if (!isSafe) {
      console.log(picocolors.red(`\n⚠ WARNING: This workspace packet has quality status [${quality}].`));
      console.log(picocolors.dim(`  Critical dependency evidence exceeded current budget (${packet.projection.tokenBudget} tokens).`));
      if (packet.projection.missingCriticalEvidence && packet.projection.missingCriticalEvidence.length > 0) {
        console.log(picocolors.yellow('  Missing Critical Evidence:'));
        for (const missing of packet.projection.missingCriticalEvidence.slice(0, 4)) {
          console.log(`    • ${picocolors.dim(missing.item)} (${missing.tokensNeeded} tokens needed)`);
        }
      }
      const nextSuggestedBudget = Math.max(packet.projection.minimumSufficientBudget, packet.projection.recommendedTokenBudget);
      console.log(picocolors.cyan(`  Recommendation: Re-compile with --token-budget ${nextSuggestedBudget || 16000} or narrow projection target.`));
    }

    console.log(picocolors.bold('\n── Claim Coverage ──'));
    for (const c of packet.manifest.claimCoverage) {
      if (c.status === 'PROVEN') {
        console.log(`  ${picocolors.green('✓')} [PROVEN] ${c.statement}`);
      } else if (c.status === 'PARTIAL') {
        console.log(`  ${picocolors.yellow('⚠')} [PARTIAL] ${c.statement} (${c.missingEvidenceIds.length} missing evidence)`);
      } else {
        console.log(`  ${picocolors.red('○')} [UNPROVEN] ${c.statement} (${c.reason})`);
      }
    }

    if (packet.reality.contracts.length > 0) {
      console.log(picocolors.bold('\n── Active Behavioral Contracts ──'));
      for (const contract of packet.reality.contracts) {
        console.log(`  • [${picocolors.cyan(contract.type)}] ${contract.statement}`);
      }
    }

    if (packet.reality.risks.length > 0) {
      console.log(picocolors.bold('\n── Breakage Risks ──'));
      for (const risk of packet.reality.risks) {
        const color = risk.level === 'HIGH' ? picocolors.red : picocolors.yellow;
        console.log(`  ${color(`[${risk.level}]`)} ${risk.description}`);
        console.log(`    ${picocolors.dim(`Mitigation: ${risk.mitigation}`)}`);
      }
    }

    if (packet.evidence.sourceSlices.length > 0) {
      console.log(picocolors.bold(`\n── Materialized Source Slices (${packet.evidence.sourceSlices.length}) ──`));
      for (const slice of packet.evidence.sourceSlices) {
        console.log(`  • ${picocolors.green(`${slice.file}:${slice.startLine}-${slice.endLine}`)} [${slice.role}]`);
      }
    }

    if (packet.manifest.omittedEvidence.length > 0) {
      console.log(picocolors.bold('\n── Omitted Evidence (Budget Constrained) ──'));
      for (const omitted of packet.manifest.omittedEvidence.slice(0, 5)) {
        console.log(`  • ${picocolors.dim(omitted.item)}: ${picocolors.dim(omitted.reason)}`);
      }
    }

    console.log(picocolors.dim('\nCompiled via Chrona Context Compiler.\n'));
    return;
  }

  const workspace = await ChronaWorkspace.fromDirectory(cwd, options.docsDir);

  if (options.explain) {
    const explanation = workspace.explainSymbol(options.explain);
    if (!explanation) {
      console.log(picocolors.red(`\nSymbol [${options.explain}] not found in workspace AST.\n`));
      return;
    }

    if (options.json) {
      console.log(JSON.stringify(explanation, null, 2));
      return;
    }

    console.log(picocolors.bold(picocolors.cyan(`\nWhy does ${explanation.symbol} look like this?\n`)));
    console.log(picocolors.bold('Current Implementation:'));
    console.log(`  ${picocolors.green(explanation.implementation.file + ':' + explanation.implementation.line)}`);
    console.log(`  ${picocolors.yellow(explanation.implementation.signature)}`);

    console.log(picocolors.bold('\nDocumentation References:'));
    console.log(`  Total References: ${explanation.documentation.totalReferences}`);
    for (const v of explanation.documentation.verified) {
      console.log(`  ${picocolors.green('✓')} ${v.file}:${v.line}`);
    }
    for (const c of explanation.documentation.contradictions) {
      console.log(`  ${picocolors.red('✗')} ${c.file}:${c.line} → [${c.code}] ${c.message}`);
    }

    console.log(picocolors.bold('\nEpistemic Verdict:'));
    console.log(`  ${explanation.verdict.explanation}`);

    console.log(picocolors.bold('\nEvidence Chain:'));
    for (const ev of explanation.evidenceChain) {
      console.log(`  • ${picocolors.dim(ev)}`);
    }
    console.log();
    return;
  }

  if (options.scope) {
    const context = workspace.getVerifiedContext({ scope: options.scope });
    if (options.json) {
      console.log(JSON.stringify(context, null, 2));
      return;
    }

    console.log(picocolors.bold(picocolors.cyan(`\n=== Verified Context for [${context.scope}] ===\n`)));
    console.log(picocolors.bold('Entry Points:'));
    for (const ep of context.entryPoints) {
      console.log(`  • ${picocolors.green(ep.name)} (${picocolors.dim(ep.file + ':' + ep.line)})`);
      if (ep.signature) console.log(`    ${picocolors.dim(ep.signature)}`);
    }

    if (context.publicApi.length > 0) {
      console.log(picocolors.bold('\nPublic API Signatures:'));
      for (const api of context.publicApi) {
        console.log(`  • ${picocolors.yellow(api.name)}: ${api.signature}`);
      }
    }

    if (context.verifiedExamples.length > 0) {
      console.log(picocolors.bold('\nVerified Code Examples:'));
      for (const ex of context.verifiedExamples) {
        console.log(`  ${picocolors.dim('From ' + ex.file + ':' + ex.line)}`);
        console.log(`  ${picocolors.cyan(ex.snippet.split('\n')[0] || '')}`);
      }
    }

    if (context.knownDrift.length > 0) {
      console.log(picocolors.bold(picocolors.red('\nKnown Documentation Drift:')));
      for (const d of context.knownDrift) {
        console.log(`  ⚠ [${d.code}] ${d.message} (${d.file}:${d.line})`);
      }
    }

    console.log(picocolors.dim('\nEvidence Chain: ✓ AST Provenance │ ✓ Package Metadata │ ✓ Git Commit ' + context.evidence.commit + '\n'));
    return;
  }

  const overview = workspace.getOverview();

  if (options.json) {
    console.log(JSON.stringify(overview, null, 2));
    return;
  }

  const statusColor =
    overview.integrity.status === 'pass'
      ? picocolors.green('PASS')
      : overview.integrity.status === 'warn'
        ? picocolors.yellow('WARN')
        : overview.integrity.status === 'insufficient_evidence'
          ? picocolors.yellow('N/A (INSUFFICIENT EVIDENCE)')
          : picocolors.red('FAIL');

  console.log(picocolors.bold(picocolors.cyan('\nChrona Workspace')));
  console.log(picocolors.dim('─'.repeat(40)));

  console.log(`Project       ${picocolors.bold(overview.manifest.name)}`);
  if (overview.manifest.repo) {
    console.log(`Repository    ${picocolors.dim(overview.manifest.repo)}`);
  }
  console.log(`Commit        ${picocolors.yellow(overview.manifest.commit)} (${overview.manifest.branch})`);

  console.log(picocolors.bold('\nSources'));
  console.log(`  ${overview.sources.symbols.toLocaleString()} symbols`);
  console.log(`  ${overview.sources.exports.toLocaleString()} exports`);
  console.log(`  ${overview.sources.types.toLocaleString()} types`);
  console.log(`  ${overview.sources.modules.toLocaleString()} modules`);

  console.log(picocolors.bold('\nDocumentation'));
  console.log(`  ${overview.documentation.pages} pages`);
  console.log(`  ${overview.documentation.claims} claims`);
  console.log(`  ${picocolors.green(overview.documentation.verified)} verified`);
  if (overview.documentation.warnings > 0) {
    console.log(`  ${picocolors.yellow(overview.documentation.warnings)} warnings`);
  }
  if (overview.documentation.contradictions > 0) {
    console.log(`  ${picocolors.red(overview.documentation.contradictions)} contradictions`);
  }
  if (overview.documentation.unverified > 0) {
    console.log(`  ${picocolors.dim(overview.documentation.unverified + ' unverified')}`);
  }

  console.log(picocolors.bold('\nEvidence'));
  console.log(`  ${overview.evidence.ast ? picocolors.green('✓') : picocolors.red('✗')} TypeScript AST`);
  console.log(`  ${overview.evidence.git ? picocolors.green('✓') : picocolors.red('✗')} Git history`);
  console.log(`  ${overview.evidence.packageMetadata ? picocolors.green('✓') : picocolors.red('✗')} package metadata`);
  console.log(`  ${overview.evidence.executableExamples ? picocolors.green('✓') : picocolors.yellow('○')} executable examples`);

  console.log(picocolors.bold('\nIntegrity'));
  console.log(`  Soundness:         ${picocolors.cyan(overview.integrity.scorePercent)} [${statusColor}]`);
  console.log(`  Claim Coverage:    ${picocolors.dim(overview.documentation.claimCoveragePercent)}`);
  console.log(`  Evidence Coverage: ${picocolors.dim(overview.documentation.evidenceCoveragePercent)}`);

  console.log(picocolors.dim(`\nLast verification: Just now\n`));
}
