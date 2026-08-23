import { ChronaGraph, SymbolNode, ClaimNode, DocumentNode, DiagnosticNode, EdgeRelation, EpistemicVerdict } from './graph';
import type { WorkspaceSoftwareModel, WorkspaceKnowledgeModel, WorkspaceIntegrity, WorkspaceManifest } from './types';
import { generateSymbolIdentity } from '../referee/identity';

export function buildChronaGraph(
  manifest: WorkspaceManifest,
  software: WorkspaceSoftwareModel,
  knowledge: WorkspaceKnowledgeModel,
  integrity: WorkspaceIntegrity
): ChronaGraph {
  const graph = new ChronaGraph();
  const symbolIdentityMap = new Map<string, string>(); // name -> node id

  // 1. Commit Node
  const commitId = `commit:${manifest.commit}`;
  graph.addNode({
    id: commitId,
    type: 'commit',
    hash: manifest.commit,
    message: 'Unknown message', // Could be enriched
    author: 'Unknown',
    date: new Date().toISOString()
  });

  // 2. Symbol Nodes
  for (const [name, sym] of software.symbols.entries()) {
    const id = generateSymbolIdentity(sym.file || 'unknown', sym.kind, name);
    symbolIdentityMap.set(name, id);
    
    graph.addNode({
      id,
      type: 'symbol',
      name: sym.name,
      kind: sym.kind,
      file: sym.file || 'unknown',
      line: sym.line || 1,
      signature: sym.signature
    });

    graph.addEdge(id, commitId, 'changed-by'); // Simplified baseline edge
  }

  // 3. Document Nodes
  const docFiles = new Set(knowledge.claims.map(c => c.source?.file).filter(Boolean) as string[]);
  for (const file of docFiles) {
    const docId = `doc:${file}`;
    graph.addNode({
      id: docId,
      type: 'document',
      file
    });
  }

  // 4. Claim Nodes and Relationships
  for (const claim of knowledge.claims) {
    const docFile = claim.source?.file;
    if (!docFile) continue;
    
    const docId = `doc:${docFile}`;
    const claimId = `claim:${claim.id}`;
    
    // Evaluate Epistemic Verdict
    let verdict: EpistemicVerdict = 'UNVERIFIED';
    if (claim.status === 'verified') verdict = 'VERIFIED';
    
    graph.addNode({
      id: claimId,
      type: 'claim',
      text: claim.source?.text || '',
      file: docFile,
      line: claim.source?.line || 1,
      verdict
    });

    graph.addEdge(docId, claimId, 'defines');

    const symbolId = symbolIdentityMap.get(claim.subject);
    if (symbolId) {
      graph.addEdge(claimId, symbolId, 'references');
    } else {
      // It's a PHANTOM! It references something not in our symbols map.
      // We will override the verdict if it's currently UNVERIFIED
      if (verdict === 'UNVERIFIED') {
        (graph.getNode(claimId) as ClaimNode).verdict = 'PHANTOM';
      }
    }
  }

  // 5. Diagnostic Nodes
  let diagIdx = 0;
  for (const diag of integrity.diagnostics) {
    const diagId = `diag:${diag.code}:${diagIdx++}`;
    
    graph.addNode({
      id: diagId,
      type: 'diagnostic',
      code: diag.code,
      message: diag.message,
      severity: diag.severity,
      suggestedAction: diag.suggestedAction,
      evidence: diag.evidence
    });

    // Find the claim that caused this diagnostic
    const matchingClaim = knowledge.claims.find(c => c.source?.text === diag.claim && c.source?.file === diag.file);
    if (matchingClaim) {
      const claimId = `claim:${matchingClaim.id}`;
      graph.addEdge(diagId, claimId, 'derived-from');
      
      // Update verdict to CONTRADICTED
      const claimNode = graph.getNode(claimId) as ClaimNode;
      if (claimNode) claimNode.verdict = 'CONTRADICTED';
    }
  }

  return graph;
}



