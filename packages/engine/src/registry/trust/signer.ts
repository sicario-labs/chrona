import * as crypto from 'node:crypto';
import type {
  ChronaArtifactEnvelope,
  ArtifactIdentity,
  CapabilityManifest,
  ArtifactEvidenceBody,
  CompilerAttestation,
  ArtifactProvenance,
  ArtifactEcosystem,
  EvidenceCapability,
  ArtifactLifecycleState,
} from './types';
import { CHRONA_ENGINE_VERSION, SNAPSHOT_SCHEMA_VERSION, OXC_PARSER_VERSION } from '../../workspace/snapshot-types';

export interface SignerOptions {
  signerId?: string;
  keyId?: string;
  privateKeyPem?: string;
  publicKeyPem?: string;
  useHmac?: boolean; // Only for explicit private network mode
  secretKey?: string;
}

export class ArtifactSigner {
  private signerId: string;
  private keyId: string;
  private privateKeyPem: string;
  private publicKeyPem?: string;
  private useHmac: boolean;
  private secretKey?: string;

  constructor(options: SignerOptions = {}) {
    this.signerId = options.signerId || 'chrona-official-compiler';
    this.keyId = options.keyId || 'key-ed25519-primary-v1';
    this.useHmac = Boolean(options.useHmac);
    this.secretKey = options.secretKey;

    if (this.useHmac) {
      this.privateKeyPem = '';
      this.secretKey = options.secretKey || 'chrona-dev-attestation-secret';
    } else if (options.privateKeyPem) {
      this.privateKeyPem = options.privateKeyPem;
      this.publicKeyPem = options.publicKeyPem;
    } else {
      // Default: generate standard Ed25519 asymmetric keypair
      const pair = ArtifactSigner.generateKeyPair();
      this.privateKeyPem = pair.privateKeyPem;
      this.publicKeyPem = pair.publicKeyPem;
    }
  }

  /**
   * Deterministically compute content-addressable SHA-256 digest of artifact payload.
   */
  public static computeDigest(
    identityWithoutDigest: Omit<ArtifactIdentity, 'artifactDigest'>,
    capabilityManifest: CapabilityManifest,
    evidence: ArtifactEvidenceBody,
    compiler: CompilerAttestation
  ): string {
    const payload = {
      package: identityWithoutDigest.package,
      ecosystem: identityWithoutDigest.ecosystem,
      version: identityWithoutDigest.version,
      sourceRevision: identityWithoutDigest.sourceRevision,
      capabilityManifest,
      symbols: [...evidence.symbols].sort((a, b) => a.name.localeCompare(b.name)),
      contracts: [...evidence.contracts].sort((a, b) => a.id.localeCompare(b.id)),
      claims: [...evidence.claims].sort((a, b) => a.id.localeCompare(b.id)),
      compiler,
    };

    const canonicalJson = JSON.stringify(payload);
    return crypto.createHash('sha256').update(canonicalJson).digest('hex');
  }

  /**
   * Generate an Ed25519 signing keypair for artifact distribution.
   */
  public static generateKeyPair(): { publicKeyPem: string; privateKeyPem: string } {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    return {
      publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    };
  }

  /**
   * Sign a digest using asymmetric Ed25519 (canonical) or HMAC-SHA256 (private fallback).
   */
  public signDigest(digest: string): { signature: string; algorithm: 'Ed25519' | 'HMAC-SHA256'; publicKey?: string } {
    if (this.useHmac) {
      const hmac = crypto.createHmac('sha256', this.secretKey!);
      hmac.update(digest);
      return {
        signature: `hmac:${hmac.digest('hex')}`,
        algorithm: 'HMAC-SHA256',
      };
    }

    const sign = crypto.sign(null, Buffer.from(digest), this.privateKeyPem);
    return {
      signature: sign.toString('base64'),
      algorithm: 'Ed25519',
      publicKey: this.publicKeyPem,
    };
  }

  /**
   * Build and sign a complete ChronaArtifactEnvelope.
   */
  public createArtifact(params: {
    packageName: string;
    version: string;
    ecosystem?: ArtifactEcosystem;
    sourceRevision?: string;
    capabilities: EvidenceCapability[];
    evidence: ArtifactEvidenceBody;
    lifecycleState?: ArtifactLifecycleState;
    buildEnvironment?: string;
    sourceUrl?: string;
    expiresInDays?: number;
  }): ChronaArtifactEnvelope {
    const ecosystem = params.ecosystem || 'npm';
    const sourceRevision = params.sourceRevision || 'HEAD';

    const compiler: CompilerAttestation = {
      engineVersion: CHRONA_ENGINE_VERSION,
      parserVersion: OXC_PARSER_VERSION,
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    };

    const capabilityManifest: CapabilityManifest = {
      capabilities: params.capabilities,
      verifiedExportsCount: params.evidence.symbols.length,
      contractsCount: params.evidence.contracts.length,
      claimsCount: params.evidence.claims.length,
    };

    const identityBase: Omit<ArtifactIdentity, 'artifactDigest'> = {
      package: params.packageName,
      ecosystem,
      version: params.version,
      sourceRevision,
    };

    const digest = ArtifactSigner.computeDigest(identityBase, capabilityManifest, params.evidence, compiler);

    const identity: ArtifactIdentity = {
      ...identityBase,
      artifactDigest: digest,
    };

    const { signature, algorithm, publicKey } = this.signDigest(digest);
    const now = new Date();
    const timestamp = now.toISOString();
    let expiresAt: string | undefined;

    if (params.expiresInDays) {
      const expDate = new Date(now.getTime() + params.expiresInDays * 24 * 60 * 60 * 1000);
      expiresAt = expDate.toISOString();
    }

    const provenance: ArtifactProvenance = {
      signerId: this.signerId,
      keyId: this.keyId,
      signature,
      algorithm,
      publicKey,
      timestamp,
      expiresAt,
      lifecycleState: params.lifecycleState || 'active',
      buildEnvironment: params.buildEnvironment || 'chrona-builder-node22',
      sourceUrl: params.sourceUrl,
    };

    return {
      schemaVersion: 'x-chrona-artifact/v1',
      identity,
      capabilityManifest,
      evidence: params.evidence,
      compiler,
      provenance,
    };
  }
}
