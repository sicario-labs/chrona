import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { DecisionStore } from '../src/memory/decisions';
import { Forgetter } from '../src/memory/forgetter';
import { EpistemicDiffer } from '../src/memory/epistemic-diff';

describe('Epistemic Institutional Memory Subsystem', () => {
  it('records and queries architectural decisions with provenance', () => {
    const store = new DecisionStore(path.resolve(__dirname, '..'));
    const decision = store.recordDecision('We use Cloudflare Workers for edge routing', {
      rationale: 'Sub-10ms global latency and zero cold starts',
      tags: ['edge', 'infrastructure'],
    });

    expect(decision.id).toMatch(/^ADR-\d{3}$/);
    expect(decision.statement).toContain('Cloudflare');
    expect(decision.status).toBe('active');
    expect(store.getDecision(decision.id)).toBeDefined();
  });

  it('scans for orphaned knowledge no longer supported by reality', async () => {
    const forgetter = new Forgetter(path.resolve(__dirname, '..'));
    const report = await forgetter.findOrphanedKnowledge();

    expect(report.timestamp).toBeDefined();
    expect(report.recommendation).toBeDefined();
  });

  it('computes epistemic diff showing changes in software self-understanding', async () => {
    const differ = new EpistemicDiffer(path.resolve(__dirname, '..'));
    const diff = await differ.computeDiff();

    expect(diff.summary.soundnessChangePercent).toBeDefined();
    expect(diff.summary.newKnowledgeCount).toBeGreaterThanOrEqual(0);
    expect(diff.contracts).toBeDefined();
    expect(diff.decisions).toBeDefined();
  });
});
