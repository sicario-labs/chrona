export interface ImportEdge {
  fromFile: string;
  toFile: string;
  specifier: string;
  importedSymbols: string[];
  isDynamic: boolean;
  isTypeOnly: boolean;
}

export interface ModuleNode {
  filePath: string;
  imports: ImportEdge[];
  importedBy: string[];
  exports: string[];
  isTestFile: boolean;
  isEntrypoint: boolean;
  isApiEndpoint: boolean;
  isConfig: boolean;
}

export interface DependencyGraph {
  nodes: Record<string, ModuleNode>;
  edges: ImportEdge[];
  totalModules: number;
  totalDependencies: number;
  entrypoints: string[];
  testFiles: string[];
  apiEndpoints: string[];
}

export interface ImpactBoundary {
  target: string;
  directDependents: string[];
  transitiveDependents: string[];
  affectedTests: string[];
  affectedApiEndpoints: string[];
  affectedConfigs: string[];
  confidence: number;
  criticality: 'HIGH' | 'MEDIUM' | 'LOW';
}
