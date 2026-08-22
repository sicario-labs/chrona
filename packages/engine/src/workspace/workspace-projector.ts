import crypto from 'node:crypto';
import path from 'node:path';
import { DependencyAnalyzer } from '../deps/analyzer';
import { EvidenceGraph } from './evidence-graph';
import { EvidenceOptimizer } from './evidence-optimizer';
import type { WorkspaceSnapshot } from './snapshot-types';
import type {
  WorkspaceProjectionRequest,
  TaskWorkspacePacket,
} from './workspace-projector-types';
import type { ChangeBoundary } from '../change/types';
import { RegistryClient } from '../registry/client';
import { ExternalRealityResolver, type ExternalPackageReality } from '../registry/resolver';
export class WorkspaceProjector {
  /**
   * Compiles an immutable WorkspaceSnapshot and task request into a task-specific
   * TaskWorkspacePacket bounded by evidence and token constraints.
   */
  public async project(
    snapshot: WorkspaceSnapshot,
    request: WorkspaceProjectionRequest
  ): Promise<TaskWorkspacePacket> {
    const task = request.task.trim();
    const intent = request.intent || 'modify';
    const targetQuery = (request.target || '').trim();
    const tokenBudget = request.tokenBudget || 8000;
    const includeSourceSlices = request.includeSourceSlices !== false;

    // 1. Deterministic Workspace ID
    const workspaceId = `ws_${crypto
      .createHash('sha256')
      .update([snapshot.id, task, intent, targetQuery, String(tokenBudget)].join('\0'))
      .digest('hex')
      .slice(0, 12)}`;

    // 2. Discover primary target in snapshot symbols or graph nodes
    let primaryTargetFile = '';
    let primaryTargetSymbol: string | undefined;
    let primaryTargetLine: number | undefined;
    let primaryTargetSig: string | undefined;

    const graphNodes = Object.keys(snapshot.graph.nodes);

    if (targetQuery) {
      const matchedNode = graphNodes.find(
        (k) =>
          k.toLowerCase() === targetQuery.toLowerCase() ||
          k.toLowerCase().endsWith(targetQuery.toLowerCase()) ||
          k.toLowerCase().includes(targetQuery.toLowerCase())
      );
      if (matchedNode) primaryTargetFile = matchedNode;

      for (const [symName, sym] of snapshot.symbols.entries()) {
        if (
          symName.toLowerCase() === targetQuery.toLowerCase() ||
          sym.file.toLowerCase().includes(targetQuery.toLowerCase())
        ) {
          primaryTargetSymbol = symName;
          primaryTargetFile = sym.file;
          primaryTargetLine = sym.line;
          primaryTargetSig = sym.signature;
          break;
        }
      }
    }

    if (!primaryTargetFile && graphNodes.length > 0) {
      // Find node matching task keywords
      const words = task.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      for (const node of graphNodes) {
        if (words.some((w) => node.toLowerCase().includes(w))) {
          primaryTargetFile = node;
          break;
        }
      }
      if (!primaryTargetFile) {
        primaryTargetFile = snapshot.graph.entrypoints[0] || graphNodes[0];
      }
    }

    // 3. Compute Transitive Impact Boundary
    const depAnalyzer = new DependencyAnalyzer(snapshot.root);
    const boundary: ChangeBoundary = depAnalyzer.computeImpactBoundary(
      primaryTargetFile || graphNodes[0] || 'src/index.ts',
      snapshot.graph
    );

    // 4. Evidence Graph & Optimization
    const evidenceGraph = new EvidenceGraph(snapshot);
    const { candidates, relevantClaims, relevantContracts } =
      await evidenceGraph.buildEvidencePool({
        task,
        intent,
        target: targetQuery || primaryTargetSymbol || primaryTargetFile,
      });

    const optimizer = new EvidenceOptimizer();
    const optimization = optimizer.optimize(
      candidates,
      relevantClaims,
      relevantContracts,
      tokenBudget
    );

    const materializedSlices = includeSourceSlices ? optimization.selectedCandidates : [];

    // 5. Synthesize Architecture & Call Chain
    const callChain: string[] = [];
    const sideEffects: string[] = [];

    for (const cand of materializedSlices) {
      if (cand.role === 'target' || cand.role === 'infrastructure') {
        const matches = cand.content.match(/(?:function|const|class|async)\s+([a-zA-Z0-9_$]+)/g);
        if (matches) {
          for (const m of matches) {
            const name = m.split(/\s+/).pop();
            if (name && !callChain.includes(`${name}()`)) {
              callChain.push(`${name}()`);
            }
          }
        }
        if (/throw\s+new\s+/i.test(cand.content)) sideEffects.push('Throws guard exceptions on invalid state');
        if (/emit|dispatch|publish/i.test(cand.content)) sideEffects.push('Emits lifecycle/event notifications');
        if (/fetch|axios|http/i.test(cand.content)) sideEffects.push('Performs external network I/O');
        if (/writeFile|readFile|fs\./i.test(cand.content)) sideEffects.push('Performs filesystem operations');
      }
    }

    // 6. Extract Graph Edges for Bounded Reality
    const relevantFilesSet = new Set<string>([
      primaryTargetFile,
      ...boundary.directDependents,
      ...boundary.transitiveDependents,
      ...boundary.affectedTests,
    ]);

    const graphEdges = snapshot.graph.edges
      .filter((e) => relevantFilesSet.has(e.fromFile) || relevantFilesSet.has(e.toFile))
      .map((e) => ({
        from: e.fromFile,
        to: e.toFile,
        symbols: e.importedSymbols,
      }));

    const externalPackages: string[] = [];
    const externalReality: Record<string, ExternalPackageReality> = {};
    if (snapshot.config.packageJson) {
      const deps = {
        ...(snapshot.config.packageJson.dependencies as Record<string, string>),
        ...(snapshot.config.packageJson.devDependencies as Record<string, string>),
      };
      
      const resolver = new ExternalRealityResolver(new RegistryClient());
      for (const [depName, version] of Object.entries(deps)) {
        if (task.toLowerCase().includes(depName.toLowerCase()) || targetQuery.toLowerCase().includes(depName.toLowerCase())) {
          externalPackages.push(depName);
          const resolved = await resolver.resolve(depName, version.replace(/[\^~]/g, ''));
          if (resolved) {
            externalReality[depName] = resolved;
          }
        }
      }
    }

    // 7. Provenance details for primary target
    let createdInfo = primaryTargetFile
      ? snapshot.provenance.creationMap[primaryTargetFile]
      : undefined;
    let commitCount = primaryTargetFile
      ? snapshot.provenance.commitCountMap[primaryTargetFile]
      : undefined;

    if (primaryTargetFile && (!createdInfo || !commitCount)) {
      try {
        const { ProvenanceTracker } = await import('../provenance/tracker');
        const tracker = new ProvenanceTracker(snapshot.root);
        if (!createdInfo) {
          createdInfo = await tracker.getFileCreation(primaryTargetFile);
          snapshot.provenance.creationMap[primaryTargetFile] = createdInfo;
        }
        if (!commitCount) {
          commitCount = await tracker.getFileCommitCount(primaryTargetFile);
          snapshot.provenance.commitCountMap[primaryTargetFile] = commitCount;
        }
      } catch {}
    }

    // 8. Synthesize Breakage Risks
    const risks: TaskWorkspacePacket['reality']['risks'] = [];
    if (boundary.directDependents.length > 5 || boundary.criticality === 'HIGH') {
      risks.push({
        level: 'HIGH',
        description: `Target component is directly imported by ${boundary.directDependents.length} modules.`,
        mitigation: 'Implement backward-compatible adapters before altering signatures.',
      });
    }
    if (boundary.affectedTests.length === 0) {
      risks.push({
        level: 'MEDIUM',
        description: 'No automated tests directly cover this dependency boundary.',
        mitigation: 'Add a regression test suite before proceeding with modifications.',
      });
    }
    if (relevantContracts.some((c) => c.type === 'invariant' || c.type === 'authorization')) {
      risks.push({
        level: 'HIGH',
        description: 'Active authorization or invariant behavioral contracts attach to this subsystem.',
        mitigation: 'Verify all precondition/postcondition guards are preserved.',
      });
    }

    // 9. Synthesize Epistemic Manifest
    const assumptions = [
      'Preserve existing behavioral contracts and invariant rules.',
      'Maintain signature compatibility for all direct dependents.',
      'Ensure test coverage is updated for modified source lines.',
    ];

    const unresolvedQuestions: string[] = [];
    if (optimization.claimCoverage.some((c) => c.status === 'PARTIAL' || c.status === 'UNPROVEN')) {
      unresolvedQuestions.push(
        'Some related documentation claims could not be fully proven within the current token budget.'
      );
    }
    if (boundary.affectedApiEndpoints.length > 0) {
      assumptions.push(`Protect HTTP contract for ${boundary.affectedApiEndpoints.length} affected API route(s).`);
    }

    // 10. Compute Quality and Efficiency Metrics
    const provenClaimsCount = optimization.claimCoverage.filter((c) => c.status === 'PROVEN').length;
    const partialClaimsCount = optimization.claimCoverage.filter((c) => c.status === 'PARTIAL').length;
    const totalRelevantClaims = optimization.claimCoverage.length;

    const evidenceCompleteness =
      totalRelevantClaims > 0
        ? Number(((provenClaimsCount + partialClaimsCount * 0.5) / totalRelevantClaims).toFixed(3))
        : 1.0;

    const filesInspected = Object.keys(snapshot.graph.nodes).length;
    const filesIncluded = new Set(materializedSlices.map((s) => s.file)).size;

    const precisionScore =
      filesIncluded > 0
        ? Number((filesIncluded / Math.max(1, filesIncluded + boundary.transitiveDependents.length * 0.1)).toFixed(3))
        : 1.0;

    const boundaryCompleteness =
      boundary.directDependents.length > 0
        ? Number((filesIncluded / Math.max(1, boundary.directDependents.length + 1)).toFixed(3))
        : 1.0;

    // Context efficiency: evidence-covered claims per 1,000 source tokens
    const contextEfficiency =
      optimization.tokenCount > 0
        ? Number(((provenClaimsCount + partialClaimsCount) / (optimization.tokenCount / 1000)).toFixed(2))
        : 0;

    return {
      workspaceId,
      snapshotId: snapshot.id,
      generatedAt: new Date().toISOString(),
      manifest: {
        purpose: `Compiled task workspace for: "${task}"`,
        intent,
        target: primaryTargetFile || targetQuery || 'root',
        assumptions,
        unresolvedQuestions,
        claimCoverage: optimization.claimCoverage,
        omittedEvidence: optimization.omittedEvidence,
      },
      reality: {
        target: {
          file: primaryTargetFile,
          line: primaryTargetLine,
          symbol: primaryTargetSymbol,
          signature: primaryTargetSig,
        },
        architecture: {
          callChain,
          sideEffects,
        },
        dependencies: {
          graphEdges,
          transitiveClosure: boundary.transitiveDependents,
          externalPackages,
        },
        contracts: relevantContracts,
        config: {
          files: snapshot.config.configFiles.filter((f) =>
            relevantFilesSet.has(f) || f.includes('package.json') || f.includes('.env')
          ),
          envVars: snapshot.config.envVars,
          dbTables: snapshot.config.dbTables,
        },
        tests: {
          files: boundary.affectedTests,
          coverageGaps: boundary.affectedTests.length === 0 ? [primaryTargetFile] : [],
        },
        provenance: {
          created: createdInfo,
          recentChanges: commitCount,
          relatedIncidents: [],
        },
        risks,
        boundary,
      },
      externalReality,
      evidence: {
        claims: relevantClaims,
        gitEvidence: createdInfo ? [createdInfo] : [],
        sourceSlices: materializedSlices.map((s) => ({
          id: s.id,
          file: s.file,
          startLine: s.startLine,
          endLine: s.endLine,
          content: s.content,
          role: s.role,
          proves: s.proves,
          confidence: s.confidence,
        })),
      },
      projection: {
        quality: optimization.quality,
        evidenceSufficiency: optimization.evidenceSufficiency,
        minimumSufficientBudget: optimization.minimumSufficientBudget,
        recommendedTokenBudget: optimization.recommendedTokenBudget,
        missingCriticalEvidence: optimization.missingCriticalEvidence,
        coverageScore: optimization.coverageScore,
        precisionScore,
        evidenceCompleteness,
        boundaryCompleteness,
        contextEfficiency,
        tokenCount: optimization.tokenCount,
        tokenBudget,
        filesInspected,
        filesIncluded,
      },
    };
  }
}
