import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { AskEngine } from '../src/ask/engine';

describe('AskEngine Subsystem', () => {
  it('evaluates architecture removal questions with evidence grounding', async () => {
    const engine = new AskEngine(path.resolve(__dirname, '..'));
    const answer = await engine.ask('Can I safely remove verifier?');

    expect(answer.question).toContain('verifier');
    expect(answer.verdict).toBe('UNSAFE');
    expect(answer.verdictStatement).toBe('NO.');
    expect(answer.confidence).toBeGreaterThan(0.9);
    expect(answer.consequencesIfRemoved.length).toBeGreaterThan(0);
    expect(answer.suggestedMigration).toBeDefined();
  });
});
