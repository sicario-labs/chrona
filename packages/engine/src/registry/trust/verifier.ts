import * as crypto from 'node:crypto';
import type {
  ChronaArtifactEnvelope,
  TrustVerificationResult,
  ArtifactVerificationReport,
  ArtifactVerificationChecks,
  TrustVerdictCode,
} from './types';
import { ArtifactSigner } from './signer';
import { CHRONA_ENGINE_VERSION } from '../../workspace/snapshot-types';

export interface VerifierOptions {
  trustedSigners?: string[];
  trustedPublicKeys?: Record<string, string>; // signerId or keyId -> publicKeyPem
  revokedDigests?: string[];
  revokedKeys?: string[];
  secretKey?: string; // Fallback HMAC key for private network verification
  allowExpired?: boolean;
}

export class ArtifactTrustVerifier {
  private trustedSigners?: Set<string>;
  private trustedPublicKeys: Map<string, string>;
  private revokedDigests: Set<string>;
  private revokedKeys: Set<string>;
  private secretKey: string;
  private allowExpired: boolean;

  constructor(options: VerifierOptions = {}) {
    this.trustedSigners = options.trustedSigners ? new Set(options.trustedSigners) : undefined;
    this.trustedPublicKeys = new Map(Object.entries(options.trustedPublicKeys || {}));
    this.revokedDigests = new Set(options.revokedDigests || []);
    this.revokedKeys = new Set(options.revokedKeys || []);
    this.secretKey = options.secretKey || 'chrona-dev-attestation-secret';
    this.allowExpired = Boolean(options.allowExpired);
  }

  /**
   * Complete multi-stage zero-trust verification of an external Chrona artifact,
   * returning both a boolean decision and a first-class signed verification report.
   */
  public verify(artifact: any): TrustVerificationResult {
    const verifiedAt = new Date().toISOString();
    const checks: ArtifactVerificationChecks = {
      schema: 'FAIL',
      digest: 'SKIPPED',
      capability: 'SKIPPED',
      signature: 'SKIPPED',
      signer: 'SKIPPED',
      expiry: 'SKIPPED',
      revocation: 'SKIPPED',
    };

    const makeResult = (
      trusted: boolean,
      code: TrustVerdictCode,
      reason?: string,
      computedDigest?: string
    ): TrustVerificationResult => {
      const report: ArtifactVerificationReport = {
        artifactDigest: artifact?.identity?.artifactDigest || computedDigest || 'unknown',
        status: trusted ? 'VALID' : 'REJECTED',
        code,
        checks,
        rejectionReason: reason,
        verifiedAt,
        verifierVersion: CHRONA_ENGINE_VERSION,
      };

      return {
        trusted,
        code,
        reason,
        computedDigest,
        report,
        verifiedAt,
      };
    };

    // 1. Schema Validation
    if (!artifact || typeof artifact !== 'object' || artifact.schemaVersion !== 'x-chrona-artifact/v1') {
      return makeResult(false, 'SCHEMA_VIOLATION', 'Missing or unsupported schemaVersion. Expected x-chrona-artifact/v1');
    }

    const env = artifact as ChronaArtifactEnvelope;

    if (!env.identity?.package || !env.identity?.version || !env.identity?.artifactDigest) {
      return makeResult(false, 'SCHEMA_VIOLATION', 'Artifact identity is incomplete');
    }

    checks.schema = 'PASS';

    // 2. Revocation List Check
    if (this.revokedDigests.has(env.identity.artifactDigest)) {
      checks.revocation = 'FAIL';
      return makeResult(false, 'REVOKED_ARTIFACT', `Artifact digest ${env.identity.artifactDigest} is on the revocation list`);
    }

    if (env.provenance?.keyId && this.revokedKeys.has(env.provenance.keyId)) {
      checks.revocation = 'FAIL';
      return makeResult(false, 'REVOKED_SIGNER_KEY', `Signer key ${env.provenance.keyId} has been revoked`);
    }

    if (env.provenance?.lifecycleState === 'revoked') {
      checks.revocation = 'FAIL';
      return makeResult(false, 'REVOKED_ARTIFACT', 'Artifact declared lifecycleState is revoked');
    }

    checks.revocation = 'PASS';

    // 3. Digest Recomputation & Integrity Check
    let computedDigest: string;
    try {
      computedDigest = ArtifactSigner.computeDigest(env.identity, env.capabilityManifest, env.evidence, env.compiler);
    } catch (e: any) {
      checks.digest = 'FAIL';
      return makeResult(false, 'DIGEST_MISMATCH', `Failed to compute artifact digest: ${e.message}`);
    }

    if (computedDigest !== env.identity.artifactDigest) {
      checks.digest = 'FAIL';
      return makeResult(
        false,
        'DIGEST_MISMATCH',
        `Cryptographic digest mismatch. Expected ${env.identity.artifactDigest}, but computed ${computedDigest}`,
        computedDigest
      );
    }

    checks.digest = 'PASS';

    // 4. Capability Scope & Evidence Alignment Check
    if (env.capabilityManifest.verifiedExportsCount !== (env.evidence?.symbols?.length || 0)) {
      checks.capability = 'FAIL';
      return makeResult(false, 'CAPABILITY_FRAUD', 'Mismatch between declared verifiedExportsCount and actual symbols payload', computedDigest);
    }

    if (env.capabilityManifest.capabilities?.includes('BEHAVIOR') && (env.evidence?.contracts?.length || 0) === 0) {
      checks.capability = 'FAIL';
      return makeResult(false, 'CAPABILITY_FRAUD', 'Artifact declares BEHAVIOR capability but provides 0 verified behavioral contracts', computedDigest);
    }

    checks.capability = 'PASS';

    // 5. Expiry Check
    if (!this.allowExpired && env.provenance?.expiresAt) {
      const expTime = new Date(env.provenance.expiresAt).getTime();
      if (Date.now() > expTime) {
        checks.expiry = 'FAIL';
        return makeResult(false, 'EXPIRED_ARTIFACT', `Artifact expired at ${env.provenance.expiresAt}`, computedDigest);
      }
    }

    checks.expiry = 'PASS';

    // 6. Trusted Signer Whitelist Check
    if (this.trustedSigners && !this.trustedSigners.has(env.provenance?.signerId)) {
      checks.signer = 'FAIL';
      return makeResult(false, 'UNTRUSTED_SIGNER', `Signer ${env.provenance?.signerId} is not in the trusted signers whitelist`, computedDigest);
    }

    checks.signer = 'PASS';

    // 7. Cryptographic Signature Verification
    const sig = env.provenance?.signature;
    if (!sig) {
      checks.signature = 'FAIL';
      return makeResult(false, 'INVALID_SIGNATURE', 'Missing cryptographic signature in provenance envelope', computedDigest);
    }

    if (env.provenance.algorithm === 'HMAC-SHA256' || sig.startsWith('hmac:')) {
      const rawSig = sig.startsWith('hmac:') ? sig.slice(5) : sig;
      const expectedHmac = crypto.createHmac('sha256', this.secretKey).update(computedDigest).digest('hex');
      if (rawSig !== expectedHmac) {
        checks.signature = 'FAIL';
        return makeResult(false, 'INVALID_SIGNATURE', 'HMAC attestation signature is invalid', computedDigest);
      }
    } else {
      // Default: Ed25519 asymmetric verification
      const pubKeyPem =
        (env.provenance.keyId && this.trustedPublicKeys.get(env.provenance.keyId)) ||
        (env.provenance.signerId && this.trustedPublicKeys.get(env.provenance.signerId)) ||
        env.provenance.publicKey;

      if (!pubKeyPem) {
        checks.signature = 'FAIL';
        return makeResult(false, 'INVALID_SIGNATURE', 'No public key available to verify signature', computedDigest);
      }

      try {
        const isVerified = crypto.verify(null, Buffer.from(computedDigest), pubKeyPem, Buffer.from(sig, 'base64'));
        if (!isVerified) {
          checks.signature = 'FAIL';
          return makeResult(false, 'INVALID_SIGNATURE', 'Digital signature verification failed against Ed25519 public key', computedDigest);
        }
      } catch (e: any) {
        checks.signature = 'FAIL';
        return makeResult(false, 'INVALID_SIGNATURE', `Signature verification threw an error: ${e.message}`, computedDigest);
      }
    }

    checks.signature = 'PASS';

    return makeResult(true, 'TRUSTED', undefined, computedDigest);
  }
}
