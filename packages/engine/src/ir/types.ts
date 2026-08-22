import type { ExtractedSymbol, ExtractedParam, ExtractedProperty } from '../referee/oxc-extractor';
import type { BehavioralContract, ContractType, ContractEvidence } from '../contracts/types';
import type { Claim, Evidence } from '../claim/types';

/**
 * Chrona IR v1 Specification (`x-chrona-ir/v1`)
 *
 * Universal Language-Agnostic Software Reality Intermediate Representation.
 * Defines the canonical semantic model for symbols, modules, contracts,
 * dependencies, and evidence across polyglot codebases.
 */

export type IRLanguage = 'typescript' | 'javascript' | 'python' | 'rust' | 'go' | 'generic';

export interface ChronaIRParam extends ExtractedParam {}
export interface ChronaIRProperty extends ExtractedProperty {}

/**
 * Universal Symbol in Chrona IR
 */
export interface ChronaIRSymbol {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'type' | 'variable' | 'enum' | 'method';
  signature: string;
  file: string;
  line: number;
  span: [number, number];
  language: IRLanguage;
  parameters: ChronaIRParam[];
  properties: ChronaIRProperty[];
  returnType?: string;
  docstring?: string;
  isDeprecated: boolean;
  deprecationNotice?: string;
  languageSpecific?: Record<string, unknown>;
}

/**
 * Directed Relationship / Edge between Modules or Symbols
 */
export interface ChronaIRRelationship {
  fromFile: string;
  toFile: string;
  specifier: string;
  type: 'imports' | 'calls' | 'inherits' | 'implements' | 'depends_on';
  importedSymbols: string[];
  isDynamic: boolean;
  isTypeOnly: boolean;
}

/**
 * Universal Behavioral Contract in Chrona IR
 */
export interface ChronaIRContract {
  id: string;
  type: ContractType; // 'precondition' | 'invariant' | 'postcondition' | 'authorization' | 'persistence'
  statement: string;
  subject: string; // File or Symbol target
  status: 'active' | 'violated' | 'deprecated';
  confidence: number; // 0.0 - 1.0
  origin: 'code-assertion' | 'developer-declared' | 'test-assertion' | 'inferred';
  evidence: ContractEvidence[];
  dependents: string[];
}

/**
 * Complete Module Representation
 */
export interface ChronaIRModule {
  file: string;
  language: IRLanguage;
  hash: string;
  mtimeMs: number;
  size: number;
  exports: string[];
  imports: ChronaIRRelationship[];
  symbols: ChronaIRSymbol[];
  contracts: ChronaIRContract[];
}

/**
 * Full Chrona IR v1 Codebase Snapshot
 */
export interface ChronaIRSnapshot {
  schemaVersion: 'x-chrona-ir/v1';
  snapshotId: string;
  rootDirectory: string;
  modules: Record<string, ChronaIRModule>;
  relationships: ChronaIRRelationship[];
  totalSymbols: number;
  totalContracts: number;
  compiledAt: string;
}
