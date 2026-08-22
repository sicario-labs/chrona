import type { RegistryClient } from './client';
import type { RegistryPackageModel } from './serializer';
import type { BehavioralContract } from '../contracts/types';
import type { Claim, Evidence } from '../claim/types';
import type { ChronaArtifactEnvelope, EvidenceCapability, ArtifactVerificationReport } from './trust/types';
import { ArtifactTrustVerifier } from './trust/verifier';
import { registryModelToEvidence } from './serializer';

export interface ExternalPackageReality {
  packageName: string;
  version: string;
  commit: string;
  capabilities?: EvidenceCapability[];

  api: Array<{
    name: string;
    signature: string;
    file: string;
    line: number;
    exportKind?: string;
    parameters?: Array<{ name: string; type: string; optional: boolean }>;
    returnType?: string;
  }>;
  contracts: BehavioralContract[];
  claims: Claim[];
  evidence: Evidence[];

  integrity: {
    algorithm: 'sha256';
    digest: string;
    verified: boolean;
    trustCode?: string;
  };

  verificationReport?: ArtifactVerificationReport;

  provenance: {
    source: 'chrona-registry';
    signerId?: string;
    publishedAt: string;
    chronaVersion: string;
    parserVersion: string;
  };
}

export class ExternalRealityResolver {
  private cache = new Map<string, ExternalPackageReality>();
  private trustVerifier: ArtifactTrustVerifier;

  constructor(
    private registryClient: RegistryClient,
    trustVerifier?: ArtifactTrustVerifier
  ) {
    this.trustVerifier = trustVerifier || new ArtifactTrustVerifier();
  }

  public async resolve(specifier: string, version: string): Promise<ExternalPackageReality | null> {
    const cacheKey = `${specifier}@${version}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    try {
      const raw = await this.registryClient.fetch(specifier, version);
      if (!raw) return null;

      // Zero-Trust Verification Boundary: Canonical x-chrona-artifact/v1
      if ((raw as any).schemaVersion === 'x-chrona-artifact/v1') {
        const envelope = raw as unknown as ChronaArtifactEnvelope;
        const trustVerdict = this.trustVerifier.verify(envelope);

        if (!trustVerdict.trusted) {
          // Reject untrusted or tampered artifacts immediately
          console.warn(`[Chrona Trust Warning] Rejected untrusted artifact ${specifier}@${version}: ${trustVerdict.reason} (${trustVerdict.code})`);
          return null;
        }

        const evidence: Evidence[] = [];
        for (const sym of envelope.evidence.symbols) {
          evidence.push({
            id: `ev_registry_${envelope.identity.package}_${sym.name}`,
            source: 'dependency-export',
            file: sym.file || `${envelope.identity.package}/index.d.ts`,
            line: sym.line ?? 1,
            description: `Declared export in ${envelope.identity.package}@${envelope.identity.version}`,
            confidence: 0.998,
            verifiedAt: trustVerdict.verifiedAt,
            data: {
              symbolName: sym.name,
              signature: sym.signature,
              returnType: sym.returnType,
              package: envelope.identity.package,
              version: envelope.identity.version,
            },
          });
        }

        const reality: ExternalPackageReality = {
          packageName: envelope.identity.package,
          version: envelope.identity.version,
          commit: envelope.identity.sourceRevision,
          capabilities: envelope.capabilityManifest.capabilities,
          api: envelope.evidence.symbols.map((s) => ({
            name: s.name,
            signature: s.signature,
            file: s.file,
            line: s.line ?? 1,
            returnType: s.returnType,
          })),
          contracts: envelope.evidence.contracts || [],
          claims: envelope.evidence.claims || [],
          evidence,
          integrity: {
            algorithm: 'sha256',
            digest: envelope.identity.artifactDigest,
            verified: true,
            trustCode: trustVerdict.code,
          },
          verificationReport: trustVerdict.report,
          provenance: {
            source: 'chrona-registry',
            signerId: envelope.provenance.signerId,
            publishedAt: envelope.provenance.timestamp,
            chronaVersion: envelope.compiler.engineVersion,
            parserVersion: envelope.compiler.parserVersion,
          },
        };

        this.cache.set(cacheKey, reality);
        return reality;
      }

      // Legacy RegistryPackageModel fallback
      const model = raw as RegistryPackageModel;
      const evidence: Evidence[] = [];
      for (const sym of model.symbols) {
        const ev = registryModelToEvidence(model, sym.name);
        if (ev) evidence.push(ev);
      }

      const reality: ExternalPackageReality = {
        packageName: model.name,
        version: model.version,
        commit: model.provenance.gitCommit,
        capabilities: ['DISTRIBUTION'],
        api: model.symbols,
        contracts: [],
        claims: [],
        evidence,
        integrity: {
          algorithm: 'sha256',
          digest: model.checksum,
          verified: Boolean(model.checksum),
          trustCode: 'LEGACY_COMPAT',
        },
        provenance: {
          source: 'chrona-registry',
          publishedAt: model.publishedAt,
          chronaVersion: model.provenance.chronaVersion,
          parserVersion: '0.144.0',
        },
      };

      this.cache.set(cacheKey, reality);
      return reality;
    } catch {
      return null;
    }
  }
}
