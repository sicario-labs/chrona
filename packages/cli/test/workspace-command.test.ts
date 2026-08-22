import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import { runChronaWorkspace } from '../src/commands/workspace';

describe('Chrona Workspace CLI Command', () => {
  const rootDir = path.resolve(__dirname, '../../../test-repos/radix3');

  it('runs chrona workspace and prints formatted scorecard', async () => {
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((msg) => {
      logs.push(msg);
    });

    await runChronaWorkspace({ cwd: rootDir });

    logSpy.mockRestore();
    const output = logs.join('\n');
    expect(output).toContain('Chrona Workspace');
    expect(output).toContain('Project');
    expect(output).toContain('Sources');
    expect(output).toContain('Documentation');
    expect(output).toContain('Evidence');
    expect(output).toContain('Integrity');
  });

  it('runs chrona workspace --json and returns valid JSON overview', async () => {
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((msg) => {
      logs.push(msg);
    });

    await runChronaWorkspace({ cwd: rootDir, json: true });

    logSpy.mockRestore();
    const parsed = JSON.parse(logs.join('\n')) as { manifest: { name: string }; integrity: { scorePercent: string } };
    expect(parsed.manifest.name).toBe('rou3');
    expect(parsed.integrity.scorePercent).toBeDefined();
  });

  it('runs chrona workspace --scope createRouter and outputs verified context', async () => {
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((msg) => {
      logs.push(msg);
    });

    await runChronaWorkspace({ cwd: rootDir, scope: 'createRouter' });

    logSpy.mockRestore();
    const output = logs.join('\n');
    expect(output).toContain('Verified Context for [createRouter]');
    expect(output).toContain('createRouter');
  });

  it('runs chrona workspace --explain createRouter and outputs epistemic verdict', async () => {
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((msg) => {
      logs.push(msg);
    });

    await runChronaWorkspace({ cwd: rootDir, explain: 'createRouter' });

    logSpy.mockRestore();
    const output = logs.join('\n');
    expect(output).toContain('Why does createRouter look like this?');
    expect(output).toContain('Current Implementation:');
    expect(output).toContain('Documentation References:');
    expect(output).toContain('Epistemic Verdict:');
    expect(output).toContain('Evidence Chain:');
  });

  it('runs chrona workspace --task and prints formatted TaskWorkspacePacket', async () => {
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((msg) => {
      logs.push(msg);
    });

    await runChronaWorkspace({
      cwd: rootDir,
      task: 'Add strict route matching',
      intent: 'modify',
      target: 'createRouter',
    });

    logSpy.mockRestore();
    const output = logs.join('\n');
    expect(output).toContain('Chrona Compiled Workspace Packet');
    expect(output).toContain('Workspace ID:');
    expect(output).toContain('Snapshot ID:');
    expect(output).toContain('Epistemic Certification');
    expect(output).toContain('Status:');
    expect(output).toContain('Sufficiency:');
  });

  it('runs chrona workspace --task --json and returns valid TaskWorkspacePacket JSON', async () => {
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((msg) => {
      logs.push(msg);
    });

    await runChronaWorkspace({
      cwd: rootDir,
      task: 'Refactor routing algorithm',
      intent: 'refactor',
      json: true,
    });

    logSpy.mockRestore();
    const parsed = JSON.parse(logs.join('\n'));
    expect(parsed.workspaceId).toBeDefined();
    expect(parsed.snapshotId).toBeDefined();
    expect(parsed.manifest).toBeDefined();
    expect(parsed.reality).toBeDefined();
    expect(parsed.evidence).toBeDefined();
    expect(parsed.projection).toBeDefined();
  });
});

