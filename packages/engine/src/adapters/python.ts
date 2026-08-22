import path from 'node:path';
import type { LanguageAdapter, ExtractedImportsExports } from './types';
import type { ExtractedSymbol, ExtractedParam, ExtractedProperty } from '../referee/oxc-extractor';
import type { BehavioralContract, ContractType } from '../contracts/types';

export class PythonAdapter implements LanguageAdapter {
  readonly name = 'python';
  readonly extensions = ['.py', '.pyi'];

  canParse(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return this.extensions.includes(ext);
  }

  extractSymbols(code: string, filePath: string): ExtractedSymbol[] {
    const symbols: ExtractedSymbol[] = [];
    const lines = code.split('\n');

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      // Detect functions: def func_name(...) -> ReturnType:
      const fnMatch = line.match(/^([ \t]*)def\s+([A-Za-z_][\w]*)\s*\(([\s\S]*?)\)(?:\s*->\s*([^:]+))?:/);
      if (fnMatch) {
        const name = fnMatch[2];
        const rawParams = fnMatch[3];
        const returnType = fnMatch[4]?.trim() || '';

        // Check preceding decorators
        const isDeprecated = i > 0 && /@(?:deprecated|typing\.deprecated)/.test(lines[i - 1]);
        const deprecationNotice = isDeprecated ? lines[i - 1].trim() : undefined;

        // Extract docstring
        let docstring: string | undefined;
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim();
          if (nextLine.startsWith('"""') || nextLine.startsWith("'''")) {
            docstring = nextLine.replace(/^['"]{3}|['"]{3}$/g, '').trim();
          }
        }

        const params = this.parsePythonParams(rawParams);
        const signature = `(${params.map((p) => `${p.name}${p.type !== 'any' ? `: ${p.type}` : ''}`).join(', ')})${returnType ? `: ${returnType}` : ''}`;

        symbols.push({
          name,
          kind: 'function',
          signature,
          file: filePath,
          line: i + 1,
          span: [0, 0],
          isDeprecated,
          deprecationNotice,
          parameters: params,
          properties: [],
          returnType,
          docstring,
        });

        i++;
        continue;
      }

      // Detect classes: class ClassName(BaseClass):
      const classMatch = line.match(/^class\s+([A-Za-z_][\w]*)(?:\(([^)]+)\))?:/);
      if (classMatch) {
        const name = classMatch[1];
        const baseClass = classMatch[2]?.trim();

        // Extract class fields
        const props: ExtractedProperty[] = [];
        let j = i + 1;
        while (j < lines.length && (lines[j].startsWith('    ') || lines[j].startsWith('\t') || !lines[j].trim())) {
          const propLine = lines[j].trim();
          const propMatch = propLine.match(/^([A-Za-z_][\w]*)\s*:\s*([^=\n]+)(?:\s*=\s*(.+))?$/);
          if (propMatch && !propLine.startsWith('def ')) {
            props.push({
              name: propMatch[1],
              type: propMatch[2].trim(),
              isOptional: Boolean(propMatch[3]),
            });
          }
          j++;
        }

        symbols.push({
          name,
          kind: 'class',
          signature: `class ${name}${baseClass ? `(${baseClass})` : ''}`,
          file: filePath,
          line: i + 1,
          span: [0, 0],
          isDeprecated: i > 0 && /@deprecated/.test(lines[i - 1]),
          parameters: [],
          properties: props,
        });

        i++;
        continue;
      }

      i++;
    }

    return symbols;
  }

  extractImportsExports(content: string, filePath: string, knownFiles: string[]): ExtractedImportsExports {
    const imports: ExtractedImportsExports['imports'] = [];
    const exports: string[] = [];
    let match: RegExpExecArray | null;

    // Python imports: from .module import foo, bar OR import foo
    const pyFromRegex = /from\s+(\.?[\w.]+)\s+import\s+([\w*,\s()]+)/g;
    while ((match = pyFromRegex.exec(content)) !== null) {
      const specifier = match[1];
      const rawSymbols = match[2].replace(/[()]/g, '');
      const symbols = rawSymbols.split(',').map((s) => s.trim()).filter(Boolean);
      const resolved = this.resolvePythonImport(specifier, filePath, knownFiles);
      imports.push({
        toFile: resolved || specifier,
        specifier,
        importedSymbols: symbols,
        isDynamic: false,
        isTypeOnly: false,
      });
    }

    const pyDirectImportRegex = /^import\s+([\w.,\s]+)/gm;
    while ((match = pyDirectImportRegex.exec(content)) !== null) {
      const modules = match[1].split(',').map((m) => m.trim().split(/\s+as\s+/)[0]).filter(Boolean);
      for (const mod of modules) {
        const resolved = this.resolvePythonImport(mod, filePath, knownFiles);
        imports.push({
          toFile: resolved || mod,
          specifier: mod,
          importedSymbols: [mod],
          isDynamic: false,
          isTypeOnly: false,
        });
      }
    }

    // Python exports: def foo(...), class Bar(...)
    const pyDefRegex = /^(?:def|class)\s+([A-Za-z0-9_]+)/gm;
    while ((match = pyDefRegex.exec(content)) !== null) {
      if (match[1] && !match[1].startsWith('_')) exports.push(match[1]);
    }

    return { imports, exports };
  }

  private resolvePythonImport(specifier: string, fromFile: string, knownFiles: string[]): string | null {
    const fromDir = path.posix.dirname(fromFile);
    if (specifier.startsWith('.')) {
      // Relative import: from .service import auth
      const clean = specifier.replace(/^\.+/, '');
      const candidate = clean ? path.posix.normalize(path.posix.join(fromDir, clean)) : fromDir;
      return this.matchKnownFile(candidate, knownFiles);
    }

    // Absolute module import: app.services.auth -> app/services/auth.py
    const asPath = specifier.replace(/\./g, '/');
    return this.matchKnownFile(asPath, knownFiles) || this.matchKnownFile(path.posix.join(fromDir, asPath), knownFiles);
  }

  private matchKnownFile(target: string, knownFiles: string[]): string | null {
    const candidates = [
      target,
      `${target}.py`,
      `${target}.pyi`,
      `${target}/__init__.py`,
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

      // Pattern A: Multi-line / single line Python error guards
      let condition: string | undefined;
      let errorClass = 'Error';
      let rawMsg = '';

      const singleLineMatch = line.match(/if\s+([^:]+):\s*(?:raise\s+([A-Za-z0-9_$]+Error|[A-Za-z0-9_$]+)\(([^)]*)\)|return\b)/);
      if (singleLineMatch) {
        condition = singleLineMatch[1].trim();
        errorClass = singleLineMatch[2] || 'Error';
        rawMsg = singleLineMatch[3] ? singleLineMatch[3].replace(/['"`]/g, '').trim() : '';
      } else if (line.trim().startsWith('if ') && line.trim().endsWith(':') && i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        const raiseMatch = nextLine.match(/^raise\s+([A-Za-z0-9_$]+Error|[A-Za-z0-9_$]+)\(([^)]*)\)/);
        if (raiseMatch) {
          condition = line.trim().replace(/^if\s+/, '').replace(/:$/, '').trim();
          errorClass = raiseMatch[1];
          rawMsg = raiseMatch[2] ? raiseMatch[2].replace(/['"`]/g, '').trim() : '';
        }
      }

      if (condition) {
        const type: ContractType = errorClass.toLowerCase().includes('auth') || condition.includes('role') || condition.includes('permission')
          ? 'authorization'
          : condition.includes('expire') || condition.includes('timeout')
          ? 'persistence'
          : condition.includes('null') || condition.includes('undefined') || condition.includes('!') || condition.includes('not ') || condition.includes('is None')
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

      // Pattern B: assert statements
      const assertMatch = line.match(/\bassert\s+([^,]+)(?:,\s*['"`]([^'"`]+)['"`])?/);
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

  private parsePythonParams(raw: string): ExtractedParam[] {
    if (!raw.trim()) return [];

    const parts = splitPythonArgs(raw);
    const params: ExtractedParam[] = [];

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed || trimmed === 'self' || trimmed === 'cls') continue;

      if (trimmed.startsWith('**')) {
        params.push({
          name: trimmed,
          type: 'dict',
          isOptional: true,
        });
        continue;
      }
      if (trimmed.startsWith('*')) {
        params.push({
          name: trimmed,
          type: 'tuple',
          isOptional: true,
        });
        continue;
      }

      const eqIdx = trimmed.indexOf('=');
      const hasDefault = eqIdx !== -1;
      const left = hasDefault ? trimmed.slice(0, eqIdx).trim() : trimmed;
      const defaultValue = hasDefault ? trimmed.slice(eqIdx + 1).trim() : undefined;

      const colonIdx = left.indexOf(':');
      if (colonIdx !== -1) {
        const name = left.slice(0, colonIdx).trim();
        const type = left.slice(colonIdx + 1).trim();
        params.push({
          name,
          type,
          isOptional: hasDefault || type.startsWith('Optional['),
          defaultValue,
        });
      } else {
        params.push({
          name: left,
          type: 'any',
          isOptional: hasDefault,
        });
      }
    }

    return params;
  }
}

function splitPythonArgs(raw: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';

  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;

    if (c === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  if (current.trim()) parts.push(current);
  return parts;
}
