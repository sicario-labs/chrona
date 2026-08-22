import { ChronaWorkspace } from '../workspace/model';
import { Evidence } from '../claim/types';
import * as crypto from 'crypto';

export interface RegistryPackageModel {
  name: string;
  version: string;
  publishedAt: string;
  symbols: Array<{
    name: string;
    signature: string;
    file: string;
    line: number;
    exportKind: string;
    parameters?: Array<{ name: string; type: string; optional: boolean }>;
    returnType?: string;
  }>;
  integrity: {
    claimsVerified: number;
    contradictions: number;
    soundnessPercent: string;
  };
  provenance: {
    gitCommit: string;
    gitBranch: string;
    gitRepo?: string;
    publisherToken: string;
    buildEnvironment: string;
    nodeVersion: string;
    chronaVersion: string;
  };
  epistemicSummary: {
    totalExports: number;
    documentedExports: number;
    undocumentedExports: number;
    documentationCoverage: string;
    evidenceSources: string[];
  };
  checksum: string;
}

export interface PublishProvenanceContext {
  publisherToken: string;
  buildEnvironment: string;
  chronaVersion: string;
}

export function workspaceToRegistryModel(
  workspace: ChronaWorkspace,
  packageName: string,
  version: string,
  provenanceCtx?: Partial<PublishProvenanceContext>
): RegistryPackageModel {
  const symbols = [];
  let documentedExports = 0;
  
  // Sort symbols by name for deterministic checksums
  const sortedKeys = Array.from(workspace.software.symbols.keys()).sort();
  
  for (const key of sortedKeys) {
    const sym = workspace.software.symbols.get(key);
    if (!sym) continue;
    
    // Check if symbol has verified claims
    const hasVerifiedClaims = workspace.knowledge.claims.some(
      c => c.subject === sym.name && c.status === 'verified'
    );
    if (hasVerifiedClaims) documentedExports++;

    symbols.push({
      name: sym.name,
      signature: sym.signature,
      file: sym.file,
      line: sym.line,
      exportKind: sym.kind,
      parameters: sym.parameters.map(p => ({
        name: p.name,
        type: p.type,
        optional: p.isOptional
      })),
      returnType: sym.returnType
    });
  }

  const totalExports = symbols.length;
  const undocumentedExports = totalExports - documentedExports;
  const documentationCoverage = totalExports > 0 ? `${((documentedExports / totalExports) * 100).toFixed(1)}%` : '0.0%';

  const evidenceSources = [];
  if (workspace.evidence.astEvidence) evidenceSources.push('ast');
  if (workspace.evidence.gitEvidence) evidenceSources.push('git');
  if (workspace.evidence.packageMetadata) evidenceSources.push('package-metadata');
  if (workspace.evidence.executableExamples) evidenceSources.push('executable-examples');

  const payload: Omit<RegistryPackageModel, 'checksum'> = {
    name: packageName,
    version,
    publishedAt: new Date().toISOString(),
    symbols,
    integrity: {
      claimsVerified: workspace.knowledge.verifiedCount,
      contradictions: workspace.knowledge.contradictionCount,
      soundnessPercent: workspace.integrity.scorePercent
    },
    provenance: {
      gitCommit: workspace.manifest.commit,
      gitBranch: workspace.manifest.branch,
      gitRepo: workspace.manifest.repo,
      publisherToken: provenanceCtx?.publisherToken || 'local-publisher',
      buildEnvironment: provenanceCtx?.buildEnvironment || 'local',
      nodeVersion: process.version,
      chronaVersion: provenanceCtx?.chronaVersion || '0.2.0'
    },
    epistemicSummary: {
      totalExports,
      documentedExports,
      undocumentedExports,
      documentationCoverage,
      evidenceSources
    }
  };

  const str = JSON.stringify(payload);
  const checksum = crypto.createHash('sha256').update(str).digest('hex');

  return { ...payload, checksum };
}

export function registryModelToEvidence(
  model: RegistryPackageModel,
  symbolName: string
): Evidence | null {
  const sym = model.symbols.find(s => s.name === symbolName);
  if (!sym) return null;

  return {
    source: 'dependency-types',
    strength: 'STRONG',
    file: sym.file,
    line: sym.line,
    description: `Verified signature from Chrona Truth Registry (${model.name}@${model.version})`,
    data: {
      exists: true,
      compiles: true,
      signature: sym.signature,
      parameters: sym.parameters,
      returnType: sym.returnType
    }
  };
}
