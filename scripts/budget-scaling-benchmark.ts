import path from 'path';
import { fileURLToPath } from 'url';
import { SnapshotBuilder, WorkspaceProjector } from '../packages/engine/dist';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface BudgetResult {
  repo: string;
  task: string;
  budget: number;
  tokensUsed: number;
  slicesCount: number;
  efficiency: number;
  coverageScore: string;
  criticalTargetIncluded: boolean;
}

async function runBudgetBenchmark() {
  const rootDir = path.resolve(__dirname, '..');
  const tasks = [
    {
      repo: 'radix3',
      repoDir: path.resolve(rootDir, 'test-repos/radix3'),
      task: 'Add strict route matching option strict: boolean to createRouter and ensure trailing slashes obey strict mode',
      intent: 'modify',
      target: 'createRouter',
      targetFile: 'src/context.ts',
    },
    {
      repo: 'destr',
      repoDir: path.resolve(rootDir, 'fresh-benchmark-repos/destr'),
      task: 'Implement strict JSON deserialization mode in destr that throws SyntaxError on malformed inputs and preserve prototype pollution guards',
      intent: 'modify',
      target: 'destr',
      targetFile: 'src/index.ts',
    },
    {
      repo: 'ufo',
      repoDir: path.resolve(rootDir, 'fresh-benchmark-repos/ufo'),
      task: 'Add query parameter serializer options arrayFormat: bracket | comma | repeat to withQuery and stringifyQuery in ufo',
      intent: 'modify',
      target: 'withQuery',
      targetFile: 'src/utils.ts',
    },
  ];

  const budgets = [2000, 4000, 8000];
  const results: BudgetResult[] = [];

  console.log('════════════════════════════════════════════════════════════════════════');
  console.log('       CHRONA EVIDENCE COMPRESSION & TOKEN BUDGET SCALING TEST          ');
  console.log('════════════════════════════════════════════════════════════════════════\n');

  for (const t of tasks) {
    console.log(`▶ Building Snapshot for ${t.repo}...`);
    const builder = new SnapshotBuilder(t.repoDir);
    const snapshot = await builder.buildSnapshot();

    const projector = new WorkspaceProjector();
    for (const budget of budgets) {
      const packet = await projector.project(snapshot, {
        task: t.task,
        intent: t.intent as any,
        target: t.target,
        tokenBudget: budget,
      });

      const hasTarget = packet.evidence.sourceSlices.some((s) => s.file === t.targetFile);

      results.push({
        repo: t.repo,
        task: t.task.slice(0, 30) + '...',
        budget,
        tokensUsed: packet.projection.tokenCount,
        slicesCount: packet.evidence.sourceSlices.length,
        efficiency: Number(packet.projection.contextEfficiency.toFixed(2)),
        coverageScore: (packet.projection.coverageScore * 100).toFixed(1) + '%',
        evidenceSufficiency: ((packet.projection.evidenceSufficiency || 0) * 100).toFixed(1) + '%',
        quality: packet.projection.quality || 'VALID',
        criticalTargetIncluded: hasTarget,
      });

      console.log(`  ✓ Budget: ${budget} tok | Used: ${packet.projection.tokenCount} tok | Slices: ${packet.evidence.sourceSlices.length} | ES: ${((packet.projection.evidenceSufficiency || 0) * 100).toFixed(1)}% | Quality: ${packet.projection.quality || 'VALID'} | Target Included: ${hasTarget ? 'YES' : 'NO'}`);
    }
    console.log('');
  }

  console.log('════════════════════════════════════════════════════════════════════════');
  console.log('              BUDGET SCALING SCORECARD MATRIX                           ');
  console.log('════════════════════════════════════════════════════════════════════════');
  console.table(results);
}

runBudgetBenchmark().catch(console.error);
