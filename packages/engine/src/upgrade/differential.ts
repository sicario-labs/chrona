import type { RegistryPackageModel } from '../registry/serializer';

export interface SemanticDiff {
  package: string;
  fromVersion: string;
  toVersion: string;
  api: {
    added: Array<RegistryPackageModel['symbols'][0]>;
    removed: Array<RegistryPackageModel['symbols'][0]>;
    changed: Array<{
      name: string;
      oldSignature: string;
      newSignature: string;
      type: 'signature_drift' | 'type_narrowing' | 'type_widening' | 'breaking_change';
    }>;
  };
  contracts: {
    added: any[]; // Stubbed for behavioral contracts
    removed: any[];
    changed: any[];
  };
  severity: 'MAJOR' | 'MINOR' | 'PATCH' | 'UNKNOWN';
}

export class SemanticDifferentialEngine {
  /**
   * Computes the semantic differential between two verifed Registry artifacts.
   */
  public computeDiff(oldModel: RegistryPackageModel, newModel: RegistryPackageModel): SemanticDiff {
    if (oldModel.name !== newModel.name) {
      throw new Error(`Cannot diff mismatched packages: ${oldModel.name} vs ${newModel.name}`);
    }

    const diff: SemanticDiff = {
      package: oldModel.name,
      fromVersion: oldModel.version,
      toVersion: newModel.version,
      api: {
        added: [],
        removed: [],
        changed: [],
      },
      contracts: {
        added: [],
        removed: [],
        changed: [],
      },
      severity: 'PATCH' // Default, elevated during diff
    };

    const oldMap = new Map(oldModel.symbols.map(s => [s.name, s]));
    const newMap = new Map(newModel.symbols.map(s => [s.name, s]));

    // Find Added & Changed
    for (const [name, newSym] of newMap.entries()) {
      const oldSym = oldMap.get(name);
      if (!oldSym) {
        diff.api.added.push(newSym);
      } else if (oldSym.signature !== newSym.signature) {
        // Compute nature of the change
        const isBreaking = this.isBreakingSignatureChange(oldSym.signature, newSym.signature);
        if (isBreaking) diff.severity = 'MAJOR';
        else if (diff.severity === 'PATCH') diff.severity = 'MINOR';

        diff.api.changed.push({
          name,
          oldSignature: oldSym.signature,
          newSignature: newSym.signature,
          type: isBreaking ? 'breaking_change' : 'signature_drift'
        });
      }
    }

    // Find Removed
    for (const [name, oldSym] of oldMap.entries()) {
      if (!newMap.has(name)) {
        diff.api.removed.push(oldSym);
        diff.severity = 'MAJOR'; // Removing an export is a breaking change
      }
    }

    return diff;
  }

  private isBreakingSignatureChange(oldSig: string, newSig: string): boolean {
    // Naive heuristic for PoC: if a parameter was added without a `?` or default, it's breaking.
    // A robust AST-based AST Diff engine would sit here.
    if (oldSig.includes('?') && !newSig.includes('?')) return true;
    
    // For now, any signature drift that isn't purely additive is flagged as potentially breaking
    return true; 
  }
}
