import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { WhyEngine } from '../src/provenance/why-engine';

describe('WhyEngine & Provenance', () => {
  it('generates why explanation with creation history and dependents', async () => {
    const engine = new WhyEngine(path.resolve(__dirname, '..'));
    const explanation = await engine.explainWhy({
      target: 'src/verifier.ts',
    });

    expect(explanation.target).toBe('src/verifier.ts');
    expect(explanation.created.commit).toBeDefined();
    expect(explanation.created.reason).toBeDefined();
    expect(explanation.evidenceSummary.codeReferences).toBeGreaterThanOrEqual(0);
  });

  it('performs deletion safety analysis when change intent is specified', async () => {
    const engine = new WhyEngine(path.resolve(__dirname, '..'));
    const explanation = await engine.explainWhy({
      target: 'src/verifier.ts',
      changeIntent: 'delete verifier.ts',
    });

    expect(explanation.deletionSafety).toBeDefined();
    expect(explanation.deletionSafety?.recommendation).toBeDefined();
  });
});
