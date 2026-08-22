import { Claim } from './types';

export interface CodeExtractorOptions {
  cwd?: string;
  includeInternalSymbols?: boolean;
}

export class CodeClaimExtractor {
  private options: CodeExtractorOptions;

  constructor(options: CodeExtractorOptions = {}) {
    this.options = { includeInternalSymbols: false, ...options };
  }

  extractClaims(code: string, filePath: string): Claim[] {
    const claims: Claim[] = [];
    const lines = code.split('\n');

    // Re-use logic from the guard detector but mapped to official Claim types
    // so the verifier can run normal compiler diagnostics on them.
    const importRegex = /^import\s+(?:{[^}]+}|\w+)\s+from\s+['"]([^'"]+)['"]/m;
    const exportRegex = /^export\s+(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/;
    const errorRegex = /throw\s+new\s+(\w+)\(/;

    lines.forEach((line, index) => {
      const lineNum = index + 1;

      // 1. Export Signatures -> Signature claims
      const expMatch = line.match(exportRegex);
      if (expMatch) {
        const funcName = expMatch[1];
        claims.push({
          type: 'signature',
          subject: funcName,
          subjectScope: 'local',
          source: { file: filePath, line: lineNum, text: line.trim() },
          metadata: { params: expMatch[2] }
        });
        
        // Also extract parameter claims
        const params = expMatch[2].split(',').map(p => p.trim().split(':')[0].split('=')[0].trim()).filter(Boolean);
        for (const p of params) {
          claims.push({
            type: 'parameter',
            subject: funcName,
            subjectScope: 'local',
            source: { file: filePath, line: lineNum, text: `accepts parameter ${p}` }
          });
        }
      }

      // 2. Import dependencies -> dependency claims
      const importMatch = line.match(importRegex);
      if (importMatch) {
        const pkg = importMatch[1];
        const destructuredMatch = line.match(/{([^}]+)}/);
        if (destructuredMatch) {
          const symbols = destructuredMatch[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0]);
          for (const sym of symbols) {
            if (sym) {
              claims.push({
                type: 'dependency',
                subject: sym,
                subjectScope: 'dependency',
                source: { file: filePath, line: lineNum, text: line.trim() },
                metadata: { pkg }
              });
            }
          }
        }
      }

      // 3. Errors -> Exception claims
      const errMatch = line.match(errorRegex);
      if (errMatch) {
        const errorType = errMatch[1];
        // naive heuristic to find nearest enclosing function
        let nearestFunc = 'unknown';
        for (let i = index; i >= 0; i--) {
           const fm = lines[i].match(/(?:function|const|let)\s+(\w+)/);
           if (fm) {
             nearestFunc = fm[1];
             break;
           }
        }
        claims.push({
          type: 'exception',
          subject: nearestFunc,
          subjectScope: 'local',
          source: { file: filePath, line: lineNum, text: line.trim() },
          metadata: { errorType }
        });
      }
    });

    return claims;
  }
}
