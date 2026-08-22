import { buildTruthGraph, type KnowledgeClaimNode, type TruthGraphSummary } from './truth-graph';
import { computeChangeImpact } from './impact';
import type { AgentWorkOrder } from './compiler-types';

export interface VerifiedContextRequest {
  cwd?: string;
  query?: string;
  symbol?: string;
  endpoint?: string;
}

export interface VerifiedContextResponse {
  query: string;
  status: 'VERIFIED' | 'DRIFTED' | 'UNVERIFIED' | 'NOT_FOUND';
  confidence: number;
  verifiedAt: string;
  sourceCommit: string;
  claims: KnowledgeClaimNode[];
  executableSnippet?: string;
  safeToExecute: boolean;
  driftAlert?: string;
  suggestedWorkOrder?: AgentWorkOrder;
}

/**
 * Retrieve verified context with AST provenance and evidence chain for an AI coding agent.
 */
export async function getVerifiedContext(request: VerifiedContextRequest = {}): Promise<VerifiedContextResponse> {
  const cwd = request.cwd || process.cwd();
  const graph: TruthGraphSummary = await buildTruthGraph({ cwd });

  const query = request.symbol || request.query || request.endpoint || '';
  const now = new Date().toISOString();

  if (!query) {
    // Return summary of all verified context
    return {
      query: 'all',
      status: graph.driftedClaims > 0 ? 'DRIFTED' : 'VERIFIED',
      confidence: graph.overallConfidence,
      verifiedAt: now,
      sourceCommit: graph.commit,
      claims: graph.claims.slice(0, 20),
      safeToExecute: graph.driftedClaims === 0,
    };
  }

  const normalizedQuery = query.toLowerCase().trim();
  const matchedClaims = graph.claims.filter(
    (c) =>
      c.targetSymbol.toLowerCase().includes(normalizedQuery) ||
      c.statement.toLowerCase().includes(normalizedQuery) ||
      c.id.toLowerCase().includes(normalizedQuery)
  );

  if (matchedClaims.length === 0) {
    return {
      query,
      status: 'NOT_FOUND',
      confidence: 0.0,
      verifiedAt: now,
      sourceCommit: graph.commit,
      claims: [],
      safeToExecute: false,
      driftAlert: `No AST symbols or verified claims found matching query: "${query}"`,
    };
  }

  const hasDrift = matchedClaims.some((c) => c.status === 'drifted');
  const status: 'VERIFIED' | 'DRIFTED' = hasDrift ? 'DRIFTED' : 'VERIFIED';
  const confidence = Number(
    (matchedClaims.reduce((acc, c) => acc + c.confidence, 0) / matchedClaims.length).toFixed(3)
  );

  const snippet = matchedClaims.map((c) => c.executableSnippet).filter(Boolean).join('\n\n');

  let suggestedWorkOrder: AgentWorkOrder | undefined;
  if (hasDrift) {
    try {
      suggestedWorkOrder = await computeChangeImpact({ cwd });
    } catch {
      // Ignore if git not initialized
    }
  }

  return {
    query,
    status,
    confidence,
    verifiedAt: now,
    sourceCommit: graph.commit,
    claims: matchedClaims,
    executableSnippet: snippet,
    safeToExecute: !hasDrift,
    driftAlert: hasDrift
      ? `Warning: One or more claims matching "${query}" have drifted from codebase AST.`
      : undefined,
    suggestedWorkOrder,
  };
}
