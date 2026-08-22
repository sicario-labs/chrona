import type { ExtractedSymbol } from '../../referee/oxc-extractor';
import type { BehavioralContract } from '../../contracts/types';
import type { Claim } from '../../claim/types';

export type ArtifactEcosystem = 'npm' | 'pypi' | 'crates' | 'git' | 'internal';

export type EvidenceCapability = 'DISTRIBUTION' | 'SOURCE' | 'BEHAVIOR';

export type ArtifactLifecycleState =
  | 'published'
  | 'active'
  | 'superseded'
  | 'revoked'
  | 'expired';

export interface ArtifactIdentity {
  package: string;
  ecosystem: ArtifactEcosystem;
  version: string;
  sourceRevision: string;
  artifactDigest: string; // sha256 of normalized body
}

export interface CapabilityManifest {
  capabilities: EvidenceCapability[];
  verifiedExportsCount: number;
  contractsCount: number;
  claimsCount: number;
}

export interface ArtifactEvidenceBody {
  symbols: ExtractedSymbol[];
  contracts: BehavioralContract[];
  claims: Claim[];
}

export interface CompilerAttestation {
  engineVersion: string;
  parserVersion: string;
  schemaVersion: string;
}

export interface ArtifactProvenance {
  signerId: string;
  keyId?: string; // Identifier for public key in registry
  signature: string; // Base64 Ed25519 signature of artifactDigest
  algorithm: 'Ed25519' | 'HMAC-SHA256';
  publicKey?: string; // Optional embedded PEM public key
  timestamp: string;
  expiresAt?: string;
  lifecycleState?: ArtifactLifecycleState;
  buildEnvironment: string;
  sourceUrl?: string;
}

/**
 * The Canonical Chrona Software Reality Artifact Envelope
 */
export interface ChronaArtifactEnvelope {
  schemaVersion: 'x-chrona-artifact/v1';
  identity: ArtifactIdentity;
  capabilityManifest: CapabilityManifest;
  evidence: ArtifactEvidenceBody;
  compiler: CompilerAttestation;
  provenance: ArtifactProvenance;
}

export type TrustVerdictCode =
  | 'TRUSTED'
  | 'DIGEST_MISMATCH'
  | 'INVALID_SIGNATURE'
  | 'EXPIRED_ARTIFACT'
  | 'REVOKED_ARTIFACT'
  | 'REVOKED_SIGNER_KEY'
  | 'CAPABILITY_FRAUD'
  | 'UNTRUSTED_SIGNER'
  | 'SCHEMA_VIOLATION';

export type CheckStatus = 'PASS' | 'FAIL' | 'SKIPPED';

export interface ArtifactVerificationChecks {
  schema: CheckStatus;
  digest: CheckStatus;
  capability: CheckStatus;
  signature: CheckStatus;
  signer: CheckStatus;
  expiry: CheckStatus;
  revocation: CheckStatus;
}

/**
 * First-class, cryptographically verifiable attestation receipt of artifact verification.
 */
export interface ArtifactVerificationReport {
  artifactDigest: string;
  status: 'VALID' | 'REJECTED';
  code: TrustVerdictCode;
  checks: ArtifactVerificationChecks;
  rejectionReason?: string;
  verifiedAt: string;
  verifierVersion: string;
}

export interface TrustVerificationResult {
  trusted: boolean;
  code: TrustVerdictCode;
  reason?: string;
  computedDigest?: string;
  report: ArtifactVerificationReport;
  verifiedAt: string;
}
