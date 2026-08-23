import path from 'node:path';
import picocolors from 'picocolors';
import { ChronaWorkspace } from '@chrona-engine/engine';
import type { SymbolNode, ClaimNode, DocumentNode, DiagnosticNode } from '@chrona-engine/engine';

export interface TraceCommandOptions {
  cwd?: string;
  docsDir?: string;
  orphans?: boolean;
  phantoms?: boolean;
  unverified?: boolean;
}

export async function runChronaTrace(
  target: string | undefined,
  options: TraceCommandOptions = {}
): Promise<void> {
  const cwd = path.resolve(options.cwd || process.cwd());
  const workspace = await ChronaWorkspace.fromDirectory(cwd, options.docsDir);
  const graph = workspace.graph;

  if (options.orphans) {
    console.log(picocolors.bold(picocolors.cyan('\nORPHANS (Code without Claims):\n')));
    let count = 0;
    for (const node of graph.nodes.values()) {
      if (node.type === 'symbol') {
        const claims = graph.getClaimsForSymbol(node.id);
        if (claims.length === 0) {
           console.log(`  ${picocolors.yellow('?')} ${node.name} (${(node as SymbolNode).file})`);
           count++;
        }
      }
    }
    if (count === 0) console.log(picocolors.dim('  No orphans found.'));
    console.log();
    return;
  }

  if (options.phantoms) {
    console.log(picocolors.bold(picocolors.cyan('\nPHANTOMS (Claims referencing missing code):\n')));
    let count = 0;
    for (const node of graph.nodes.values()) {
      if (node.type === 'claim' && (node as ClaimNode).verdict === 'PHANTOM') {
        console.log(`  ${picocolors.red('')} ${(node as ClaimNode).text} (${(node as ClaimNode).file}:${(node as ClaimNode).line})`);
        count++;
      }
    }
    if (count === 0) console.log(picocolors.dim('  No phantoms found.'));
    console.log();
    return;
  }

  if (options.unverified) {
    console.log(picocolors.bold(picocolors.cyan('\nUNVERIFIED CLAIMS:\n')));
    let count = 0;
    for (const node of graph.nodes.values()) {
      if (node.type === 'claim' && (node as ClaimNode).verdict === 'UNVERIFIED') {
        console.log(`  ${picocolors.dim('-')} ${(node as ClaimNode).text} (${(node as ClaimNode).file}:${(node as ClaimNode).line})`);
        count++;
      }
    }
    if (count === 0) console.log(picocolors.dim('  No unverified claims found.'));
    console.log();
    return;
  }

  if (!target) {
    console.log(picocolors.red('\nPlease specify a target symbol or use --orphans, --phantoms, --unverified.\n'));
    return;
  }

  const cleanTarget = target.replace(/[^a-zA-Z0-9_$]/g, ' ').trim().split(/\s+/)[0] || target;
  
  // Find the symbol node in the graph
  let symbolNode: SymbolNode | undefined;
  for (const node of graph.nodes.values()) {
    if (node.type === 'symbol' && (node.name.toLowerCase() === target.toLowerCase() || node.name.toLowerCase().includes(cleanTarget.toLowerCase()))) {
      symbolNode = node as SymbolNode;
      break;
    }
  }

  if (!symbolNode) {
    console.log(picocolors.red(`\nNo symbol or verifiable evidence found for [${target}] in workspace Graph.\n`));
    return;
  }

  console.log(picocolors.cyan(`\n${symbolNode.name}`));
  console.log(picocolors.dim(`│`));

  console.log(`├── defined in`);
  console.log(`│   └── ${picocolors.green(`${symbolNode.file}:${symbolNode.line}`)}`);
  console.log(picocolors.dim(`│`));

  const commitEdges = graph.getOutgoingEdges(symbolNode.id, 'changed-by');
  let commitStr = 'unknown';
  if (commitEdges.length > 0) {
    const commitNode = graph.getNode(commitEdges[0].target);
    if (commitNode && commitNode.type === 'commit') {
      commitStr = commitNode.hash;
    }
  }
  
  console.log(`├── changed by`);
  console.log(`│   └── ${picocolors.yellow(commitStr)}`);
  console.log(picocolors.dim(`│`));

  console.log(`├── documented by`);
  const claims = graph.getClaimsForSymbol(symbolNode.id);
  const docs = graph.getDocumentsForSymbol(symbolNode.id);
  
  if (docs.length === 0) {
    console.log(`│   └── ${picocolors.dim('none')}`);
  } else {
    for (let i = 0; i < docs.length; i++) {
      const prefix = i === docs.length - 1 ? '└──' : '├──';
      console.log(`│   ${prefix} ${docs[i].file}`);
    }
  }
  console.log(picocolors.dim(`│`));

  console.log(`├── claims`);
  if (claims.length === 0) {
    console.log(`│   └── ${picocolors.dim('none')}`);
  } else {
    for (let i = 0; i < claims.length; i++) {
      const claim = claims[i];
      const prefix = i === claims.length - 1 ? '└──' : '├──';
      if (claim.verdict === 'CONTRADICTED') {
         console.log(`│   ${prefix} ${picocolors.red('Contradicted claim')}`);
      } else if (claim.verdict === 'VERIFIED') {
         console.log(`│   ${prefix} ${picocolors.green('Verified matches')}`);
      } else {
         console.log(`│   ${prefix} ${picocolors.yellow('Unverified claim')}`);
      }
    }
  }
  console.log(picocolors.dim(`│`));

  console.log(`├── reality`);
  console.log(`│   └── signature = ${picocolors.green(symbolNode.signature)}`);
  console.log(picocolors.dim(`│`));

  console.log(`└── diagnostics`);
  let diagCount = 0;
  for (const claim of claims) {
    const diags = graph.getDiagnosticsForClaim(claim.id);
    for (let i = 0; i < diags.length; i++) {
       const d = diags[i];
       const isLast = (diagCount === 0 && i === diags.length - 1); // rough
       console.log(`    ├── ${picocolors.red(d.code)}`);
       diagCount++;
    }
  }
  if (diagCount === 0) {
    console.log(`    └── ${picocolors.dim('none')}`);
  }

  console.log();
}
