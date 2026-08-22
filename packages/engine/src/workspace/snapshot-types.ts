import type { Claim } from '../claim/types';
import type { ExtractedSymbol } from '../referee/oxc-extractor';
import type { DependencyGraph } from '../deps/types';
import type { BehavioralContract } from '../contracts/types';
import type { CommitProvenance } from '../provenance/types';

export const CHRONA_ENGINE_VERSION = '0.1.0';
export const SNAPSHOT_SCHEMA_VERSION = 'v1';
export const OXC_PARSER_VERSION = '1.0';

export interface SnapshotConfigIndex {
  packageJson?: Record<string, unknown>;
  configFiles: string[];
  envVars: string[];
  dbTables: string[];
}

export interface SnapshotTestIndex {
  testFiles: string[];
  testsCount: number;
  targetMap: Record<string, string[]>; // test file -> covered source files
}

export interface SnapshotProvenanceIndex {
  commitCountMap: Record<string, number>;
  creationMap: Record<string, CommitProvenance>;
}

/**
 * Immutable canonical snapshot of repository reality at a specific commit.
 */
export interface WorkspaceSnapshot {
  id: string; // Deterministic sha256 hash
  commit: string;
  timestamp: string;
  root: string;
  projectName: string;

  // The 5 Pillars of Codebase Reality
  graph: DependencyGraph;
  symbols: Map<string, ExtractedSymbol>;
  claims: Claim[];
  contracts: BehavioralContract[];
  provenance: SnapshotProvenanceIndex;

  // Auxiliary indices
  config: SnapshotConfigIndex;
  tests: SnapshotTestIndex;
  
  // File checksums used to verify snapshot integrity
  fileHashes: Record<string, string>;
}
