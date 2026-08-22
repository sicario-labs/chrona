import { describe, it, expect } from 'vitest';
import { diffSnapshots } from '../src/memory/differ';
import type { VerificationResult, RepositorySnapshot } from '../src/claim/types';

describe('Memory Differ', () => {
  it('Detects new and resolved contradictions', () => {
    const prevResult = {
      claims: [
        {
          status: 'contradicted',
          claim: { subject: 'A', source: { file: 'a.md', line: 1 } },
          diagnostic: { code: 'DOC-102' }
        },
        {
          status: 'verified',
          claim: { subject: 'B', source: { file: 'b.md', line: 1 } }
        }
      ],
      summary: { totalClaims: 2, claimsVerified: 1 }
    } as unknown as VerificationResult;

    const currResult = {
      claims: [
        {
          status: 'verified', // A is now verified
          claim: { subject: 'A', source: { file: 'a.md', line: 1 } }
        },
        {
          status: 'contradicted', // B has new contradiction
          claim: { subject: 'B', source: { file: 'b.md', line: 1 } },
          diagnostic: { code: 'DOC-103' }
        }
      ],
      summary: { totalClaims: 2, claimsVerified: 1 }
    } as unknown as VerificationResult;

    const prevSnap = { symbols: new Map() } as RepositorySnapshot;
    const currSnap = { symbols: new Map() } as RepositorySnapshot;

    const diff = diffSnapshots(prevResult, currResult, prevSnap, currSnap);

    expect(diff.newContradictions.length).toBe(1);
    expect(diff.newContradictions[0].symbol).toBe('B');
    expect(diff.newContradictions[0].code).toBe('DOC-103');

    expect(diff.resolvedContradictions.length).toBe(1);
    expect(diff.resolvedContradictions[0].symbol).toBe('A');
    expect(diff.resolvedContradictions[0].code).toBe('DOC-102');
  });

  it('Detects signature changes', () => {
    const prevResult = { claims: [], summary: { totalClaims: 0, claimsVerified: 0 } } as any;
    const currResult = { claims: [], summary: { totalClaims: 0, claimsVerified: 0 } } as any;

    const prevSnap = {
      symbols: new Map([
        ['create', { signature: 'create(opts)' }],
        ['delete', { signature: 'delete(id)' }]
      ])
    } as any;

    const currSnap = {
      symbols: new Map([
        ['create', { signature: 'create(opts, overrides)' }], // breaking change
        ['delete', { signature: 'delete(id)' }] // no change
      ])
    } as any;

    const diff = diffSnapshots(prevResult, currResult, prevSnap, currSnap);

    expect(diff.signatureChanges.length).toBe(1);
    expect(diff.signatureChanges[0].symbol).toBe('create');
    expect(diff.signatureChanges[0].before).toBe('create(opts)');
    expect(diff.signatureChanges[0].after).toBe('create(opts, overrides)');
    // Breaking logic checks param count
    expect(diff.signatureChanges[0].breaking).toBe(true);
  });

  it('Computes coverage changes', () => {
    const prevResult = { claims: [{}, {}], summary: { claimsVerified: 1 } } as any;
    const currResult = { claims: [{}, {}, {}, {}], summary: { claimsVerified: 4 } } as any;

    const prevSnap = { symbols: new Map() } as any;
    const currSnap = { symbols: new Map() } as any;

    const diff = diffSnapshots(prevResult, currResult, prevSnap, currSnap);

    expect(diff.coverageChange.before).toBe(0.5); // 1/2
    expect(diff.coverageChange.after).toBe(1.0);  // 4/4
    expect(diff.coverageChange.delta).toBe(0.5);
  });
});
