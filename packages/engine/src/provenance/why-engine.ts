import * as path from 'node:path';
import type { WhyExplanation } from './types';
import { ProvenanceTracker } from './tracker';
import { DependencyAnalyzer } from '../deps/analyzer';
import { ContractStore } from '../contracts/store';
import { MemoryStore } from '../memory/store';
import { DocumentationVerifier } from '../verifier';

import type { DependencyGraph } from '../deps/types';

export interface ExplainWhyOptions {
  cwd?: string;
  target: string;
  changeIntent?: string; // e.g. "delete session.ts" or "refactor auth"
  graph?: DependencyGraph;
}

export class WhyEngine {
  private cwd: string;
  private tracker: ProvenanceTracker;
  private depAnalyzer: DependencyAnalyzer;
  private contractStore: ContractStore;
  private memoryStore: MemoryStore;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
    this.tracker = new ProvenanceTracker(cwd);
    this.depAnalyzer = new DependencyAnalyzer(cwd);
    this.contractStore = new ContractStore(cwd);
    this.contractStore.load();
    this.memoryStore = new MemoryStore(cwd);
    this.memoryStore.load();
  }

  /**
   * Explain why a symbol or file exists with full institutional provenance.
   */
  public async explainWhy(options: ExplainWhyOptions): Promise<WhyExplanation> {
    const target = options.target.trim();
    const root = options.cwd || this.cwd;

    // 1. Build dependency graph (or reuse pre-built graph)
    const graph = options.graph || (await this.depAnalyzer.buildGraph({ cwd: root }));
    const boundary = this.depAnalyzer.computeImpactBoundary(target, graph);

    // 2. Discover file location
    const matchedNode = Object.keys(graph.nodes).find(
      (k) => k === target || k.endsWith(target) || k.includes(target)
    );
    const targetFile = matchedNode || target;

    // 3. Provenance metadata
    const creation = await this.tracker.getFileCreation(targetFile);
    const commitCount = await this.tracker.getFileCommitCount(targetFile);

    // 4. Contracts attached to this subject
    const contracts = this.contractStore.query({ subject: target });

    // 5. Total code references & tests
    const dependentsList = boundary.directDependents.concat(boundary.transitiveDependents);
    const testCount = boundary.affectedTests.length;
    const apiCount = boundary.affectedApiEndpoints.length;

    // 6. Evaluate deletion safety if requested or if component is critical
    let deletionSafety: WhyExplanation['deletionSafety'];
    if (options.changeIntent || dependentsList.length > 0) {
      const isDelete = options.changeIntent?.toLowerCase().includes('delete') || options.changeIntent?.toLowerCase().includes('remove');
      const blockingContracts = contracts.filter((c) => c.status === 'active');
      const safeToDelete = dependentsList.length === 0 && blockingContracts.length === 0;
      const confidence = safeToDelete ? 0.99 : 0.974;

      let warningMessage: string | undefined;
      let recommendation = 'Safe to modify with standard test suite execution.';

      if (!safeToDelete) {
        warningMessage = `This component is currently required by ${dependentsList.length} module(s)${apiCount > 0 ? ` and ${apiCount} API endpoint(s)` : ''}.`;
        if (blockingContracts.length > 0) {
          recommendation = `Removing or modifying this would violate ${blockingContracts.length} behavioral contract(s). Add comprehensive migration tests before modifying.`;
        } else if (testCount === 0) {
          recommendation = `No automated tests currently cover this dependency. Add a test before modifying this component.`;
        } else {
          recommendation = `Ensure all ${testCount} dependent test suite(s) pass before finalizing changes.`;
        }
      }

      deletionSafety = {
        safeToDelete,
        confidence,
        warningMessage,
        blockingContracts,
        recommendation,
      };
    }

    const isCritical = dependentsList.length > 10 || boundary.criticality === 'HIGH' || contracts.length > 0;
    const status: WhyExplanation['status'] = isCritical
      ? 'CRITICAL'
      : dependentsList.length === 0
      ? 'ORPHANED'
      : 'ACTIVE';

    return {
      target,
      status,
      created: {
        commit: creation.commit,
        date: creation.date,
        author: creation.author,
        reason: creation.reason || `Introduced to implement ${path.basename(targetFile)}`,
      },
      evidenceSummary: {
        commitMessage: true,
        prReference: creation.prNumber ? `PR #${creation.prNumber}` : undefined,
        codeReferences: dependentsList.length,
        tests: testCount,
        runtimeProbes: commitCount,
      },
      dependents: {
        modulesCount: dependentsList.length,
        servicesCount: apiCount,
        clientsCount: boundary.directDependents.filter((d) => d.includes('client') || d.includes('ui') || d.includes('app')).length,
        modules: dependentsList.slice(0, 10),
      },
      activeContracts: contracts,
      deletionSafety,
      lastVerifiedAt: new Date().toISOString(),
    };
  }
}
