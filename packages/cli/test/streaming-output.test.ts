import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { runChronaCheck } from '../src/commands/check';
import { NdjsonStreamWriter, type StreamEvent } from '../src/output/stream';
import type { VerificationResult } from '../../engine/src/claim/types';

describe('Streaming Output Protocol', () => {
  const testRepo = path.resolve(__dirname, '../../../test-repos/radix3');

  it('NdjsonStreamWriter emits structured parseable event stream', () => {
    const emittedLines: string[] = [];
    const mockStream = {
      write(chunk: string) {
        emittedLines.push(chunk);
        return true;
      },
    } as unknown as NodeJS.WritableStream;

    const writer = new NdjsonStreamWriter(mockStream);
    const mockResult: VerificationResult = {
      schemaVersion: 'v1',
      status: 'pass',
      errorsCount: 0,
      warningsCount: 0,
      infoCount: 0,
      claims: [
        {
          claim: {
            id: 'docs/test.mdx#L10:symbol:createRouter',
            type: 'symbol',
            source: { file: 'docs/test.mdx', line: 10, text: 'createRouter()' },
            subject: 'createRouter',
            evidence: [],
            status: 'verified',
          },
          status: 'verified',
          evidence: [],
        },
      ],
      diagnostics: [],
      summary: {
        claimsVerified: 1,
        contradictionsFound: 0,
        unverifiedCount: 0,
        ambiguousCount: 0,
        verificationTimeMs: 15,
      },
    };

    writer.emitVerificationStream(mockResult, 'test');

    expect(emittedLines.length).toBeGreaterThanOrEqual(3);
    const events: StreamEvent[] = emittedLines.map((line) => JSON.parse(line.trim()));

    expect(events[0].type).toBe('check:start');
    expect(events[events.length - 1].type).toBe('check:complete');
  });

  it('runs chrona check with --format ndjson and writes valid NDJSON lines', async () => {
    const writtenChunks: string[] = [];
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writtenChunks.push(String(chunk));
      return true;
    });

    await runChronaCheck({ cwd: testRepo, format: 'ndjson' });

    writeSpy.mockRestore();

    const output = writtenChunks.join('');
    const lines = output.trim().split('\n').filter(Boolean);

    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const line of lines) {
      const parsed = JSON.parse(line);
      expect(parsed).toHaveProperty('type');
    }
  });
});
