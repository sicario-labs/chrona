import { describe, expect, it, vi } from 'vitest';
import * as path from 'node:path';
import { runChronaDiscover } from '../src/commands/discover';
import { runChronaPlan } from '../src/commands/plan';
import { runChronaCheck } from '../src/commands/check';
import { runChronaRepair } from '../src/commands/repair';
import { runChronaBench } from '../src/commands/bench';
import { runChronaImpact } from '../src/commands/impact';

const testRepoPath = path.resolve(__dirname, '../../../test-repos/radix3');

describe('Chrona CLI Commands', () => {
  it('runs chrona discover --json and returns valid evidence structure', async () => {
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((msg) => {
      logs.push(msg);
    });

    await runChronaDiscover({ cwd: testRepoPath, json: true });

    logSpy.mockRestore();
    expect(logs.length).toBeGreaterThan(0);
    const parsed = JSON.parse(logs[0]);
    expect(parsed.exports.length).toBeGreaterThan(0);
    expect(parsed.types.length).toBeGreaterThan(0);
  });

  it('runs chrona plan against test repository', async () => {
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((msg) => {
      logs.push(msg);
    });

    await runChronaPlan({ cwd: testRepoPath });

    logSpy.mockRestore();
    const output = logs.join('\n');
    expect(output).toContain('Documentation Plan');
    expect(output).toContain('Developer tasks discovered');
  });

  it('runs chrona check and detects diagnostics in test repository', async () => {
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((msg) => {
      logs.push(msg);
    });

    await runChronaCheck({ cwd: testRepoPath });

    logSpy.mockRestore();
    const output = logs.join('\n');
    expect(output).toContain('DOC-103');
    expect(output).toContain('Phantom option');
  });

  it('chrona check --json emits a failing gate status for drifted docs (CI gate)', async () => {
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((msg) => {
      logs.push(msg);
    });

    await runChronaCheck({ cwd: testRepoPath, json: true });

    logSpy.mockRestore();
    const parsed = JSON.parse(logs[0]);
    expect(parsed).toHaveProperty('status');
    expect(parsed).toHaveProperty('diagnostics');
    // The radix3 test repo intentionally carries DOC-103 drift, so the gate
    // must report a failing status (CI fails the job on exit 1).
    expect(parsed.status).toBe('fail');
    expect(parsed.errorsCount).toBeGreaterThan(0);
  });

  it('runs chrona repair and generates agent work order', async () => {
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((msg) => {
      logs.push(msg);
    });

    await runChronaRepair({ cwd: testRepoPath });

    logSpy.mockRestore();
    const output = logs.join('\n');
    expect(output).toContain('Documentation Repair');
    expect(output).toContain('Agent Work Order Ready');
  });

  it('runs chrona bench and computes DX integrity metrics', async () => {
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((msg) => {
      logs.push(msg);
    });

    await runChronaBench({ cwd: testRepoPath });

    logSpy.mockRestore();
    const output = logs.join('\n');
    expect(output).toContain('Developer Experience Benchmark');
    expect(output).toContain('DTSR');
  });

  it(
    'runs chrona impact against base branch',
    async () => {
      const logs: string[] = [];
      const logSpy = vi.spyOn(console, 'log').mockImplementation((msg) => {
        logs.push(msg);
      });

      await runChronaImpact({ cwd: testRepoPath });

      logSpy.mockRestore();
      const output = logs.join('\n');
      expect(output).toContain('Documentation Impact');
      expect(output).toContain('Structured Agent Work Order');
    },
    20000
  );
});
