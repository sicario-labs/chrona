import type { ExtractedSymbol } from '../referee/oxc-extractor';
import type { BehavioralContract } from '../contracts/types';
import type { ExternalPackageReality } from '../registry/resolver';
import type { VerificationReceipt } from '../change/types';

export interface MutatedSymbolDiff {
  name: string;
  fromSignature: string;
  toSignature: string;
  fromReturnType?: string;
  toReturnType?: string;
  isBreaking: boolean;
  reason: string;
}

export interface MutatedContractDiff {
  id: string;
  statement: string;
  type: string;
  status: 'added' | 'removed' | 'modified';
  oldStatement?: string;
  newStatement?: string;
}

export interface PackageRealityDiff {
  packageName: string;
  fromVersion: string;
  toVersion: string;
  addedSymbols: Array<{ name: string; signature: string; returnType?: string }>;
  removedSymbols: Array<{ name: string; signature: string; returnType?: string }>;
  mutatedSymbols: MutatedSymbolDiff[];
  mutatedContracts: MutatedContractDiff[];
  breakingChangesCount: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  summary: {
    totalAdded: number;
    totalRemoved: number;
    totalMutated: number;
    contractsAltered: number;
  };
}

export interface UpgradeCallSite {
  file: string;
  line: number;
  symbol: string;
  snippet: string;
  impactType: 'REMOVED_SYMBOL' | 'SIGNATURE_CHANGED' | 'CONTRACT_MUTATED' | 'TYPE_MISMATCH';
  suggestedAction: string;
}

export interface UpgradeWorkOrder {
  id: string;
  packageName: string;
  fromVersion: string;
  toVersion: string;
  realityDiff: PackageRealityDiff;
  affectedLocalFiles: string[];
  callSites: UpgradeCallSite[];
  requiredInvariants: string[];
  migrationSteps: string[];
  verificationPlan: {
    testsToRun: string[];
    contractsToVerify: string[];
  };
  generatedAt: string;
}

export interface UpgradeOptions {
  cwd?: string;
  packageName: string;
  fromVersion?: string;
  toVersion: string;
  autoApply?: boolean;
}

export interface UpgradeResult {
  workOrder: UpgradeWorkOrder;
  receipt?: VerificationReceipt;
  applied: boolean;
}
