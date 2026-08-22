import type { Rule } from './types';
import type { CompilerDiagnostic } from '../compiler-types';
import type { Claim, Evidence, RepositorySnapshot } from '../claim/types';
import { resolveObjectKeys } from '../referee/oxc-extractor';

/**
 * DOC-103: PARAMETER_MISMATCH (Severity: error)
 * Trigger: Documented parameter or options object key is not accepted by the function signature.
 */
export const doc103Rule: Rule = {
  id: 'DOC-103',
  name: 'PARAMETER_MISMATCH',
  severity: 'error',
  evaluate(claim: Claim, evidence: Evidence[], snapshot: RepositorySnapshot): CompilerDiagnostic | null {
    if (claim.type !== 'parameter') return null;

    let codeParams: any[];
    let signature: string;
    let declaredParams: string[];
    let paramResolutions: any[];
    let targetSym: any;

    const astEv = evidence.find((e) => e.source === 'typescript-ast' || e.source === 'dependency-types');
    if (astEv && (astEv.data as any).exists && (astEv.data as any).parameters) {
      codeParams = (astEv.data as any).parameters;
      signature = (astEv.data as any).signature;
      declaredParams = (astEv.data as any).declaredParams || [];
      paramResolutions = (astEv.data as any).paramResolutions || [];
      targetSym = {
        file: astEv.file,
        line: (astEv as any).line || 1,
        name: claim.subject,
        signature
      };
    } else {
      const sym = snapshot.symbols.get(claim.subject);
      if (!sym || sym.kind !== 'function') return null;
      codeParams = sym.parameters;
      signature = sym.signature;
      declaredParams = sym.parameters.map((p) => p.name.replace(/^\.\.\./, ''));
      paramResolutions = sym.parameters.map((p) => resolveObjectKeys(p.type, snapshot.symbols));
      targetSym = {
        file: sym.file,
        line: sym.line,
        name: sym.name,
        signature
      };
    }

    const origin = claim.metadata?.origin as string | undefined;

    // 1. Check object keys passed in arguments
    const keys = (claim.metadata?.keys as string[]) || [];
    const lhsName = claim.metadata?.lhsName as string | null | undefined;
    const argIdx = typeof claim.metadata?.argIndex === 'number' ? claim.metadata.argIndex : 0;

    const declaredParamSet = new Set(declaredParams);
    const hasRestParam = codeParams.some((p) => p.name.startsWith('...'));

    // Named argument whose name is not a declared parameter -> phantom parameter
    if (lhsName && !declaredParamSet.has(lhsName)) {
      return {
        code: 'DOC-103',
        severity: 'error',
        message: `Unknown parameter \`${lhsName}\` in documented call to \`${claim.subject}\``,
        file: claim.source.file,
        line: claim.source.line,
        claim: claim.source.text,
        evidence: [`${targetSym.file}:${targetSym.line} ${targetSym.name}${targetSym.signature}`],
        suggestedAction: `Remove \`${lhsName}\` from the documented call to ${claim.subject}.`,
      };
    }

    if (keys.length > 0) {
      const resolution = argIdx < paramResolutions.length ? paramResolutions[argIdx] : null;

      if (!resolution) {
        if (!hasRestParam) {
          const invalidKey = keys[0];
          return phantomOptionDiagnostic(claim, invalidKey, targetSym);
        }
        return null;
      }

      if (resolution.kind === 'non-object') {
        const invalidKey = keys[0];
        return phantomOptionDiagnostic(claim, invalidKey, targetSym);
      }

      if (resolution.kind === 'object') {
        for (const key of keys) {
          if (!resolution.keys.has(key)) {
            return phantomOptionDiagnostic(claim, key, targetSym);
          }
        }
      }
    }

    // 2. Check ParamField or parameter-list items
    if (origin === 'param-field' || origin === 'parameter-list') {
      const paramName = claim.metadata?.paramName as string | undefined;
      const fullPath = (claim.metadata?.fullPath as string) || (claim.metadata?.rawParam as string);

      if (paramName) {
        // If path has a dot like `options.strict`
        if (fullPath && fullPath.includes('.')) {
          const [topParam, field] = fullPath.split('.');
          const topParamIdx = declaredParams.indexOf(topParam);
          if (topParamIdx !== -1) {
             const res = paramResolutions[topParamIdx];
            if (res && res.kind === 'object' && !res.keys.has(field)) {
              return phantomOptionDiagnostic(claim, field, targetSym);
            }
          } else if (!hasRestParam) {
            // Function does not accept topParam (e.g. createRouter has no options param)
            return phantomOptionDiagnostic(claim, field, targetSym);
          }
        } else {
          // Top-level parameter
          if (!declaredParamSet.has(paramName) && !hasRestParam) {
            // Check if it's an accepted property on any param
            const isPropertyOnAnyParam = paramResolutions.some(
              (r: any) => r && r.kind === 'object' && r.keys.has(paramName)
            );
            if (!isPropertyOnAnyParam) {
              return {
                code: 'DOC-103',
                severity: 'error',
                message: `Parameter \`${paramName}\` not found in signature for \`${claim.subject}\``,
                file: claim.source.file,
                line: claim.source.line,
                claim: claim.source.text,
                evidence: [`${targetSym.file}:${targetSym.line} ${targetSym.name}${targetSym.signature}`],
                suggestedAction: `Update parameter documentation to match the actual signature.`,
              };
            }
          }
        }
      }
    }

    return null;
  },
};

function phantomOptionDiagnostic(
  claim: Claim,
  key: string,
  sym: { file: string; line: number; name: string; signature: string }
): CompilerDiagnostic {
  return {
    code: 'DOC-103',
    severity: 'error',
    message: `Phantom option \`{ ${key} }\` not accepted by \`${sym.name}\``,
    file: claim.source.file,
    line: claim.source.line,
    claim: claim.source.text,
    evidence: [`${sym.file}:${sym.line} ${sym.name}${sym.signature}`],
    suggestedAction: `Remove the \`${key}\` option from the documented example of ${sym.name}.`,
  };
}
