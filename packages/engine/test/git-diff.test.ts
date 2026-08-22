import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { extractGitChanges } from '../src/git/diff';

describe('extractGitChanges', () => {
  const rootDir = path.resolve(__dirname, '../../..');

  it('extracts symbol changes gracefully from current git repository', async () => {
    const changes = await extractGitChanges({ cwd: rootDir, from: 'HEAD' });
    expect(Array.isArray(changes)).toBe(true);
  });

  it('handles non-existent or synthetic git refs without crashing', async () => {
    const changes = await extractGitChanges({ cwd: rootDir, from: 'non-existent-ref-12345' });
    expect(Array.isArray(changes)).toBe(true);
    expect(changes.length).toBe(0);
  });
});
