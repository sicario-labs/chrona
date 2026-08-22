import type { VerificationResult, RepositorySnapshot } from '../claim/types';

export interface MemoryDiff {
  newContradictions: Array<{ symbol: string; code: string; message: string; file: string; line: number }>;
  resolvedContradictions: Array<{ symbol: string; code: string; resolvedAt: string; file: string; line: number }>;
  signatureChanges: Array<{ symbol: string; before: string; after: string; breaking: boolean }>;
  coverageChange: { before: number; after: number; delta: number };
}

export function diffSnapshots(
  previous: VerificationResult,
  current: VerificationResult,
  previousSnapshot: RepositorySnapshot,
  currentSnapshot: RepositorySnapshot
): MemoryDiff {
  const newContradictions: MemoryDiff['newContradictions'] = [];
  const resolvedContradictions: MemoryDiff['resolvedContradictions'] = [];
  const signatureChanges: MemoryDiff['signatureChanges'] = [];

  // Track contradictions
  const prevContradictions = previous.claims.filter(c => c.status === 'contradicted');
  const currContradictions = current.claims.filter(c => c.status === 'contradicted');

  const makeKey = (c: any) => `${c.claim.subject}-${c.claim.source.file}-${c.claim.source.line}-${c.diagnostic?.code}`;

  const prevKeys = new Set(prevContradictions.map(makeKey));
  const currKeys = new Set(currContradictions.map(makeKey));

  // Find new contradictions
  for (const curr of currContradictions) {
    if (!prevKeys.has(makeKey(curr))) {
      newContradictions.push({
        symbol: curr.claim.subject,
        code: curr.diagnostic?.code || 'UNKNOWN',
        message: curr.diagnostic?.message || '',
        file: curr.claim.source.file,
        line: curr.claim.source.line
      });
    }
  }

  // Find resolved contradictions
  const now = new Date().toISOString();
  for (const prev of prevContradictions) {
    if (!currKeys.has(makeKey(prev))) {
      resolvedContradictions.push({
        symbol: prev.claim.subject,
        code: prev.diagnostic?.code || 'UNKNOWN',
        resolvedAt: now,
        file: prev.claim.source.file,
        line: prev.claim.source.line
      });
    }
  }

  // Track signature changes
  if (previousSnapshot.symbols && currentSnapshot.symbols) {
    for (const [symbol, currSym] of currentSnapshot.symbols.entries()) {
      const prevSym = previousSnapshot.symbols.get(symbol);
      if (prevSym && prevSym.signature !== currSym.signature) {
        signatureChanges.push({
          symbol,
          before: prevSym.signature,
          after: currSym.signature,
          breaking: isBreakingChange(prevSym.signature, currSym.signature)
        });
      }
    }
  }

  // Track coverage
  const beforeCoverage = previous.claims.length > 0 
    ? previous.summary.claimsVerified / previous.claims.length 
    : 0;
    
  const currTotal = current.claims.length;
  const afterCoverage = currTotal > 0 
    ? current.summary.claimsVerified / currTotal
    : 0;

  return {
    newContradictions,
    resolvedContradictions,
    signatureChanges,
    coverageChange: {
      before: beforeCoverage,
      after: afterCoverage,
      delta: afterCoverage - beforeCoverage
    }
  };
}

function isBreakingChange(oldSig: string, newSig: string): boolean {
  if (!oldSig || !newSig) return false;
  const oldParams = oldSig.split('(')[1]?.split(')')[0] || '';
  const newParams = newSig.split('(')[1]?.split(')')[0] || '';
  return oldParams.split(',').length !== newParams.split(',').length;
}
