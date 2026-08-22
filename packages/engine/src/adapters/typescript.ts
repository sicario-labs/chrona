import path from 'node:path';
import type { LanguageAdapter, ExtractedImportsExports } from './types';
import { FastAstExtractor, resolveObjectKeys, type ExtractedSymbol, type ObjectTypeResolution } from '../referee/oxc-extractor';
import type { BehavioralContract, ContractType } from '../contracts/types';

export class TypeScriptAdapter implements LanguageAdapter {
  readonly name = 'typescript';
  readonly extensions = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'];

  private extractor = new FastAstExtractor();

  canParse(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return this.extensions.includes(ext);
  }

  extractSymbols(code: string, filePath: string): ExtractedSymbol[] {
    return this.extractor.extract(code, filePath);
  }

  extractImportsExports(content: string, filePath: string, knownFiles: string[]): ExtractedImportsExports {
    const imports: ExtractedImportsExports['imports'] = [];
    const exports: string[] = [];

    const importRegex = /(?:import\s+(?:type\s+)?(?:([\w*\s{},$]+)\s+from\s+)?['"]([^'"]+)['"])|(?:import\(['"]([^'"]+)['"]\))/g;
    let match: RegExpExecArray | null;

    while ((match = importRegex.exec(content)) !== null) {
      const rawSymbols = match[1] || '';
      const specifier = match[2] || match[3] || '';
      const isDynamic = Boolean(match[3]);
      const isTypeOnly = match[0].includes('import type');

      const symbols = rawSymbols
        .replace(/[{}]/g, '')
        .split(',')
        .map((s) => s.trim().split(/\s+as\s+/)[0])
        .filter(Boolean);

      if (specifier) {
        const resolved = this.resolveImportTarget(specifier, filePath, knownFiles);
        imports.push({
          toFile: resolved || specifier,
          specifier,
          importedSymbols: symbols,
          isDynamic,
          isTypeOnly,
        });
      }
    }

    const exportRegex = /export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|class|const|let|var|type|interface|enum)\s+([A-Za-z0-9_$]+)/g;
    while ((match = exportRegex.exec(content)) !== null) {
      if (match[1]) exports.push(match[1]);
    }

    return { imports, exports };
  }

  private resolveImportTarget(specifier: string, fromFile: string, knownFiles: string[]): string | null {
    if (!specifier.startsWith('.')) {
      if (specifier.startsWith('@/')) {
        const withoutPrefix = 'src/' + specifier.slice(2);
        return this.matchKnownFile(withoutPrefix, knownFiles);
      }
      return null;
    }

    const fromDir = path.posix.dirname(fromFile);
    const resolved = path.posix.normalize(path.posix.join(fromDir, specifier));
    return this.matchKnownFile(resolved, knownFiles);
  }

  private matchKnownFile(target: string, knownFiles: string[]): string | null {
    const candidates = [
      target,
      `${target}.ts`,
      `${target}.tsx`,
      `${target}.js`,
      `${target}.jsx`,
      `${target}/index.ts`,
      `${target}/index.tsx`,
      `${target}/index.js`,
    ];

    for (const c of candidates) {
      if (knownFiles.includes(c)) return c;
    }
    return null;
  }

  extractContracts(content: string, filePath: string): BehavioralContract[] {
    const contracts: BehavioralContract[] = [];
    const lines = content.split(/\r?\n/);
    const relPath = filePath.replace(/\\/g, '/');
    const now = new Date().toISOString();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Pattern A: Throw / Error Guards (single and multiline)
      let condition: string | undefined;
      let errorClass = 'Error';
      let rawMsg = '';

      const throwMatch = line.match(/if\s*\(([^)]+)\)\s*(?:throw\s+new\s+([A-Za-z0-9_$]+Error|[A-Za-z0-9_$]+)\(([^)]*)\)|return\b)/);
      if (throwMatch) {
        condition = throwMatch[1].trim();
        errorClass = throwMatch[2] || 'Error';
        rawMsg = throwMatch[3] ? throwMatch[3].replace(/['"`]/g, '').trim() : '';
      } else if (line.trim().startsWith('if') && i + 1 < lines.length) {
        const ifCondMatch = line.match(/if\s*\(([^)]+)\)/);
        if (ifCondMatch) {
          const nextLine = lines[i + 1].trim();
          const throwNext = nextLine.match(/throw\s+new\s+([A-Za-z0-9_$]+Error|[A-Za-z0-9_$]+)\(([^)]*)\)/);
          if (throwNext) {
            condition = ifCondMatch[1].trim();
            errorClass = throwNext[1];
            rawMsg = throwNext[2] ? throwNext[2].replace(/['"`]/g, '').trim() : '';
          }
        }
      }

      if (condition) {
        const type: ContractType = errorClass.toLowerCase().includes('auth') || condition.includes('role') || condition.includes('permission')
          ? 'authorization'
          : condition.includes('expire') || condition.includes('timeout')
          ? 'persistence'
          : condition.includes('null') || condition.includes('undefined') || condition.includes('!')
          ? 'precondition'
          : 'invariant';

        const statement = rawMsg
          ? `Guard constraint: ${rawMsg}`
          : `Precondition [${condition}] must not trigger ${errorClass}`;

        const id = `contract:guard:${relPath.replace(/[^a-zA-Z0-9_-]/g, '_')}:L${lineNum}`;

        contracts.push({
          id,
          type,
          statement,
          subject: relPath,
          status: 'active',
          confidence: 0.95,
          origin: 'code-assertion',
          evidence: [
            {
              source: 'ast-guard',
              file: relPath,
              line: lineNum,
              snippet: line.trim(),
              description: `Enforced by runtime guard ${errorClass} on line ${lineNum}`,
              strength: 'STRONG',
              confidence: 0.95,
            },
          ],
          dependents: [relPath],
          createdAt: now,
          lastVerifiedAt: now,
        });
      }

      // Pattern B: assert() / invariant() calls
      const assertMatch = line.match(/\b(?:assert|invariant)\s*\(([^,]+)(?:,\s*['"`]([^'"`]+)['"`])?\)/);
      if (assertMatch) {
        const conditionStr = assertMatch[1].trim();
        const msg = assertMatch[2] || `Invariant ${conditionStr} must hold`;
        const id = `contract:assert:${relPath.replace(/[^a-zA-Z0-9_-]/g, '_')}:L${lineNum}`;

        contracts.push({
          id,
          type: 'invariant',
          statement: msg,
          subject: relPath,
          status: 'active',
          confidence: 0.98,
          origin: 'code-assertion',
          evidence: [
            {
              source: 'ast-guard',
              file: relPath,
              line: lineNum,
              snippet: line.trim(),
              description: `Runtime invariant assertion in ${relPath}:${lineNum}`,
              strength: 'STRONG',
              confidence: 0.98,
            },
          ],
          dependents: [relPath],
          createdAt: now,
          lastVerifiedAt: now,
        });
      }
    }

    return contracts;
  }

  resolveType(typeText: string, symbolMap: Map<string, ExtractedSymbol>): ObjectTypeResolution {
    return resolveObjectKeys(typeText, symbolMap);
  }
}
