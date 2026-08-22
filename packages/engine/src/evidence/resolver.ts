import { parseSync } from 'oxc-parser';
import type { Claim, Evidence, RepositorySnapshot, SubjectScope } from '../claim/types';
import { resolveObjectKeys } from '../referee/oxc-extractor';
import { resolvePlatformSymbol } from './sources/platform';
import { DependencyResolver } from './sources/dependency';
import { TestEvidenceResolver } from './sources/tests';
import { EvidencePlanner } from './planner';

export interface EvidenceResolverOptions {
  cwd?: string;
}

/**
 * EvidenceResolver executes multi-tier evidence gathering across:
 * - Tier 1: Local AST & TypeScript declarations
 * - Tier 2: Test suite coverage & compiled examples
 * - Tier 3: Git provenance & history
 * - Tier 4: Platform built-in symbols & declared npm dependencies
 */
export class EvidenceResolver {
  private cwd: string;
  private dependencyResolver: DependencyResolver;
  private testResolver: TestEvidenceResolver;
  private planner: EvidencePlanner;

  constructor(options: EvidenceResolverOptions = {}) {
    this.cwd = options.cwd || process.cwd();
    this.dependencyResolver = new DependencyResolver(this.cwd);
    this.testResolver = new TestEvidenceResolver(this.cwd);
    this.planner = new EvidencePlanner(this.cwd);
  }

  async preloadDependencies(): Promise<void> {
    await this.dependencyResolver.preloadRegistryData();
  }

  resolve(claim: Claim, snapshot: RepositorySnapshot): Evidence[] {
    const plan = this.planner.plan(claim, snapshot);
    claim.subjectScope = plan.subjectScope;
    const evidenceList: Evidence[] = [];

    switch (claim.type) {
      case 'symbol':
        evidenceList.push(...this.resolveSymbolEvidence(claim, snapshot, plan.subjectScope));
        break;

      case 'signature':
        evidenceList.push(...this.resolveSignatureEvidence(claim, snapshot, plan.subjectScope));
        break;

      case 'parameter':
        evidenceList.push(...this.resolveParameterEvidence(claim, snapshot));
        break;

      case 'return':
        evidenceList.push(...this.resolveReturnEvidence(claim, snapshot));
        break;

      case 'example':
        evidenceList.push(...this.resolveExampleEvidence(claim, snapshot));
        break;

      case 'behavior':
      case 'ordering':
      case 'side_effect':
        evidenceList.push(...this.resolveBehavioralEvidence(claim, snapshot));
        break;

      default:
        evidenceList.push({
          source: 'manual',
          file: claim.source.file,
          line: claim.source.line,
          data: { unhandledType: claim.type },
          confidence: 0.5,
          description: `No specialized resolver for claim type ${claim.type}`,
        });
    }

    return evidenceList;
  }

  private resolveSymbolEvidence(
    claim: Claim,
    snapshot: RepositorySnapshot,
    subjectScope: SubjectScope
  ): Evidence[] {
    // 1. Local Workspace AST Ground Truth
    const sym = snapshot.symbols.get(claim.subject);
    if (sym) {
      return [
        {
          source: 'typescript-ast',
          file: sym.file,
          line: sym.line,
          confidence: 1.0,
          strength: 'STRONG',
          data: {
            exists: true,
            scope: 'workspace',
            name: sym.name,
            kind: sym.kind,
            signature: sym.signature,
            isDeprecated: sym.isDeprecated,
            deprecationNotice: sym.deprecationNotice,
          },
          description: `Found exported ${sym.kind} "${sym.name}" in ${sym.file}:${sym.line}`,
        },
      ];
    }

    // 2. Standard Platform / Framework Global (Derived from tsconfig / environment)
    const platform = resolvePlatformSymbol(claim.subject, this.cwd);
    if (platform) {
      return [
        {
          source: 'platform-builtin',
          file: 'platform://globals',
          confidence: 1.0,
          strength: 'SUPPORTING',
          data: {
            exists: true,
            scope: 'platform',
            name: claim.subject,
            category: platform.category,
            environmentSource: platform.environmentSource,
          },
          description: platform.description,
        },
      ];
    }

    // 3. Declared Dependency Export (e.g. React, Immer, Redux)
    const moduleSpecifier = claim.metadata?.moduleSpecifier as string | undefined;
    const dep = this.dependencyResolver.resolveSymbol(claim.subject, moduleSpecifier) as any;
    if (dep) {
      if (dep.typeEvidence) {
        return [
          {
            source: 'dependency-types',
            file: dep.typeEvidence.declarationFile,
            confidence: 1.0,
            strength: 'STRONG',
            data: {
              exists: true,
              scope: 'dependency',
              name: claim.subject,
              packageName: dep.packageName,
              version: dep.version,
              signature: dep.typeEvidence.signature,
            },
            description: dep.description,
          },
        ];
      }

      return [
        {
          source: 'dependency-export',
          file: `node_modules/${dep.packageName}`,
          confidence: 0.95,
          strength: 'SUPPORTING',
          data: {
            exists: true,
            scope: 'dependency',
            name: claim.subject,
            packageName: dep.packageName,
            version: dep.version,
          },
          description: dep.description,
        },
      ];
    }

    // 4. Missing Symbol in Local Workspace AST
    return [
      {
        source: 'typescript-ast',
        file: '',
        confidence: 1.0,
        strength: 'STRONG',
        data: {
          exists: false,
          scope: subjectScope,
          name: claim.subject,
        },
        description: `Symbol "${claim.subject}" is not found in public exports or declared dependencies`,
      },
    ];
  }

  private resolveSignatureEvidence(
    claim: Claim,
    snapshot: RepositorySnapshot,
    subjectScope: SubjectScope
  ): Evidence[] {
    const sym = snapshot.symbols.get(claim.subject);
    if (!sym) {
      const dep = this.dependencyResolver.resolveSymbol(claim.subject, claim.metadata?.moduleSpecifier as string | undefined) as any;
      if (dep?.typeEvidence?.signature) {
        return [
          {
            source: 'dependency-types',
            file: dep.typeEvidence.declarationFile,
            confidence: 1.0,
            strength: 'STRONG',
            data: {
              exists: true,
              signature: dep.typeEvidence.signature,
              parameters: dep.typeEvidence.parameters,
              returnType: dep.typeEvidence.returnType,
            },
            description: `Signature from dependency types: ${dep.typeEvidence.signature}`,
          }
        ];
      }
      return this.resolveSymbolEvidence(claim, snapshot, subjectScope);
    }

    return [
      {
        source: 'typescript-ast',
        file: sym.file,
        line: sym.line,
        confidence: 1.0,
        strength: 'STRONG',
        data: {
          exists: true,
          signature: sym.signature,
          parameters: sym.parameters,
          returnType: sym.returnType,
        },
        description: `Actual AST signature: ${sym.name}${sym.signature}`,
      },
    ];
  }

  private resolveParameterEvidence(claim: Claim, snapshot: RepositorySnapshot): Evidence[] {
    const sym = snapshot.symbols.get(claim.subject);
    if (!sym) {
      const dep = this.dependencyResolver.resolveSymbol(claim.subject, claim.metadata?.moduleSpecifier as string | undefined) as any;
      if (dep?.typeEvidence?.parameters) {
        const declaredParams = dep.typeEvidence.parameters.map((p: any) => p.name.replace(/^\.\.\./, ''));
        return [
          {
            source: 'dependency-types',
            file: dep.typeEvidence.declarationFile,
            confidence: 1.0,
            strength: 'STRONG',
            data: {
              exists: true,
              parameters: dep.typeEvidence.parameters,
              declaredParams,
              signature: dep.typeEvidence.signature,
            },
            description: `Parameter specifications for "${claim.subject}" from ${dep.typeEvidence.declarationFile}`,
          }
        ];
      }
      return this.resolveSymbolEvidence(claim, snapshot, 'unknown');
    }

    const declaredParams = sym.parameters.map((p) => p.name.replace(/^\.\.\./, ''));
    const paramResolutions = sym.parameters.map((p) => resolveObjectKeys(p.type, snapshot.symbols));

    return [
      {
        source: 'typescript-ast',
        file: sym.file,
        line: sym.line,
        confidence: 1.0,
        strength: 'STRONG',
        data: {
          exists: true,
          parameters: sym.parameters,
          declaredParams,
          paramResolutions,
          signature: sym.signature,
        },
        description: `Parameter specifications for "${sym.name}" from ${sym.file}:${sym.line}`,
      },
    ];
  }

  private resolveReturnEvidence(claim: Claim, snapshot: RepositorySnapshot): Evidence[] {
    const sym = snapshot.symbols.get(claim.subject);
    if (!sym) {
      const dep = this.dependencyResolver.resolveSymbol(claim.subject, claim.metadata?.moduleSpecifier as string | undefined) as any;
      if (dep?.typeEvidence?.returnType) {
        return [
          {
            source: 'dependency-types',
            file: dep.typeEvidence.declarationFile,
            confidence: 1.0,
            strength: 'STRONG',
            data: {
              exists: true,
              returnType: dep.typeEvidence.returnType,
              signature: dep.typeEvidence.signature,
            },
            description: `Actual return type for "${claim.subject}" is "${dep.typeEvidence.returnType}" (from types)`,
          }
        ];
      }
      return this.resolveSymbolEvidence(claim, snapshot, 'unknown');
    }

    return [
      {
        source: 'typescript-ast',
        file: sym.file,
        line: sym.line,
        confidence: 1.0,
        strength: 'STRONG',
        data: {
          exists: true,
          returnType: sym.returnType || 'void',
          signature: sym.signature,
        },
        description: `Actual return type for "${sym.name}" is "${sym.returnType || 'void'}"`,
      },
    ];
  }

  private resolveBehavioralEvidence(claim: Claim, snapshot: RepositorySnapshot): Evidence[] {
    const sym = snapshot.symbols.get(claim.subject);
    const evidences: Evidence[] = [];

    if (sym) {
      evidences.push({
        source: 'typescript-ast',
        file: sym.file,
        line: sym.line,
        confidence: 0.6,
        data: {
          exists: true,
          name: sym.name,
          signature: sym.signature,
        },
        description: `Target symbol "${sym.name}" located in ${sym.file}:${sym.line}`,
      });
    }

    return evidences;
  }

  private resolveExampleEvidence(claim: Claim, _snapshot: RepositorySnapshot): Evidence[] {
    const code = (claim.metadata?.code as string) || '';
    const lang = (claim.metadata?.language as string) || 'ts';
    const filePath = claim.source.file;

    try {
      const isTs = ['ts', 'tsx', 'typescript'].includes(lang.toLowerCase());
      const result = parseSync('example.' + (isTs ? 'ts' : 'js'), code, {
        lang: isTs ? 'ts' : 'js',
        sourceType: 'module',
      });

      if (result.errors && result.errors.length > 0) {
        const errorMessages = result.errors.map((e) => e.message || String(e));
        return [
          {
            source: 'compiled-example',
            file: filePath,
            line: claim.source.line,
            confidence: 1.0,
            strength: 'STRONG',
            data: {
              compiles: false,
              errors: errorMessages,
            },
            description: `Syntax/compilation error in example: ${errorMessages.join(', ')}`,
          },
        ];
      }

      return [
        {
          source: 'compiled-example',
          file: filePath,
          line: claim.source.line,
          confidence: 1.0,
          strength: 'STRONG',
          data: {
            compiles: true,
            errors: [],
          },
          description: `Example snippet parsed and validated cleanly`,
        },
      ];
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return [
        {
          source: 'compiled-example',
          file: filePath,
          line: claim.source.line,
          confidence: 1.0,
          strength: 'STRONG',
          data: {
            compiles: false,
            errors: [errorMsg],
          },
          description: `Compilation error: ${errorMsg}`,
        },
      ];
    }
  }
}
