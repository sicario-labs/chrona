export interface CodeClaim {
  type: 'function-call' | 'import' | 'type-annotation' | 'parameter-name';
  symbol: string;
  file: string;
  line: number;
  impliedAssertion: string;
}

export function extractCodeClaims(code: string, filePath: string): CodeClaim[] {
  const claims: CodeClaim[] = [];
  const lines = code.split('\n');

  // Regexes
  const importRegex = /^import\s+(?:{[^}]+}|\w+)\s+from\s+['"]([^'"]+)['"]/m;
  const functionCallRegex = /(\w+)\s*\(/g;
  const paramRegex = /function\s+\w*\s*\(([^)]*)\)/g;

  lines.forEach((line, index) => {
    const lineNum = index + 1;
    
    // 1. Imports
    const importMatch = line.match(importRegex);
    if (importMatch) {
      const pkg = importMatch[1];
      // Extract specific symbols if it's destructured
      const destructuredMatch = line.match(/{([^}]+)}/);
      if (destructuredMatch) {
        const symbols = destructuredMatch[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0]);
        for (const sym of symbols) {
          if (sym) {
            claims.push({
              type: 'import',
              symbol: sym,
              file: filePath,
              line: lineNum,
              impliedAssertion: `Symbol "${sym}" is imported from "${pkg}"`
            });
          }
        }
      } else {
        // default import
        const defaultMatch = line.match(/import\s+(\w+)\s+from/);
        if (defaultMatch) {
          const sym = defaultMatch[1];
          claims.push({
            type: 'import',
            symbol: sym,
            file: filePath,
            line: lineNum,
            impliedAssertion: `Default symbol "${sym}" is imported from "${pkg}"`
          });
        }
      }
    }

    // 2. Function calls
    let fcMatch;
    // reset regex state if needed, but we use matchAll or exec
    const calls = Array.from(line.matchAll(functionCallRegex));
    for (const call of calls) {
      const sym = call[1];
      if (!['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof', 'import', 'require'].includes(sym)) {
        claims.push({
          type: 'function-call',
          symbol: sym,
          file: filePath,
          line: lineNum,
          impliedAssertion: `Symbol "${sym}" is called as a function`
        });
      }
    }

    // 3. Parameter names (basic extraction)
    const paramsMatch = line.match(paramRegex);
    if (paramsMatch) {
      // Just extract basic info for now
      const pMatch = line.match(/function\s+(\w*)\s*\(([^)]*)\)/);
      if (pMatch) {
        const funcName = pMatch[1] || 'anonymous';
        const params = pMatch[2].split(',').map(p => p.trim().split(':')[0].split('=')[0].trim()).filter(Boolean);
        for (const param of params) {
          claims.push({
            type: 'parameter-name',
            symbol: funcName,
            file: filePath,
            line: lineNum,
            impliedAssertion: `Function "${funcName}" accepts parameter named "${param}"`
          });
        }
      }
    }
  });

  return claims;
}
