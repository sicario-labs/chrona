/**
 * Chrona Graph Contract
 * 
 * The invariant:
 * The graph stores what exists and how things relate.
 * Verifiers determine what can be proven about those relationships.
 */

// --- Node Identities ---
// Format: pkg:<package-name>:<kind>:<qualified-name>
// Example: pkg:@chrona/engine:function:createRouter
export type NodeId = string;

// --- Epistemic Verdicts ---
export type EpistemicVerdict = 
  | 'VERIFIED'      // Mathematically proven against AST
  | 'CONTRADICTED'  // Conflicts with AST
  | 'UNVERIFIED'    // Cannot be proven or disproven by the AST
  | 'PHANTOM'       // Claim references a non-existent symbol
  | 'STALE';        // Symbol changed, claim was not updated

// --- Nodes ---

export interface BaseNode {
  id: NodeId;
  type: 'symbol' | 'claim' | 'document' | 'commit' | 'diagnostic';
}

export interface SymbolNode extends BaseNode {
  type: 'symbol';
  name: string;
  kind: string; // 'function', 'class', 'interface', etc.
  file: string; // The file where this symbol is implemented
  line: number;
  startOffset?: number;
  endOffset?: number;
  signature: string;
}

export interface ClaimNode extends BaseNode {
  type: 'claim';
  text: string;
  file: string; // Document file where the claim is made
  line: number;
  startOffset?: number;
  endOffset?: number;
  verdict?: EpistemicVerdict; // Attached by Verifier Engines
}

export interface DocumentNode extends BaseNode {
  type: 'document';
  file: string; // e.g. docs/routing.mdx
  title?: string;
}

export interface CommitNode extends BaseNode {
  type: 'commit';
  hash: string;
  message: string;
  author: string;
  date: string;
}

export interface DiagnosticNode extends BaseNode {
  type: 'diagnostic';
  code: string; // e.g. DOC-102
  message: string;
  severity: 'error' | 'warning' | 'info';
  suggestedAction?: string;
  evidence?: string[];
}

export type GraphNode = SymbolNode | ClaimNode | DocumentNode | CommitNode | DiagnosticNode;

// --- Edges ---

export type EdgeRelation = 
  | 'defines'        // Document -> Claim
  | 'references'     // Claim -> Symbol
  | 'implemented-by' // Symbol -> File (or Document)
  | 'changed-by'     // Symbol -> Commit
  | 'derived-from';  // Diagnostic -> Claim

export interface GraphEdge {
  source: NodeId;
  target: NodeId;
  relation: EdgeRelation;
  metadata?: Record<string, unknown>;
}

// --- The Graph ---

export class ChronaGraph {
  serialize(): string {
    return JSON.stringify({
      nodes: Array.from(this.nodes.entries()),
      edges: this.edges
    });
  }

  static deserialize(data: string): ChronaGraph {
    const graph = new ChronaGraph();
    const parsed = JSON.parse(data);
    if (parsed.nodes) graph.nodes = new Map(parsed.nodes);
    if (parsed.edges) graph.edges = parsed.edges;
    return graph;
  }
  public nodes: Map<NodeId, GraphNode> = new Map();
  public edges: GraphEdge[] = [];

  addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);
  }

  addEdge(source: NodeId, target: NodeId, relation: EdgeRelation, metadata?: Record<string, unknown>): void {
    if (!this.nodes.has(source)) throw new Error(`Source node ${source} not found`);
    if (!this.nodes.has(target)) throw new Error(`Target node ${target} not found`);
    
    this.edges.push({ source, target, relation, metadata });
  }

  getNode(id: NodeId): GraphNode | undefined {
    return this.nodes.get(id);
  }

  getIncomingEdges(targetId: NodeId, relation?: EdgeRelation): GraphEdge[] {
    return this.edges.filter(e => e.target === targetId && (!relation || e.relation === relation));
  }

  getOutgoingEdges(sourceId: NodeId, relation?: EdgeRelation): GraphEdge[] {
    return this.edges.filter(e => e.source === sourceId && (!relation || e.relation === relation));
  }

  // Helper traversal queries
  getClaimsForSymbol(symbolId: NodeId): ClaimNode[] {
    const edges = this.getIncomingEdges(symbolId, 'references');
    return edges.map(e => this.getNode(e.source) as ClaimNode).filter(Boolean);
  }

  getDiagnosticsForClaim(claimId: NodeId): DiagnosticNode[] {
    const edges = this.getIncomingEdges(claimId, 'derived-from');
    return edges.map(e => this.getNode(e.source) as DiagnosticNode).filter(Boolean);
  }

  getDocumentsForSymbol(symbolId: NodeId): DocumentNode[] {
    const claims = this.getClaimsForSymbol(symbolId);
    const docIds = new Set<NodeId>();
    for (const claim of claims) {
      const edges = this.getIncomingEdges(claim.id, 'defines');
      edges.forEach(e => docIds.add(e.source));
    }
    return Array.from(docIds).map(id => this.getNode(id) as DocumentNode).filter(Boolean);
  }
}



