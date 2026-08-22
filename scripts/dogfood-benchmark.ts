import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  ChronaWorkspace,
  SnapshotBuilder,
  WorkspaceProjector,
  WhyEngine,
  ClaimProver,
  AskEngine,
  ChangeModelBuilder,
  ChangeExecutor,
  ReceiptGenerator,
  DecisionStore,
  EpistemicDiffer,
  ContractVerifier,
} from '../packages/engine/dist';

interface BenchmarkResult {
  repoName: string;
  repoPath: string;
  symbolsCount: number;
  modulesCount: number;
  claimsCount: number;
  verifiedClaims: number;
  integrityScore: string;
  workspaceCompilation: {
    workspaceId: string;
    snapshotId: string;
    coverageScore: string;
    efficiency: number;
    slicesCount: number;
    tokens: number;
  };
  whyAnalysis: {
    target: string;
    status: string;
    dependentsCount: number;
    safeToDelete: boolean;
  };
  claimProof: {
    claim: string;
    verdict: string;
    confidence: number;
  };
  architectureQuestion: {
    question: string;
    verdict: string;
    confidence: number;
    consequencesCount: number;
  };
  changeModel: {
    request: string;
    affectedModules: number;
    breakageRisksCount: number;
    migrationStepsCount: number;
    receiptId: string;
  };
}

async function runBenchmark() {
  console.log('================================================================');
  console.log('    CHRONA HOLY GRAIL: REAL-WORLD DOGFOODING & BENCHMARK SUITE   ');
  console.log('================================================================\n');

  const rootDir = process.cwd();
  const reposToTest = [
    { name: 'Chrona (Self-Dogfooding)', dir: rootDir },
    { name: 'fastify/fastify', dir: path.resolve(rootDir, 'fresh-benchmark-repos/fastify') },
    { name: 'honojs/hono', dir: path.resolve(rootDir, 'fresh-benchmark-repos/hono') },
    { name: 'sindresorhus/ky', dir: path.resolve(rootDir, 'fresh-benchmark-repos/ky') },
    { name: 'colinhacks/zod', dir: path.resolve(rootDir, 'fresh-benchmark-repos/zod') },
    { name: 'unjs/ufo', dir: path.resolve(rootDir, 'fresh-benchmark-repos/ufo') },
    { name: 'unjs/destr', dir: path.resolve(rootDir, 'fresh-benchmark-repos/destr') },
    { name: 'pmndrs/zustand', dir: path.resolve(rootDir, 'fresh-benchmark-repos/zustand') },
    { name: 'lukeed/ms', dir: path.resolve(rootDir, 'fresh-benchmark-repos/ms') },
    { name: 'motdotla/dotenv', dir: path.resolve(rootDir, 'fresh-benchmark-repos/dotenv') },
    { name: 'chalk/chalk', dir: path.resolve(rootDir, 'fresh-benchmark-repos/chalk') },
  ];

  const results: BenchmarkResult[] = [];

  for (const repo of reposToTest) {
    if (!fs.existsSync(repo.dir)) {
      console.warn(`Skipping missing repo: ${repo.name} (${repo.dir})`);
      continue;
    }

    console.log(`▶ Running verification and epistemic analysis on [${repo.name}]...`);
    const startTime = Date.now();

    try {
      // 1. Snapshot Construction (Immutable canonical reality)
      const snapshotBuilder = new SnapshotBuilder(repo.dir);
      const snapshotStartTime = Date.now();
      const snapshot = await snapshotBuilder.buildSnapshot({ cwd: repo.dir });
      const snapshotTimeMs = Date.now() - snapshotStartTime;

      // 2. Full Workspace Verification & Epistemic Model
      const workspace = await ChronaWorkspace.fromDirectory(repo.dir);
      const symbolsCount = workspace.software.symbolsCount;
      const modulesCount = workspace.software.modulesCount;
      const claimsCount = workspace.knowledge.claimsCount;
      const verifiedClaims = workspace.knowledge.verifiedCount;
      const integrityScore = workspace.integrity.scorePercent;

      // 3. Task Context Compilation via WorkspaceProjector
      const targetSymbol = Array.from(workspace.software.symbols.keys())[0] || 'index.ts';
      const projector = new WorkspaceProjector();
      const projectStartTime = Date.now();
      const taskPacket = await projector.project(snapshot, {
        task: `Refactor ${targetSymbol} to support custom options and ensure test parity`,
        intent: 'modify',
        target: targetSymbol,
        tokenBudget: 8000,
      });
      const projectTimeMs = Date.now() - projectStartTime;

      // 4. Why & Deletion Safety Analysis on a real primary module or export
      const whyEngine = new WhyEngine(repo.dir);
      const whyRes = await whyEngine.explainWhy({
        cwd: repo.dir,
        target: targetSymbol,
        changeIntent: `delete ${targetSymbol}`,
        graph: snapshot.graph,
      });

      // 5. Claim Prover on an actual exported symbol
      const claimProver = new ClaimProver(repo.dir);
      const proofClaim = targetSymbol ? `${targetSymbol} is exported` : 'index exists';
      const proofRes = await claimProver.proveClaim({
        cwd: repo.dir,
        claim: proofClaim,
      });

      // 6. Ask Engine with real architecture questions
      const askEngine = new AskEngine(repo.dir);
      const askQuestion = `Can I safely remove ${targetSymbol || 'core module'}?`;
      const askRes = await askEngine.ask(askQuestion);

      // 7. Change Model & Verification Receipt anchored to Snapshot
      const changeBuilder = new ChangeModelBuilder(repo.dir);
      const changeExecutor = new ChangeExecutor(repo.dir);
      const changeModel = await changeBuilder.buildModel({
        cwd: repo.dir,
        request: `refactor ${targetSymbol || 'core architecture'} for next version`,
        graph: snapshot.graph,
        workspaceId: taskPacket.workspaceId,
        snapshotId: snapshot.id,
      });
      const receipt = await changeExecutor.executeVerificationSweep({
        cwd: repo.dir,
        model: changeModel,
      });

      const elapsed = Date.now() - startTime;
      console.log(
        `  ✓ Completed in ${elapsed}ms (Snapshot: ${snapshotTimeMs}ms, Project: ${projectTimeMs}ms) | Workspace: ${taskPacket.workspaceId} | Slices: ${taskPacket.evidence.sourceSlices.length} | Efficiency: ${taskPacket.projection.contextEfficiency} claims/1k tokens\n`
      );

      results.push({
        repoName: repo.name,
        repoPath: repo.dir,
        symbolsCount,
        modulesCount,
        claimsCount,
        verifiedClaims,
        integrityScore,
        workspaceCompilation: {
          workspaceId: taskPacket.workspaceId,
          snapshotId: snapshot.id,
          coverageScore: `${(taskPacket.projection.coverageScore * 100).toFixed(1)}%`,
          efficiency: taskPacket.projection.contextEfficiency,
          slicesCount: taskPacket.evidence.sourceSlices.length,
          tokens: taskPacket.projection.tokenCount,
        },
        whyAnalysis: {
          target: targetSymbol,
          status: whyRes.status,
          dependentsCount: whyRes.dependents.modulesCount,
          safeToDelete: Boolean(whyRes.deletionSafety?.safeToDelete),
        },
        claimProof: {
          claim: proofClaim,
          verdict: proofRes.verdict,
          confidence: proofRes.confidence,
        },
        architectureQuestion: {
          question: askQuestion,
          verdict: askRes.verdictStatement,
          confidence: askRes.confidence,
          consequencesCount: askRes.consequencesIfRemoved.length,
        },
        changeModel: {
          request: changeModel.request,
          affectedModules: changeModel.boundary.sourceModules.length,
          breakageRisksCount: changeModel.breakageRisks.length,
          migrationStepsCount: changeModel.migrationSteps.length,
          receiptId: receipt.id,
        },
      });
    } catch (err) {
      console.error(`  ✗ Error benchmarking ${repo.name}:`, err);
    }
  }

  // Print Summary Table
  console.log('\n================================================================');
  console.log('                 FINAL REALITY BENCHMARK MATRIX                 ');
  console.log('================================================================\n');

  console.table(
    results.map((r) => ({
      Repository: r.repoName,
      Modules: r.modulesCount,
      Exports: r.symbolsCount,
      Claims: r.claimsCount,
      'Soundness %': r.integrityScore,
      'Workspace ID': r.workspaceCompilation.workspaceId,
      'Context Cov': r.workspaceCompilation.coverageScore,
      'Efficiency': `${r.workspaceCompilation.efficiency} cl/1k`,
      'Slices': `${r.workspaceCompilation.slicesCount} (${r.workspaceCompilation.tokens} tok)`,
      'Why Status': r.whyAnalysis.status,
      'Proof Verdict': r.claimProof.verdict,
      'Proof Receipt': r.changeModel.receiptId,
    }))
  );

  return results;
}

runBenchmark().catch(console.error);
