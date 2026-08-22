import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { WhyEngine, ClaimProver, AskEngine, ChangeModelBuilder, ReceiptGenerator } from '@chrona-engine/engine';

describe('Holy Grail CLI Command Engines', () => {
  const engineRoot = path.resolve(__dirname, '../../engine');

  it('runs WhyEngine for why command', async () => {
    const whyEngine = new WhyEngine(engineRoot);
    const res = await whyEngine.explainWhy({ target: 'src/index.ts' });
    expect(res.target).toBe('src/index.ts');
    expect(res.status).toBeDefined();
    expect(res.created).toBeDefined();
  });

  it('runs ClaimProver for prove command', async () => {
    const prover = new ClaimProver(engineRoot);
    const res = await prover.proveClaim({ claim: 'DocumentationVerifier exists' });
    expect(res.verdict).toBeDefined();
    expect(res.confidence).toBeGreaterThan(0);
  });

  it('runs AskEngine for ask command', async () => {
    const askEngine = new AskEngine(engineRoot);
    const res = await askEngine.ask('Can I safely remove verifier?');
    expect(res.verdictStatement).toBe('NO.');
    expect(res.consequencesIfRemoved.length).toBeGreaterThan(0);
  });

  it('runs ChangeModelBuilder for change command', async () => {
    const builder = new ChangeModelBuilder(engineRoot);
    const model = await builder.buildModel({ request: 'replace verifier with custom referee' });
    expect(model.migrationSteps.length).toBeGreaterThan(0);
    expect(model.boundary.sourceModules.length).toBeGreaterThan(0);
  });
});
