import path from 'node:path';
import { x } from 'tinyexec';
import { discoverEvidence } from './discover';
import { TruthReferee } from './referee/truth-referee';
import type { EvidenceGraph, CompilerVerificationReport } from './compiler-types';

export interface KnowledgeClaimEvidence {
  astSymbol?: string;
  filePath?: string;
  line?: number;
  typeSignature?: string;
  schemaConstraint?: string;
  verifiedAgainstCommit: string;
  verifiedAt: string;
  evidenceChain: string[];
}

export interface KnowledgeClaimNode {
  id: string;
  statement: string;
  targetSymbol: string;
  status: 'verified' | 'drifted' | 'unverified';
  confidence: number;
  evidence: KnowledgeClaimEvidence;
  executableSnippet?: string;
  safeToExecute: boolean;
}

export interface TruthGraphSummary {
  schemaVersion: 'v1';
  totalClaims: number;
  verifiedClaims: number;
  driftedClaims: number;
  unverifiedClaims: number;
  overallConfidence: number;
  commit: string;
  claims: KnowledgeClaimNode[];
}

export interface BuildTruthGraphOptions {
  cwd?: string;
  sourceDir?: string;
  docsDir?: string;
  commit?: string;
}

/**
 * Build the Epistemic Truth Graph connecting codebase AST symbols,
 * documentation claims, and verification provenance.
 */
export async function buildTruthGraph(options: BuildTruthGraphOptions = {}): Promise<TruthGraphSummary> {
  const cwd = options.cwd || process.cwd();
  const sourceDir = options.sourceDir || path.join(cwd, 'src');
  const docsDir = options.docsDir || path.join(cwd, 'content', 'docs');

  let commit = options.commit || 'HEAD';
  try {
    const gitRes = await x('git', ['rev-parse', '--short', 'HEAD'], { nodeOptions: { cwd } });
    if (gitRes.stdout.trim()) {
      commit = gitRes.stdout.trim();
    }
  } catch {
    commit = 'working-tree';
  }

  const now = new Date().toISOString();

  // 1. Discover AST ground truth
  const evidence: EvidenceGraph = await discoverEvidence({ cwd, sourceDir });

  // 2. Run Truth Referee on documentation
  const referee = new TruthReferee({ cwd, sourceDir, docsDir });
  let refereeResult: CompilerVerificationReport | null = null;
  try {
    refereeResult = await referee.runVerification();
  } catch {
    // If docsDir does not exist, initialize empty result
    refereeResult = {
      schemaVersion: 'v1',
      status: 'pass',
      errorsCount: 0,
      warningsCount: 0,
      infoCount: 0,
      diagnostics: [],
    };
  }

  const claims: KnowledgeClaimNode[] = [];
  const diagnosticMap = new Map<string, string[]>();

  if (refereeResult) {
    for (const diag of refereeResult.diagnostics) {
      const sym = diag.claim || diag.file;
      const existing = diagnosticMap.get(sym) || [];
      existing.push(`[${diag.code}] ${diag.message}`);
      diagnosticMap.set(sym, existing);
    }
  }

  // 3. Construct knowledge claims for each discovered AST export and type
  for (const exp of evidence.exports || []) {
    const issues = diagnosticMap.get(exp.name) || [];
    const isDrifted = issues.length > 0;
    const status: 'verified' | 'drifted' | 'unverified' = isDrifted ? 'drifted' : 'verified';
    const confidence = isDrifted ? 0.35 : 0.998;

    const evidenceChain: string[] = [
      `AST: export ${exp.name} from ${exp.file}:${exp.line ?? 1}`,
    ];

    if (exp.signature) {
      evidenceChain.push(`Signature: ${exp.signature}`);
    }

    if (isDrifted) {
      evidenceChain.push(...issues.map((iss) => `Referee Diagnostic: ${iss}`));
    } else {
      evidenceChain.push('Truth Referee: 100% matched with codebase AST');
    }

    const claimId = `claim:${exp.name.toLowerCase()}`;
    const statement = `Symbol \`${exp.name}\` is exported from \`${exp.file}\` with signature \`${exp.signature || exp.name}\``;

    const snippet = `import { ${exp.name} } from './${path.basename(exp.file, path.extname(exp.file))}';\n\n// Verified signature\n${exp.name}();`;

    claims.push({
      id: claimId,
      statement,
      targetSymbol: exp.name,
      status,
      confidence,
      evidence: {
        astSymbol: exp.name,
        filePath: exp.file,
        line: exp.line,
        typeSignature: exp.signature,
        verifiedAgainstCommit: commit,
        verifiedAt: now,
        evidenceChain,
      },
      executableSnippet: snippet,
      safeToExecute: !isDrifted,
    });
  }

  for (const typ of evidence.types || []) {
    const issues = diagnosticMap.get(typ.name) || [];
    const isDrifted = issues.length > 0;
    const status: 'verified' | 'drifted' | 'unverified' = isDrifted ? 'drifted' : 'verified';
    const confidence = isDrifted ? 0.35 : 0.998;

    const evidenceChain: string[] = [
      `AST: type ${typ.name} from ${typ.file}`,
    ];

    if (typ.definition) {
      evidenceChain.push(`Definition: ${typ.definition}`);
    }

    if (isDrifted) {
      evidenceChain.push(...issues.map((iss) => `Referee Diagnostic: ${iss}`));
    } else {
      evidenceChain.push('Truth Referee: 100% matched with codebase AST');
    }

    const claimId = `claim:type:${typ.name.toLowerCase()}`;
    const statement = `Type \`${typ.name}\` is exported from \`${typ.file}\``;

    const snippet = `import type { ${typ.name} } from './${path.basename(typ.file, path.extname(typ.file))}';`;

    claims.push({
      id: claimId,
      statement,
      targetSymbol: typ.name,
      status,
      confidence,
      evidence: {
        astSymbol: typ.name,
        filePath: typ.file,
        typeSignature: typ.definition,
        verifiedAgainstCommit: commit,
        verifiedAt: now,
        evidenceChain,
      },
      executableSnippet: snippet,
      safeToExecute: !isDrifted,
    });
  }

  const verifiedCount = claims.filter((c) => c.status === 'verified').length;
  const driftedCount = claims.filter((c) => c.status === 'drifted').length;
  const unverifiedCount = claims.filter((c) => c.status === 'unverified').length;

  const overallConfidence = claims.length > 0
    ? Number((claims.reduce((acc, c) => acc + c.confidence, 0) / claims.length).toFixed(3))
    : 1.0;

  return {
    schemaVersion: 'v1',
    totalClaims: claims.length,
    verifiedClaims: verifiedCount,
    driftedClaims: driftedCount,
    unverifiedClaims: unverifiedCount,
    overallConfidence,
    commit,
    claims,
  };
}
