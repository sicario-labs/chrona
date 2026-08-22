import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { getChronaVerificationResult, getChronaCheckReport } from '../src/commands/check';

const radix3Repo = path.resolve(__dirname, '../../../test-repos/radix3');

describe('chrona check command', () => {
  it('generates a full VerificationResult with claims and summary', async () => {
    const result = await getChronaVerificationResult(radix3Repo);

    expect(result).toBeDefined();
    expect(result.summary).toBeDefined();
    expect(typeof result.summary.claimsVerified).toBe('number');
    expect(typeof result.summary.contradictionsFound).toBe('number');
    expect(typeof result.summary.verificationTimeMs).toBe('number');
  });

  it('generates backwards-compatible CompilerVerificationReport', async () => {
    const report = await getChronaCheckReport(radix3Repo);

    expect(report.schemaVersion).toBe('v1');
    expect(['pass', 'warn', 'fail']).toContain(report.status);
    expect(Array.isArray(report.diagnostics)).toBe(true);
  });
});
