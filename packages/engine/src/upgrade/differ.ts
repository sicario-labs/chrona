import type { ExternalPackageReality } from '../registry/resolver';
import type { PackageRealityDiff, MutatedSymbolDiff, MutatedContractDiff } from './types';

export class PackageRealityDiffer {
  /**
   * Compares two verified package realities and generates a granular semantic reality diff.
   */
  public static diff(
    fromReality: ExternalPackageReality,
    toReality: ExternalPackageReality
  ): PackageRealityDiff {
    const fromApiMap = new Map(fromReality.api.map((s) => [s.name, s]));
    const toApiMap = new Map(toReality.api.map((s) => [s.name, s]));

    const addedSymbols: PackageRealityDiff['addedSymbols'] = [];
    const removedSymbols: PackageRealityDiff['removedSymbols'] = [];
    const mutatedSymbols: MutatedSymbolDiff[] = [];

    // 1. Detect Removed & Mutated Symbols
    for (const [name, fromSym] of fromApiMap.entries()) {
      const toSym = toApiMap.get(name);
      if (!toSym) {
        removedSymbols.push({
          name: fromSym.name,
          signature: fromSym.signature,
          returnType: fromSym.returnType,
        });
      } else {
        // Compare signatures & return types
        const sigChanged = fromSym.signature !== toSym.signature;
        const returnChanged = fromSym.returnType !== toSym.returnType;

        if (sigChanged || returnChanged) {
          const fromParamCount = fromSym.parameters?.filter((p) => !p.optional).length || 0;
          const toParamCount = toSym.parameters?.filter((p) => !p.optional).length || 0;
          const isBreaking = toParamCount > fromParamCount || returnChanged || (Boolean(fromSym.parameters) && toSym.parameters?.length !== fromSym.parameters?.length);

          mutatedSymbols.push({
            name,
            fromSignature: fromSym.signature,
            toSignature: toSym.signature,
            fromReturnType: fromSym.returnType,
            toReturnType: toSym.returnType,
            isBreaking,
            reason: isBreaking
              ? `Breaking signature change: ${toParamCount > fromParamCount ? 'required parameters added' : 'signature altered'}`
              : 'Non-breaking signature refinement',
          });
        }
      }
    }

    // 2. Detect Added Symbols
    for (const [name, toSym] of toApiMap.entries()) {
      if (!fromApiMap.has(name)) {
        addedSymbols.push({
          name: toSym.name,
          signature: toSym.signature,
          returnType: toSym.returnType,
        });
      }
    }

    // 3. Detect Contract Mutations
    const fromContractMap = new Map(fromReality.contracts.map((c) => [c.id || c.statement, c]));
    const toContractMap = new Map(toReality.contracts.map((c) => [c.id || c.statement, c]));
    const mutatedContracts: MutatedContractDiff[] = [];

    for (const [key, fromC] of fromContractMap.entries()) {
      const toC = toContractMap.get(key);
      if (!toC) {
        mutatedContracts.push({
          id: fromC.id,
          statement: fromC.statement,
          type: fromC.type,
          status: 'removed',
          oldStatement: fromC.statement,
        });
      } else if (fromC.statement !== toC.statement || fromC.type !== toC.type) {
        mutatedContracts.push({
          id: toC.id,
          statement: toC.statement,
          type: toC.type,
          status: 'modified',
          oldStatement: fromC.statement,
          newStatement: toC.statement,
        });
      }
    }

    for (const [key, toC] of toContractMap.entries()) {
      if (!fromContractMap.has(key)) {
        mutatedContracts.push({
          id: toC.id,
          statement: toC.statement,
          type: toC.type,
          status: 'added',
          newStatement: toC.statement,
        });
      }
    }

    // 4. Calculate Risk Level & Summary
    const breakingChangesCount =
      removedSymbols.length + mutatedSymbols.filter((m) => m.isBreaking).length + mutatedContracts.filter((c) => c.status === 'removed').length;

    let riskLevel: PackageRealityDiff['riskLevel'] = 'LOW';
    if (breakingChangesCount > 8 || mutatedContracts.some((c) => c.status === 'removed' && c.type === 'invariant')) {
      riskLevel = 'CRITICAL';
    } else if (breakingChangesCount > 3) {
      riskLevel = 'HIGH';
    } else if (breakingChangesCount > 0) {
      riskLevel = 'MEDIUM';
    }

    return {
      packageName: toReality.packageName,
      fromVersion: fromReality.version,
      toVersion: toReality.version,
      addedSymbols,
      removedSymbols,
      mutatedSymbols,
      mutatedContracts,
      breakingChangesCount,
      riskLevel,
      summary: {
        totalAdded: addedSymbols.length,
        totalRemoved: removedSymbols.length,
        totalMutated: mutatedSymbols.length,
        contractsAltered: mutatedContracts.length,
      },
    };
  }
}
