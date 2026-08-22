import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { runChronaImpact } from '../src/commands/impact';
import { runChronaCheck } from '../src/commands/check';

describe('Chrona Impact and Diff Check Commands', () => {
  const testRepo = path.resolve(__dirname, '../../../test-repos/radix3');

  it('runs chrona impact and prints affected documentation summary', async () => {
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args.join(' '));
    });

    await runChronaImpact({ cwd: testRepo, since: 'HEAD' });

    logSpy.mockRestore();
    const output = logs.join('\n');
    expect(output).toContain('Documentation Impact');
    expect(output).toContain('Affected documentation:');
  });

  it('runs chrona impact --json and returns valid JSON structure', async () => {
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args.join(' '));
    });

    await runChronaImpact({ cwd: testRepo, since: 'HEAD', json: true });

    logSpy.mockRestore();
    const output = logs.join('\n');
    const parsed = JSON.parse(output);

    expect(parsed).toHaveProperty('commit');
    expect(parsed).toHaveProperty('affectedClaims');
    expect(parsed).toHaveProperty('affectedFiles');
    expect(parsed).toHaveProperty('diagnostics');
  });

  it('runs chrona check --diff and evaluates scoped verification', async () => {
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args.join(' '));
    });

    await runChronaCheck({ cwd: testRepo, diff: 'HEAD' });

    logSpy.mockRestore();
    const output = logs.join('\n');
    expect(output).toContain('CHRONA ⚡ Documentation Compiler');
    expect(output).toContain('recent changes');
  });
});
