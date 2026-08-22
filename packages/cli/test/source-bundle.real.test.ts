import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { packSourceBundle, extractTarGz } from '../src/utils/source-bundle';

const REPO = path.resolve(__dirname, '../../../test-repos/radix3');

describe('packSourceBundle (real repo)', () => {
  it('packs radix3 with ignore rules and round-trips', async () => {
    const bundle = await packSourceBundle({ cwd: REPO });
    expect(bundle.fileCount).toBeGreaterThan(0);
    const extracted = extractTarGz(bundle.tarGz);
    expect(extracted.size).toBe(bundle.fileCount);
    const hasMd = [...extracted.keys()].some((k) => k.endsWith('.md'));
    expect(hasMd).toBe(true);
  }, 15000);
});