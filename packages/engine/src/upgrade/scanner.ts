import * as fs from 'node:fs';
import * as path from 'node:path';
import type { RealityStore } from '../sqlite/reality-store';
import type { PackageRealityDiff, UpgradeCallSite } from './types';

export class UpgradeCallSiteScanner {
  /**
   * Scans local repository code to locate all AST callsites impacted by the package reality diff.
   */
  public static async scan(
    rootDir: string,
    realityStore: RealityStore,
    diff: PackageRealityDiff
  ): Promise<{ affectedLocalFiles: string[]; callSites: UpgradeCallSite[] }> {
    const callSites: UpgradeCallSite[] = [];
    const affectedFilesSet = new Set<string>();

    const removedMap = new Map(diff.removedSymbols.map((s) => [s.name, s]));
    const mutatedMap = new Map(diff.mutatedSymbols.map((s) => [s.name, s]));

    // 1. Scan SQLite edges for files that import the target package
    const graph = realityStore.getDependencyGraph();
    const pkgName = diff.packageName.toLowerCase();

    for (const [filePath, node] of Object.entries(graph.nodes)) {
      const fullPath = path.isAbsolute(filePath) ? filePath : path.resolve(rootDir, filePath);
      if (!fs.existsSync(fullPath)) continue;

      const matchingImports = node.imports.filter(
        (imp) => imp.specifier.toLowerCase() === pkgName || imp.specifier.toLowerCase().startsWith(`${pkgName}/`)
      );

      if (matchingImports.length === 0) continue;

      let fileContent: string;
      try {
        fileContent = fs.readFileSync(fullPath, 'utf-8');
      } catch {
        continue;
      }

      const lines = fileContent.split(/\r?\n/);
      let fileImpacted = false;

      for (const imp of matchingImports) {
        for (const sym of imp.importedSymbols) {
          const removedSym = removedMap.get(sym);
          const mutatedSym = mutatedMap.get(sym);

          if (removedSym || mutatedSym) {
            fileImpacted = true;
            affectedFilesSet.add(filePath);

            // Locate occurrences of this symbol in the file
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              const lineNum = i + 1;
              const symRegex = new RegExp(`\\b${sym}\\b`);

              if (symRegex.test(line)) {
                if (removedSym) {
                  callSites.push({
                    file: filePath,
                    line: lineNum,
                    symbol: sym,
                    snippet: line.trim(),
                    impactType: 'REMOVED_SYMBOL',
                    suggestedAction: `Symbol "${sym}" was removed in ${diff.packageName}@${diff.toVersion}. Replace with alternative API.`,
                  });
                } else if (mutatedSym && mutatedSym.isBreaking) {
                  callSites.push({
                    file: filePath,
                    line: lineNum,
                    symbol: sym,
                    snippet: line.trim(),
                    impactType: 'SIGNATURE_CHANGED',
                    suggestedAction: `Signature changed from ${mutatedSym.fromSignature} to ${mutatedSym.toSignature}. Update arguments.`,
                  });
                }
              }
            }
          }
        }
      }

      // Check for contract impact
      for (const contract of diff.mutatedContracts) {
        if (contract.status === 'removed' || contract.status === 'modified') {
          // If the file imports the package, attach contract migration note
          if (fileImpacted) {
            callSites.push({
              file: filePath,
              line: 1,
              symbol: diff.packageName,
              snippet: `import from '${diff.packageName}'`,
              impactType: 'CONTRACT_MUTATED',
              suggestedAction: `Behavioral contract ${contract.status}: "${contract.statement}". Ensure local logic accounts for invariant changes.`,
            });
          }
        }
      }
    }

    return {
      affectedLocalFiles: Array.from(affectedFilesSet),
      callSites,
    };
  }
}
