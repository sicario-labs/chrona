import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IncrementalCache } from '../src/cache/incremental-cache';
import type { Claim } from '../src/claim/types';

describe('IncrementalCache', () => {
  let tempDir: string;
  let cache: IncrementalCache;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chrona-cache-test-'));
    cache = new IncrementalCache(tempDir);
    await cache.init();
  });

  afterEach(async () => {
    await cache.clear();
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('stores and retrieves claims when file fingerprint matches', async () => {
    const claims: Claim[] = [
      {
        id: 'docs/test.mdx#L10:symbol:createRouter',
        type: 'symbol',
        source: { file: 'docs/test.mdx', line: 10, text: 'createRouter()' },
        subject: 'createRouter',
        evidence: [],
        status: 'unverified',
      },
    ];

    const hash = cache.computeHash('file-content-v1');
    await cache.setClaims('docs/test.mdx', 1000, hash, claims);
    await cache.flush();

    // Matching mtime
    const retrieved = await cache.getClaims('docs/test.mdx', 1000);
    expect(retrieved).toEqual(claims);

    // Matching hash even if mtime changes
    const retrievedByHash = await cache.getClaims('docs/test.mdx', 2000, hash);
    expect(retrievedByHash).toEqual(claims);

    // Mismatched mtime and mismatched hash returns null
    const miss = await cache.getClaims('docs/test.mdx', 2000, 'different-hash');
    expect(miss).toBeNull();
  });

  it('stores and retrieves evidence records by snapshot hash', async () => {
    const evidence = [
      {
        source: 'typescript-ast' as const,
        file: 'src/router.ts',
        line: 10,
        confidence: 1.0,
        data: { exists: true },
        description: 'AST symbol exists',
      },
    ];

    await cache.setEvidence('claim-123', 'snapshot-hash-a', evidence);
    await cache.flush();

    const hit = await cache.getEvidence('claim-123', 'snapshot-hash-a');
    expect(hit).toEqual(evidence);

    const miss = await cache.getEvidence('claim-123', 'snapshot-hash-b');
    expect(miss).toBeNull();
  });
});
