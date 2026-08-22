import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { DocumentationVerifier } from '../../src/verifier';

describe('Golden Fixture Snapshot Testing', () => {
  const rootDir = path.resolve(__dirname, '../../../../test-repos/radix3');
  const verifier = new DocumentationVerifier({ cwd: rootDir });

  it('verifies valid radix3 quickstart document without false positives', async () => {
    const snapshot = await verifier.buildSnapshot();
    const validDoc = [
      '# Quickstart Guide',
      '',
      '```ts',
      'import { createRouter, addRoute, findRoute } from "radix3";',
      'const router = createRouter();',
      'addRoute(router, "GET", "/users/:id", { name: "user" });',
      'const match = findRoute(router, "/users/123");',
      '```',
      '',
      'Use `createRouter` to create a new router context.',
    ].join('\n');

    const res = verifier.verifyFile('valid-quickstart.mdx', validDoc, snapshot);
    const errors = res.diagnostics.filter((d) => d.severity === 'error');

    expect(errors).toHaveLength(0);
    expect(res.claims.length).toBeGreaterThan(0);
  });

  it('detects drifted imports and signatures in drifted document fixture', async () => {
    const snapshot = await verifier.buildSnapshot();
    const driftedDoc = [
      '# Drifted Guide',
      '',
      '```ts',
      'import { obsoleteLegacyRouteFinder, createRouter } from "radix3";',
      '```',
    ].join('\n');

    const res = verifier.verifyFile('drifted-guide.mdx', driftedDoc, snapshot);
    const doc101Errors = res.diagnostics.filter((d) => d.code === 'DOC-101');

    expect(doc101Errors).toHaveLength(1);
    expect(doc101Errors[0].message).toContain('obsoleteLegacyRouteFinder');
  });
});
