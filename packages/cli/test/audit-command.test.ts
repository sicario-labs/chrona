import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { runChronaAudit } from '../src/commands/audit';

describe('Chrona Reality Audit Matrix', () => {
  const rootDir = path.resolve(__dirname, '../../../');

  it('runs zero-config audits across multiple external repo archetypes', async () => {
    const results = await runChronaAudit({
      targets: [
        {
          name: 'radix3',
          archetype: 'Open Source Library',
          cwd: path.resolve(rootDir, 'test-repos/radix3'),
        },
        {
          name: 'typed-sdk',
          archetype: 'Developer API / SDK',
          cwd: path.resolve(rootDir, 'test-repos/typed-sdk'),
        },
        {
          name: 'agent-monorepo',
          archetype: 'Agent-Heavy Codebase',
          cwd: path.resolve(rootDir, 'test-repos/agent-monorepo'),
        },
      ],
      json: true,
    });

    expect(results).toHaveLength(3);

    for (const r of results) {
      expect(r.claimsDetected).toBeGreaterThanOrEqual(1);
      expect(r.precision).toBeGreaterThanOrEqual(0.75);
      expect(r.durationMs).toBeLessThan(5000);
    }

    // Verify aggregate precision across repos
    const avgPrecision = results.reduce((acc, r) => acc + r.precision, 0) / results.length;
    expect(avgPrecision).toBeGreaterThanOrEqual(0.85);
  });
});
