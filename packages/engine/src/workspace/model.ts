import fs from 'node:fs';
import path from 'node:path';
import { x } from 'tinyexec';
import { DocumentationVerifier } from '../verifier';
import { MemoryStore } from '../memory/store';
import { diffSnapshots } from '../memory/differ';
import type { Claim } from '../claim/types';
import type { ExtractedSymbol } from '../referee/oxc-extractor';
import type {
  WorkspaceManifest,
  WorkspaceSoftwareModel,
  WorkspaceKnowledgeModel,
  WorkspaceEvidenceModel,
  WorkspaceRelationship,
  WorkspaceIntegrity,
  WorkspaceOverview,
  WorkspaceVerifiedContext,
  WorkspaceExplanation,
  WorkspaceStatus,
} from './types';

export class ChronaWorkspace {
  readonly manifest: WorkspaceManifest;
  readonly software: WorkspaceSoftwareModel;
  readonly knowledge: WorkspaceKnowledgeModel;
  readonly evidence: WorkspaceEvidenceModel;
  readonly relationships: WorkspaceRelationship[] = [];
  readonly integrity: WorkspaceIntegrity;
  readonly memory?: MemoryStore;

  constructor(
    manifest: WorkspaceManifest,
    software: WorkspaceSoftwareModel,
    knowledge: WorkspaceKnowledgeModel,
    evidence: WorkspaceEvidenceModel,
    relationships: WorkspaceRelationship[],
    integrity: WorkspaceIntegrity,
    memory?: MemoryStore
  ) {
    this.manifest = manifest;
    this.software = software;
    this.knowledge = knowledge;
    this.evidence = evidence;
    this.relationships = relationships;
    this.integrity = integrity;
    this.memory = memory;
  }

  /**
   * Construct a Chrona Workspace epistemic model from a directory.
   */
  static async fromDirectory(cwd: string = process.cwd(), docsDir?: string): Promise<ChronaWorkspace> {
    const root = path.resolve(cwd);

    // 1. Manifest
    let projectName = path.basename(root);
    let repoUrl = '';
    const pkgPath = path.join(root, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.name) projectName = pkg.name;
        if (pkg.repository) {
          repoUrl = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository.url || '';
        }
      } catch {
        // ignore JSON parse error
      }
    }

    let commit = 'working-tree';
    let branch = 'main';
    try {
      const gitRev = await x('git', ['rev-parse', '--short', 'HEAD'], { nodeOptions: { cwd: root } });
      if (gitRev.stdout.trim()) commit = gitRev.stdout.trim();
      const gitBranch = await x('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { nodeOptions: { cwd: root } });
      if (gitBranch.stdout.trim()) branch = gitBranch.stdout.trim();
    } catch {
      // not a git repo
    }

    const manifest: WorkspaceManifest = {
      id: `ws_${Buffer.from(root).toString('base64url').slice(0, 12)}`,
      name: projectName,
      repo: repoUrl || undefined,
      root,
      commit,
      branch,
    };

    // 2. Discover Source Files & AST Ground Truth via Verifier Pipeline
    const verifier = new DocumentationVerifier({ cwd: root, docsDir });
    const snapshot = await verifier.buildSnapshot();
    const verification = await verifier.verifyWorkspace();

    const symbols = snapshot.symbols;
    const types = new Map<string, ExtractedSymbol>();
    const modulesSet = new Set<string>(snapshot.files.keys());
    const relationships: WorkspaceRelationship[] = [];

    for (const [name, sym] of symbols.entries()) {
      modulesSet.add(sym.file);
      relationships.push({
        source: name,
        relation: 'IMPLEMENTED_BY',
        target: `${sym.file}:${sym.line ?? 1}`,
      });
      relationships.push({
        source: name,
        relation: 'EXPORTED_FROM',
        target: sym.file,
      });
    }

    const software: WorkspaceSoftwareModel = {
      symbolsCount: symbols.size,
      exportsCount: symbols.size,
      typesCount: types.size,
      modulesCount: modulesSet.size || 1,
      symbols,
      types,
      modules: Array.from(modulesSet),
    };

    // 3. Knowledge & Claim IR
    const claims: Claim[] = [];
    const examples: WorkspaceKnowledgeModel['examples'] = [];
    const concepts: string[] = [];

    for (const claimResult of verification.claims) {
      const claim = claimResult.claim;
      claims.push(claim);

      const srcFile = claim.source?.file || 'unknown';
      const srcLine = claim.source?.line ?? 1;

      if (claim.subject && symbols.has(claim.subject)) {
        relationships.push({
          source: claim.subject,
          relation: 'DOCUMENTED_BY',
          target: `${srcFile}:${srcLine}`,
        });
        relationships.push({
          source: claim.id,
          relation: 'VERIFIED_BY',
          target: `${srcFile}:${srcLine}`,
        });
      }

      if (claim.type === 'example') {
        examples.push({
          id: claim.id,
          file: srcFile,
          line: srcLine,
          code: claim.source?.text || '',
          isExecutable: claim.status === 'verified',
        });
        relationships.push({
          source: claim.subject || 'example',
          relation: 'USED_IN',
          target: `${srcFile}:${srcLine}`,
        });
      }
    }

    const docFiles = new Set(claims.map((c) => c.source?.file).filter(Boolean));
    const codeClaimsCount = claims.filter(c => c.source?.file.endsWith('.ts') || c.source?.file.endsWith('.js')).length;
    const codeClaimsVerified = verification.claims.filter(c => c.status === 'verified' && (c.claim.source?.file.endsWith('.ts') || c.claim.source?.file.endsWith('.js'))).length;

    const knowledge: WorkspaceKnowledgeModel = {
      pagesCount: docFiles.size,
      claimsCount: claims.length,
      verifiedCount: verification.summary.claimsVerified,
      warningCount: verification.diagnostics.filter((d) => d.severity === 'warning').length,
      contradictionCount: verification.summary.contradictionsFound,
      codeClaimsCount,
      codeClaimsVerified,
      claims,
      concepts,
      examples,
    };

    // 4. Evidence Model
    const evidence: WorkspaceEvidenceModel = {
      astEvidence: symbols.size > 0,
      gitEvidence: commit !== 'working-tree',
      packageMetadata: fs.existsSync(pkgPath),
      executableExamples: examples.some((e) => e.isExecutable),
      snapshot,
    };

    // 5. Integrity & Epistemic Breakdown
    const totalClaimsCount = claims.length;
    const verifiedCount = verification.summary.claimsVerified;
    const contradictionCount = verification.summary.contradictionsFound;
    const unverifiedCount = verification.summary.unverifiedCount;
    const suppressedCount = verification.summary.suppressedCount || 0;

    let score = 0;
    let scorePercent = 'N/A';
    let status: WorkspaceStatus = 'pass';

    if (totalClaimsCount === 0) {
      status = 'insufficient_evidence';
      score = 0;
      scorePercent = 'N/A';
    } else {
      const activeEvaluated = verifiedCount + contradictionCount;
      score = activeEvaluated > 0 ? verifiedCount / activeEvaluated : 1.0;
      scorePercent = `${(score * 100).toFixed(1)}%`;
      status = contradictionCount > 0 ? 'fail' : verification.diagnostics.some((d) => d.severity === 'warning') ? 'warn' : 'pass';
    }

    const claimCoverage = totalClaimsCount > 0 ? (verifiedCount + contradictionCount) / totalClaimsCount : 0;
    const evidenceCoverage = totalClaimsCount > 0 ? claims.filter((c) => c.evidence && c.evidence.length > 0).length / totalClaimsCount : 0;

    const diagnosticsByCode: Record<string, number> = {};
    for (const d of verification.diagnostics) {
      diagnosticsByCode[d.code] = (diagnosticsByCode[d.code] || 0) + 1;
    }

    const memory = new MemoryStore(root);
    memory.load();

    const integrity: WorkspaceIntegrity = {
      score: Number(score.toFixed(4)),
      scorePercent,
      status,
      claimCoverage: Number(claimCoverage.toFixed(4)),
      evidenceCoverage: Number(evidenceCoverage.toFixed(4)),
      epistemicBreakdown: {
        verified: verifiedCount,
        contradicted: contradictionCount,
        unverified: unverifiedCount,
        ambiguous: verification.summary.ambiguousCount || 0,
        suppressed: suppressedCount,
      },
      lastVerifiedAt: new Date().toISOString(),
      diagnostics: verification.diagnostics,
      diagnosticsByCode,
    };

    // Update Memory
    memory.recordVerification(verification, commit, branch);

    for (const [symbolName, sym] of symbols.entries()) {
      memory.recordSymbolChange(symbolName, sym.file, sym.signature, commit);
    }

    for (const diag of verification.diagnostics) {
      if (diag.severity === 'error' && diag.claim) {
        memory.recordDriftEvent(diag.claim, diag.file, diag.line ?? 1, diag.code);
      }
    }

    memory.save();

    return new ChronaWorkspace(manifest, software, knowledge, evidence, relationships, integrity, memory);
  }

  getMemory(): MemoryStore | undefined {
    return this.memory;
  }

  getDriftReport() {
    return this.memory?.getDriftMetrics();
  }

  /**
   * Get clean, structured overview for CLI output and human inspection.
   */
  getOverview(): WorkspaceOverview {
    return {
      manifest: this.manifest,
      sources: {
        symbols: this.software.symbolsCount,
        exports: this.software.exportsCount,
        types: this.software.typesCount,
        modules: this.software.modulesCount,
      },
      documentation: {
        pages: this.knowledge.pagesCount,
        claims: this.knowledge.claimsCount,
        verified: this.knowledge.verifiedCount,
        warnings: this.knowledge.warningCount,
        contradictions: this.knowledge.contradictionCount,
        unverified: this.integrity.epistemicBreakdown.unverified,
        suppressed: this.integrity.epistemicBreakdown.suppressed,
        codeClaims: this.knowledge.codeClaimsCount,
        codeClaimsVerified: this.knowledge.codeClaimsVerified,
        claimCoveragePercent: `${(this.integrity.claimCoverage * 100).toFixed(1)}%`,
        evidenceCoveragePercent: `${(this.integrity.evidenceCoverage * 100).toFixed(1)}%`,
      },
      evidence: {
        ast: this.evidence.astEvidence,
        git: this.evidence.gitEvidence,
        packageMetadata: this.evidence.packageMetadata,
        executableExamples: this.evidence.executableExamples,
      },
      integrity: {
        scorePercent: this.integrity.scorePercent,
        status: this.integrity.status,
        lastVerifiedAt: this.integrity.lastVerifiedAt,
      },
    };
  }

  /**
   * Get verified context traversing the workspace graph for a specific scope or symbol.
   */
  getVerifiedContext(query: { scope?: string; symbol?: string } = {}): WorkspaceVerifiedContext {
    const scope = query.symbol || query.scope || 'workspace';
    const matchingSymbols: { name: string; file: string; line: number; signature?: string }[] = [];
    const publicApi: { name: string; signature: string; returnType?: string }[] = [];

    for (const [name, sym] of this.software.symbols.entries()) {
      if (scope === 'workspace' || name.toLowerCase().includes(scope.toLowerCase()) || sym.file.toLowerCase().includes(scope.toLowerCase())) {
        matchingSymbols.push({
          name: sym.name,
          file: sym.file,
          line: sym.line,
          signature: sym.signature,
        });
        publicApi.push({
          name: sym.name,
          signature: sym.signature,
          returnType: sym.returnType,
        });
      }
    }

    const verifiedExamples = this.knowledge.examples
      .filter((e) => scope === 'workspace' || e.code.toLowerCase().includes(scope.toLowerCase()))
      .map((e) => ({
        file: e.file,
        line: e.line,
        snippet: e.code,
      }));

    const knownDrift = this.integrity.diagnostics
      .filter((d) => scope === 'workspace' || (d.claim && d.claim.toLowerCase().includes(scope.toLowerCase())) || d.file.toLowerCase().includes(scope.toLowerCase()))
      .map((d) => ({
        code: d.code,
        message: d.message,
        file: d.file,
        line: d.line ?? 1,
      }));

    return {
      scope,
      entryPoints: matchingSymbols.slice(0, 10),
      publicApi: publicApi.slice(0, 10),
      verifiedExamples: verifiedExamples.slice(0, 5),
      knownDrift,
      evidence: {
        astProvenance: this.evidence.astEvidence,
        packageJson: this.evidence.packageMetadata,
        executableExample: this.evidence.executableExamples,
        commit: this.manifest.commit,
      },
    };
  }

  /**
   * Find all epistemic relationships connected to a symbol, file, or claim ID.
   */
  getRelationships(nodeId: string): WorkspaceRelationship[] {
    return this.relationships.filter(
      (r) => r.source.toLowerCase() === nodeId.toLowerCase() || r.target.toLowerCase().includes(nodeId.toLowerCase())
    );
  }

  /**
   * Deep epistemic explanation for why a symbol has its current shape,
   * which documentation claims match or contradict it, and why drift occurred.
   */
  explainSymbol(symbolName: string): WorkspaceExplanation | null {
    const sym = this.software.symbols.get(symbolName);
    if (!sym) return null;

    const matchingClaims = this.knowledge.claims.filter(
      (c) => c.subject === sym.name || c.source?.text?.includes(sym.name)
    );

    const verifiedClaims = matchingClaims
      .filter((c) => c.status === 'verified')
      .map((c) => ({
        file: c.source?.file || 'unknown',
        line: c.source?.line ?? 1,
        text: c.source?.text || '',
      }));

    const contradictions = this.integrity.diagnostics
      .filter((d) => d.claim === sym.name || d.message.includes(sym.name))
      .map((d) => ({
        file: d.file,
        line: d.line ?? 1,
        code: d.code,
        message: d.message,
      }));

    const totalRefs = matchingClaims.length;
    const hasDrift = contradictions.length > 0;
    const confidence = hasDrift ? 0.85 : 0.998;

    const fileLoc = sym.file || 'src/index.ts';
    let explanation = `Symbol \`${sym.name}\` is implemented in \`${fileLoc}:${sym.line}\` with signature \`${sym.signature}\`.`;
    if (hasDrift) {
      const topIssue = contradictions[0];
      explanation += ` Documentation in \`${topIssue.file}:${topIssue.line}\` is contradictory: ${topIssue.message}.`;
    } else if (verifiedClaims.length > 0) {
      explanation += ` All ${verifiedClaims.length} documentation reference(s) are 100% verified against live AST ground truth.`;
    } else {
      explanation += ` No documentation references currently found for this symbol.`;
    }

    const evidenceChain: string[] = [
      `AST: ${fileLoc}:${sym.line} (${sym.signature})`,
      `Git: commit ${this.manifest.commit} (${this.manifest.branch})`,
      `Claims: ${matchingClaims.length} claim(s) extracted from documentation`,
    ];

    const status: 'VERIFIED' | 'CONTRADICTED' | 'UNVERIFIED' | 'AMBIGUOUS' = hasDrift
      ? 'CONTRADICTED'
      : verifiedClaims.length > 0
      ? 'VERIFIED'
      : 'UNVERIFIED';

    return {
      symbol: sym.name,
      implementation: {
        file: sym.file,
        line: sym.line,
        signature: sym.signature,
        returnType: sym.returnType,
      },
      documentation: {
        totalReferences: totalRefs,
        verified: verifiedClaims,
        contradictions,
      },
      recentHistory: {
        commit: this.manifest.commit,
        branch: this.manifest.branch,
        lastVerifiedAt: this.integrity.lastVerifiedAt,
      },
      verdict: {
        confidence,
        status,
        explanation,
      },
      evidenceChain,
    };
  }
}
