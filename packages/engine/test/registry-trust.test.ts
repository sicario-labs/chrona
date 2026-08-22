import { describe, it, expect } from 'vitest';
import { ArtifactSigner } from '../src/registry/trust/signer';
import { ArtifactTrustVerifier } from '../src/registry/trust/verifier';
import { ExternalRealityResolver } from '../src/registry/resolver';
import type { RegistryClient } from '../src/registry/client';
import type { ChronaArtifactEnvelope } from '../src/registry/trust/types';

describe('Phase III-B: Zero-Trust Artifact Protocol & Attestation', () => {
  it('signs and verifies a valid ChronaArtifactEnvelope and generates structured verification report', () => {
    const signer = new ArtifactSigner({ signerId: 'chrona-official-bot', keyId: 'key-2026-v1' });
    const envelope = signer.createArtifact({
      packageName: 'zustand',
      version: '5.0.3',
      capabilities: ['DISTRIBUTION'],
      evidence: {
        symbols: [
          {
            name: 'create',
            kind: 'function',
            signature: '<T>(initializer: StateCreator<T>): UseBoundStore<StoreApi<T>>',
            file: 'zustand/index.d.ts',
            line: 1,
            span: [0, 50],
            isDeprecated: false,
            parameters: [{ name: 'initializer', type: 'StateCreator<T>', isOptional: false }],
            properties: [],
            returnType: 'UseBoundStore<StoreApi<T>>',
          },
        ],
        contracts: [],
        claims: [],
      },
    });

    expect(envelope.schemaVersion).toBe('x-chrona-artifact/v1');
    expect(envelope.identity.artifactDigest).toHaveLength(64);
    expect(envelope.provenance.algorithm).toBe('Ed25519');

    const verifier = new ArtifactTrustVerifier();
    const result = verifier.verify(envelope);

    expect(result.trusted).toBe(true);
    expect(result.code).toBe('TRUSTED');
    expect(result.computedDigest).toBe(envelope.identity.artifactDigest);

    // Verify structured report checks
    expect(result.report.status).toBe('VALID');
    expect(result.report.checks.schema).toBe('PASS');
    expect(result.report.checks.digest).toBe('PASS');
    expect(result.report.checks.capability).toBe('PASS');
    expect(result.report.checks.signature).toBe('PASS');
    expect(result.report.checks.revocation).toBe('PASS');
  });

  it('detects payload tampering and rejects with DIGEST_MISMATCH', () => {
    const signer = new ArtifactSigner();
    const envelope = signer.createArtifact({
      packageName: 'zod',
      version: '3.23.8',
      capabilities: ['DISTRIBUTION'],
      evidence: {
        symbols: [
          {
            name: 'z',
            kind: 'variable',
            signature: 'const z: ZodTypeAny',
            file: 'zod/index.d.ts',
            line: 1,
            span: [0, 20],
            isDeprecated: false,
            parameters: [],
            properties: [],
          },
        ],
        contracts: [],
        claims: [],
      },
    });

    // Tamper with symbol signature after signing
    envelope.evidence.symbols[0].signature = 'const z: MALICIOUS_INJECTED_TYPE';

    const verifier = new ArtifactTrustVerifier();
    const result = verifier.verify(envelope);

    expect(result.trusted).toBe(false);
    expect(result.code).toBe('DIGEST_MISMATCH');
    expect(result.report.checks.digest).toBe('FAIL');
    expect(result.reason).toContain('Cryptographic digest mismatch');
  });

  it('detects capability fraud when BEHAVIOR is claimed with 0 contracts', () => {
    const signer = new ArtifactSigner();
    const envelope = signer.createArtifact({
      packageName: 'fake-safe-pkg',
      version: '1.0.0',
      capabilities: ['DISTRIBUTION', 'BEHAVIOR'], // Claiming behavior without contracts
      evidence: {
        symbols: [
          {
            name: 'safeFn',
            kind: 'function',
            signature: '() => void',
            file: 'index.d.ts',
            line: 1,
            span: [0, 10],
            isDeprecated: false,
            parameters: [],
            properties: [],
          },
        ],
        contracts: [], // Empty contracts!
        claims: [],
      },
    });

    const verifier = new ArtifactTrustVerifier();
    const result = verifier.verify(envelope);

    expect(result.trusted).toBe(false);
    expect(result.code).toBe('CAPABILITY_FRAUD');
    expect(result.report.checks.capability).toBe('FAIL');
    expect(result.reason).toContain('BEHAVIOR capability but provides 0 verified behavioral contracts');
  });

  it('rejects revoked artifact digests and compromised signing keys', () => {
    const signer = new ArtifactSigner({ signerId: 'compromised-builder', keyId: 'key-compromised-99' });
    const envelope = signer.createArtifact({
      packageName: 'compromised-pkg',
      version: '1.0.0',
      capabilities: ['DISTRIBUTION'],
      evidence: { symbols: [], contracts: [], claims: [] },
    });

    // 1. Verifier with key revocation list
    const keyRevocationVerifier = new ArtifactTrustVerifier({
      revokedKeys: ['key-compromised-99'],
    });
    const keyRevocationResult = keyRevocationVerifier.verify(envelope);
    expect(keyRevocationResult.trusted).toBe(false);
    expect(keyRevocationResult.code).toBe('REVOKED_SIGNER_KEY');
    expect(keyRevocationResult.report.checks.revocation).toBe('FAIL');

    // 2. Verifier with digest revocation list
    const digestRevocationVerifier = new ArtifactTrustVerifier({
      revokedDigests: [envelope.identity.artifactDigest],
    });
    const digestRevocationResult = digestRevocationVerifier.verify(envelope);
    expect(digestRevocationResult.trusted).toBe(false);
    expect(digestRevocationResult.code).toBe('REVOKED_ARTIFACT');
    expect(digestRevocationResult.report.checks.revocation).toBe('FAIL');

    // 3. Artifact with revoked lifecycleState
    envelope.provenance.lifecycleState = 'revoked';
    const lifecycleVerifier = new ArtifactTrustVerifier();
    const lifecycleResult = lifecycleVerifier.verify(envelope);
    expect(lifecycleResult.trusted).toBe(false);
    expect(lifecycleResult.code).toBe('REVOKED_ARTIFACT');
  });

  it('signs and verifies using asymmetric Ed25519 keypairs', () => {
    const { publicKeyPem, privateKeyPem } = ArtifactSigner.generateKeyPair();
    const signer = new ArtifactSigner({
      signerId: 'enterprise-custom-signer',
      privateKeyPem,
      publicKeyPem,
    });

    const envelope = signer.createArtifact({
      packageName: '@internal/core',
      version: '2.0.0',
      capabilities: ['DISTRIBUTION', 'SOURCE'],
      evidence: {
        symbols: [],
        contracts: [],
        claims: [],
      },
    });

    expect(envelope.provenance.publicKey).toContain('BEGIN PUBLIC KEY');

    const verifier = new ArtifactTrustVerifier();
    const result = verifier.verify(envelope);

    expect(result.trusted).toBe(true);
    expect(result.code).toBe('TRUSTED');
  });

  it('enforces zero-trust boundary and attaches verification report in ExternalRealityResolver', async () => {
    const signer = new ArtifactSigner();
    const validEnvelope = signer.createArtifact({
      packageName: 'trusted-pkg',
      version: '1.0.0',
      capabilities: ['DISTRIBUTION'],
      evidence: {
        symbols: [
          {
            name: 'trustedExport',
            kind: 'function',
            signature: '(): boolean',
            file: 'index.d.ts',
            line: 1,
            span: [0, 10],
            isDeprecated: false,
            parameters: [],
            properties: [],
          },
        ],
        contracts: [],
        claims: [],
      },
    });

    // Tampered copy
    const tamperedEnvelope: ChronaArtifactEnvelope = JSON.parse(JSON.stringify(validEnvelope));
    tamperedEnvelope.evidence.symbols.push({
      name: 'poisonedExport',
      kind: 'function',
      signature: '(): never',
      file: 'poison.d.ts',
      line: 10,
      span: [0, 10],
      isDeprecated: false,
      parameters: [],
      properties: [],
    });

    const mockClient: RegistryClient = {
      fetch: async (pkg: string) => {
        if (pkg === 'trusted-pkg') return validEnvelope as any;
        if (pkg === 'tampered-pkg') return tamperedEnvelope as any;
        return null;
      },
    } as unknown as RegistryClient;

    const resolver = new ExternalRealityResolver(mockClient);

    // 1. Valid artifact resolves into trusted reality with attached report
    const trustedReality = await resolver.resolve('trusted-pkg', '1.0.0');
    expect(trustedReality).not.toBeNull();
    expect(trustedReality?.integrity.verified).toBe(true);
    expect(trustedReality?.verificationReport?.status).toBe('VALID');
    expect(trustedReality?.verificationReport?.checks.digest).toBe('PASS');
    expect(trustedReality?.api.some((s) => s.name === 'trustedExport')).toBe(true);

    // 2. Tampered artifact is blocked and returns null
    const tamperedReality = await resolver.resolve('tampered-pkg', '1.0.0');
    expect(tamperedReality).toBeNull();
  });
});
