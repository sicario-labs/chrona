import { describe, it, expect } from 'vitest';
import { ContractExtractor } from '../src/contracts/extractor';
import { ContractStore } from '../src/contracts/store';
import { ContractVerifier } from '../src/contracts/verifier';

describe('Behavioral Contracts Subsystem', () => {
  it('extracts runtime guards as authorization and precondition contracts', () => {
    const code = `
      export function deleteUser(user: User, id: string) {
        if (!user.isAdmin) throw new UnauthorizedError('admin role required');
        if (!id) throw new TypeError('id is required');
        return db.delete(id);
      }
    `;

    const extractor = new ContractExtractor();
    const contracts = extractor.extractFromCode(code, 'src/auth/admin.ts');

    expect(contracts.length).toBeGreaterThanOrEqual(2);
    const authContract = contracts.find((c) => c.type === 'authorization');
    expect(authContract).toBeDefined();
    expect(authContract?.statement).toContain('admin role required');
    expect(authContract?.origin).toBe('code-assertion');
  });

  it('extracts test assertions as behavioral contracts', () => {
    const testCode = `
      describe('Authentication Session', () => {
        it('users must remain authenticated after browser refresh', async () => {
          const session = await restoreSession();
          expect(session.isValid).toBe(true);
        });
      });
    `;

    const extractor = new ContractExtractor();
    const contracts = extractor.extractFromTests(testCode, 'test/auth/session.test.ts');

    expect(contracts.length).toBe(1);
    expect(contracts[0].type).toBe('persistence');
    expect(contracts[0].statement).toContain('users must remain authenticated after browser refresh');
    expect(contracts[0].origin).toBe('test-inference');
  });

  it('persists contracts and tracks violations in ContractStore', () => {
    const store = new ContractStore();
    const contract = {
      id: 'CONTRACT-TEST-01',
      type: 'invariant' as const,
      statement: 'Token expiry must be < 24h',
      subject: 'src/auth.ts',
      status: 'active' as const,
      confidence: 0.99,
      origin: 'developer-declared' as const,
      evidence: [],
      dependents: ['src/auth.ts'],
      createdAt: new Date().toISOString(),
      lastVerifiedAt: new Date().toISOString(),
    };

    store.addContract(contract);
    expect(store.getContract('CONTRACT-TEST-01')).toBeDefined();

    store.recordViolation('CONTRACT-TEST-01', 'Token expired in 48h');
    expect(store.getContract('CONTRACT-TEST-01')?.status).toBe('violated');
    expect(store.getContract('CONTRACT-TEST-01')?.violationMessage).toContain('48h');

    store.resolveViolation('CONTRACT-TEST-01');
    expect(store.getContract('CONTRACT-TEST-01')?.status).toBe('active');
  });
});
