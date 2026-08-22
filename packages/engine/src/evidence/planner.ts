import type { Claim, SubjectScope } from '../claim/types';
import type { RepositorySnapshot } from '../claim/types';
import { resolvePlatformSymbol } from './sources/platform';
import { DependencyResolver } from './sources/dependency';

export interface EvidencePlan {
  claim: Claim;
  subjectScope: SubjectScope;
  requiredEvidenceTiers: number[];
  resolvers: ('ast' | 'platform' | 'dependency' | 'tests' | 'example' | 'git')[];
}

export class EvidencePlanner {
  private dependencyResolver: DependencyResolver;

  constructor(cwd: string = process.cwd()) {
    this.dependencyResolver = new DependencyResolver(cwd);
  }

  plan(claim: Claim, snapshot: RepositorySnapshot): EvidencePlan {
    const subject = claim.subject;
    const moduleSpecifier = claim.metadata?.moduleSpecifier as string | undefined;

    // 1. Determine Subject Scope
    let subjectScope: SubjectScope = 'unknown';

    if (snapshot.symbols.has(subject)) {
      subjectScope = 'workspace';
    } else if (resolvePlatformSymbol(subject)) {
      subjectScope = 'platform';
    } else if (this.dependencyResolver.resolveSymbol(subject, moduleSpecifier)) {
      subjectScope = 'dependency';
    } else if (moduleSpecifier && !moduleSpecifier.startsWith('.') && !moduleSpecifier.startsWith('/')) {
      subjectScope = 'dependency';
    }

    // 2. Select Resolvers and Evidence Tiers based on Claim Type & Scope
    const resolvers: EvidencePlan['resolvers'] = [];
    const tiers: number[] = [];

    switch (claim.type) {
      case 'symbol':
      case 'signature':
      case 'parameter':
      case 'return':
        if (subjectScope === 'workspace') {
          resolvers.push('ast', 'git', 'tests');
          tiers.push(1, 2, 3);
        } else if (subjectScope === 'platform') {
          resolvers.push('platform');
          tiers.push(4);
        } else if (subjectScope === 'dependency') {
          resolvers.push('dependency');
          tiers.push(4);
        } else {
          resolvers.push('ast', 'platform', 'dependency');
          tiers.push(1, 4);
        }
        break;

      case 'example':
        resolvers.push('example', 'ast');
        tiers.push(1, 2);
        break;

      case 'behavior':
      case 'ordering':
      case 'side_effect':
        resolvers.push('tests', 'ast');
        tiers.push(1, 2);
        break;

      default:
        resolvers.push('ast');
        tiers.push(1);
    }

    return {
      claim,
      subjectScope,
      requiredEvidenceTiers: Array.from(new Set(tiers)),
      resolvers,
    };
  }
}
