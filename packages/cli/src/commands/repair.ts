import fs from 'node:fs/promises';
import path from 'node:path';
import picocolors from 'picocolors';
import readline from 'node:readline';
import { ChronaWorkspace } from '@chrona-engine/engine';
import type { DiagnosticNode, ClaimNode } from '@chrona-engine/engine';

export interface RepairOptions {
  cwd?: string;
  apply?: boolean;
}

export async function runChronaRepair(options: RepairOptions = {}): Promise<void> {
  const cwd = path.resolve(options.cwd || process.cwd());
  console.log(picocolors.cyan('\nCHRONA ⚡ Automated Documentation Repair\n'));

  const workspace = await ChronaWorkspace.fromDirectory(cwd);
  const graph = workspace.graph;

  const diagnostics = Array.from(graph.nodes.values()).filter(
    (n) => n.type === 'diagnostic' && n.code === 'DOC-102'
  ) as DiagnosticNode[];

  if (diagnostics.length === 0) {
    console.log(picocolors.green('✓ No repairable diagnostics found. Documentation is synchronized.'));
    return;
  }

  let repairedCount = 0;
  const patches: { file: string; content: string }[] = [];

  for (const diag of diagnostics) {
    const edges = graph.getOutgoingEdges(diag.id, 'derived-from');
    if (edges.length === 0) continue;
    
    const claimNode = graph.getNode(edges[0].target) as ClaimNode;
    if (!claimNode || !claimNode.file) continue;

    if (!diag.suggestedAction) continue;

    const match = diag.suggestedAction.match(/Update documented signature to match: `(.*?)`/);
    if (!match) continue;

    const newSignature = match[1];
    
    const oldSignatureRaw = claimNode.text;
    const headingMatch = oldSignatureRaw.match(/^(#+)\s+`(.*)`$/);
    let newClaimText = `\`${newSignature}\``;
    if (headingMatch) {
      newClaimText = `${headingMatch[1]} \`${newSignature}\``;
    }
    
    const filePath = path.resolve(cwd, claimNode.file);
    try {
      let content = await fs.readFile(filePath, 'utf8');
      
      console.log(picocolors.bold(`✦ Proposed repair\n`));
      console.log(`${claimNode.file}:${claimNode.line}\n`);
      console.log(picocolors.red(`- ${oldSignatureRaw}`));
      console.log(picocolors.green(`+ ${newClaimText}\n`));
      
      console.log(`Evidence:`);
      if (diag.evidence && diag.evidence.length > 0) {
        console.log(`  ${diag.evidence[0]}`);
      }
      console.log(`  ${diag.code}`);
      console.log(`  confidence: 100%\n`);

      // AST-aware surgical repair
      if (claimNode.startOffset !== undefined && claimNode.endOffset !== undefined) {
         // Fallback verification: does the slice match what we extracted?
         const actualSlice = content.slice(claimNode.startOffset, claimNode.endOffset).trim();
         if (actualSlice === oldSignatureRaw.trim()) {
           // We can surgically replace exactly the AST span
           content = content.slice(0, claimNode.startOffset) + newClaimText + content.slice(claimNode.endOffset);
         } else {
           // Fallback to string replace if AST offset seems off (CRLF shift)
           content = content.replace(oldSignatureRaw, newClaimText);
         }
      } else {
         content = content.replace(oldSignatureRaw, newClaimText);
      }

      patches.push({ file: filePath, content });
      repairedCount++;
      
    } catch (e) {
       console.log(`  ${picocolors.red('✖ Failed to patch')} ${claimNode.file}: ${String(e)}\n`);
    }
  }
  
  if (repairedCount === 0) return;

  if (options.apply) {
    for (const patch of patches) {
      await fs.writeFile(patch.file, patch.content, 'utf8');
    }
    console.log(picocolors.green(`Successfully repaired ${repairedCount} files.`));
    return;
  }

  // Interactive prompt
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('Apply? [y/N] ', async (answer) => {
    if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
      for (const patch of patches) {
        await fs.writeFile(patch.file, patch.content, 'utf8');
      }
      console.log(picocolors.green(`\nSuccessfully repaired ${repairedCount} files.`));
    } else {
      console.log(picocolors.dim('\nRepair cancelled. No files were modified.'));
    }
    rl.close();
  });
}
