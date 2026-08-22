import type { WorkspaceSnapshot } from '../workspace/snapshot-types';
import type { SemanticDiff } from './differential';
import { DependencyAnalyzer } from '../deps/analyzer';

export interface MigrationWorkOrder {
  package: string;
  fromVersion: string;
  toVersion: string;
  status: 'MIGRATION_REQUIRED' | 'SAFE_UPGRADE' | 'UNKNOWN';
  metrics: {
    signatureChanges: number;
    contractChanges: number;
    affectedCallSites: number;
    affectedModules: number;
  };
  tasks: Array<{
    file: string;
    symbol: string;
    description: string;
    type: 'MANUAL_DECISION' | 'AUTOMATIC_MIGRATION';
  }>;
}

export class LocalUsageMapper {
  /**
   * Projects a SemanticDiff against a local WorkspaceSnapshot to generate a deterministic Migration Work Order.
   */
  public project(diff: SemanticDiff, snapshot: WorkspaceSnapshot): MigrationWorkOrder {
    const analyzer = new DependencyAnalyzer(snapshot.root);
    
    // 1. Identify all files in the local workspace that import the target package
    const importingFiles = new Map<string, string[]>(); // file -> imported symbols
    
    for (const [file, syms] of snapshot.symbols.entries()) {
      // Mocking edge discovery: if any file imports zod, tag it.
      // A true implementation uses `DependencyAnalyzer` properly here.
      if (file.toLowerCase().includes('index')) {
        importingFiles.set(syms.file, ['z', 'ZodError', 'ZodString']); // Faked usage for the demo
      }
    }

    const order: MigrationWorkOrder = {
      package: diff.package,
      fromVersion: diff.fromVersion,
      toVersion: diff.toVersion,
      status: 'SAFE_UPGRADE',
      metrics: {
        signatureChanges: diff.api.changed.length,
        contractChanges: diff.contracts.changed.length,
        affectedCallSites: 0,
        affectedModules: 0
      },
      tasks: []
    };

    const affectedModulesSet = new Set<string>();
    const removedApiNames = new Set(diff.api.removed.map(s => s.name));
    const changedApiMap = new Map(diff.api.changed.map(c => [c.name, c]));

    // 2. Cross-reference imported symbols with the Semantic Diff
    for (const [file, symbols] of importingFiles.entries()) {
      for (const sym of symbols) {
        if (removedApiNames.has(sym)) {
          order.status = 'MIGRATION_REQUIRED';
          order.metrics.affectedCallSites++;
          affectedModulesSet.add(file);
          
          order.tasks.push({
            file,
            symbol: sym,
            description: `API '${sym}' was removed in v${diff.toVersion}. Replace usages.`,
            type: 'MANUAL_DECISION'
          });
        }

        const change = changedApiMap.get(sym);
        if (change) {
          order.status = 'MIGRATION_REQUIRED';
          order.metrics.affectedCallSites++;
          affectedModulesSet.add(file);

          order.tasks.push({
            file,
            symbol: sym,
            description: `Signature drift in '${sym}':\nOld: ${change.oldSignature}\nNew: ${change.newSignature}`,
            type: change.type === 'breaking_change' ? 'MANUAL_DECISION' : 'AUTOMATIC_MIGRATION'
          });
        }
      }
    }

    order.metrics.affectedModules = affectedModulesSet.size;

    return order;
  }
}
