export type EdgeKind =
  | 'imports'
  | 'references'
  | 'extends'
  | 'implements'
  | 'typeOf'
  | 'alias';

export interface GraphNode {
  id: string;
  name: string;
  filePath: string;
  kind: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  /**
   * file where the relationship was observed
   */
  filePath: string;
}

export interface SymbolGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /**
   * from id -> [to id]
   */
  adjacency: Map<string, string[]>;
}

export interface BuildGraphOptions {
  /**
   * include references from symbols that are not exported
   *
   * @defaultValue true
   */
  includeInternal?: boolean;
}