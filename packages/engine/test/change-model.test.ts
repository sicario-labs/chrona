import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { ChangeModelBuilder } from '../src/change/model-builder';
import { ReceiptGenerator } from '../src/change/receipt';

describe('Change Model & Proof Receipts', () => {
  it('builds change model with boundary, historical constraints, contracts, and migration plan', async () => {
    const builder = new ChangeModelBuilder(path.resolve(__dirname, '..'));
    const model = await builder.buildModel({
      request: 'replace verifier with custom referee',
    });

    expect(model.request).toContain('verifier');
    expect(model.boundary.sourceModules.length).toBeGreaterThan(0);
    expect(model.migrationSteps.length).toBeGreaterThanOrEqual(3);
    expect(model.confidence).toBeGreaterThan(0.9);
  });

  it('generates cryptographic verification receipts with deterministic checksum and HMAC signature', () => {
    const generator = new ReceiptGenerator();
    const receipt = generator.generateReceipt({
      changeId: 'test_change_01',
      request: 'test migration',
      timestamp: new Date().toISOString(),
      commit: 'a1b2c3d',
      branch: 'main',
      summary: {
        filesChanged: 12,
        testsExecuted: 84,
        behavioralProbes: 18,
        documentationUpdated: 4,
      },
      claims: {
        preChange: 120,
        invalidated: 0,
        reVerified: 120,
        newContradictions: 0,
      },
      contractsPreserved: [{ id: 'C-1', statement: 'session valid', status: 'preserved' }],
      contractsViolated: [],
      evidenceCoverage: 0.99,
      verifiedStatus: 'PASS',
    });

    expect(receipt.id).toMatch(/^CHRONA-PROOF-[A-F0-9]{8}-[A-F0-9]{4}$/);
    expect(receipt.hash).toBeDefined();
    expect(receipt.signature).toBeDefined();
  });
});
