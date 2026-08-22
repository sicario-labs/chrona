import type { ClaimType, EvidenceSource, EvidenceStrength } from '../claim/types';

export interface EvidenceRequirement {
  source: EvidenceSource;
  minStrength: EvidenceStrength;
  description: string;
}

export type EvidenceStrategy =
  | 'static-ast'
  | 'type-inference'
  | 'dependency-declaration'
  | 'test-assertion-match'
  | 'runtime-event-trace'
  | 'runtime-throw-capture'
  | 'runtime-shape-inspection'
  | 'git-provenance';

export interface EvidenceRecipe {
  claimType: ClaimType;
  requiredEvidence: EvidenceRequirement[];
  strategy: EvidenceStrategy;
  executionSteps: string[];
}

/**
 * Returns the composable Evidence Recipe required to authoritatively prove a claim type.
 */
export function getRecipeForClaim(claimType: ClaimType): EvidenceRecipe {
  switch (claimType) {
    case 'symbol':
    case 'signature':
    case 'parameter':
    case 'return':
      return {
        claimType,
        requiredEvidence: [
          { source: 'typescript-ast', minStrength: 'STRONG', description: 'Authoritative AST export declaration' },
        ],
        strategy: 'static-ast',
        executionSteps: [
          '1. Parse source AST with oxc-parser',
          '2. Match exported symbol declaration in module exports',
          '3. Extract typed signature, parameters, and return type',
        ],
      };

    case 'behavior':
    case 'ordering':
    case 'side_effect':
      return {
        claimType,
        requiredEvidence: [
          { source: 'runtime-probe', minStrength: 'STRONG', description: 'Observed runtime execution trace' },
          { source: 'test-assertion', minStrength: 'STRONG', description: 'Matching test suite assertion' },
        ],
        strategy: 'runtime-event-trace',
        executionSteps: [
          '1. Locate subject symbol in workspace',
          '2. Attach trace observer and event listeners',
          '3. Execute target operation in isolated sandbox',
          '4. Verify timestamped event sequence against claim assertion',
        ],
      };

    case 'error':
      return {
        claimType,
        requiredEvidence: [
          { source: 'runtime-probe', minStrength: 'STRONG', description: 'Captured thrown error condition' },
        ],
        strategy: 'runtime-throw-capture',
        executionSteps: [
          '1. Construct invalid or boundary input payload',
          '2. Execute target function inside sandbox wrapper',
          '3. Intercept thrown value and assert error type and message',
        ],
      };

    case 'dependency':
      return {
        claimType,
        requiredEvidence: [
          { source: 'dependency-export', minStrength: 'SUPPORTING', description: 'Declared package.json dependency' },
        ],
        strategy: 'dependency-declaration',
        executionSteps: [
          '1. Read workspace package.json manifest',
          '2. Match dependency version specification',
          '3. Verify export typings or entry points',
        ],
      };

    case 'example':
      return {
        claimType,
        requiredEvidence: [
          { source: 'compiled-example', minStrength: 'STRONG', description: 'Type-checked compiled snippet' },
        ],
        strategy: 'type-inference',
        executionSteps: [
          '1. Extract code block snippet from documentation MDX',
          '2. Parse and compile with target compiler services',
          '3. Assert 0 diagnostics or syntax errors',
        ],
      };

    default:
      return {
        claimType,
        requiredEvidence: [
          { source: 'typescript-ast', minStrength: 'STRONG', description: 'AST source ground truth' },
        ],
        strategy: 'static-ast',
        executionSteps: ['1. Perform standard AST ground truth inspection'],
      };
  }
}
