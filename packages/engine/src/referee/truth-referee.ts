import fs from 'node:fs/promises';
import path from 'node:path';
import type { CompilerDiagnostic, CompilerVerificationReport } from '../compiler-types';
import { FastAstExtractor, resolveObjectKeys, type ExtractedSymbol } from './oxc-extractor';
import { ContentCache } from './content-cache';

export interface RefereeOptions {
  cwd?: string;
  docsDir?: string;
  sourceDir?: string;
}

export class TruthReferee {
  private cwd: string;
  private docsDir: string;
  private sourceDir: string;
  private cache: ContentCache;
  private extractor: FastAstExtractor;

  constructor(options: RefereeOptions = {}) {
    this.cwd = options.cwd || process.cwd();
    this.docsDir = options.docsDir || path.join(this.cwd, 'content', 'docs');
    this.sourceDir = options.sourceDir || path.join(this.cwd, 'src');
    this.cache = new ContentCache(this.cwd);
    this.extractor = new FastAstExtractor();
  }

  /**
   * Run the full verification scan and produce a CompilerVerificationReport
   */
  async runVerification(): Promise<CompilerVerificationReport> {
    await this.cache.init();

    // 1. Scan and parse all codebase source files (with ContentHash / mtime incremental cache)
    const codeSymbols = await this.scanCodebase();

    // 2. Scan all MDX documentation files
    const diagnostics: CompilerDiagnostic[] = [];
    const mdxFiles = await this.findMdxFiles(this.docsDir);

    for (const mdxFile of mdxFiles) {
      const relativePath = path.relative(this.cwd, mdxFile).replace(/\\/g, '/');
      const content = await fs.readFile(mdxFile, 'utf-8');
      diagnostics.push(...auditClaims(relativePath, content, codeSymbols));
    }

    await this.cache.flush();

    const errorsCount = diagnostics.filter((d) => d.severity === 'error').length;
    const warningsCount = diagnostics.filter((d) => d.severity === 'warning').length;
    const infoCount = diagnostics.filter((d) => d.severity === 'info').length;

    return {
      schemaVersion: 'v1',
      status: errorsCount > 0 ? 'fail' : warningsCount > 0 ? 'warn' : 'pass',
      errorsCount,
      warningsCount,
      infoCount,
      diagnostics,
    };
  }

  /**
   * Scan codebase and extract typed symbols using an mtime / ContentHash incremental cache.
   *
   * Files whose filesystem mtime is unchanged since the last run short-circuit the
   * parser entirely (no read + no hash), matching the "re-hash only touched files"
   * strategy for sub-100ms local verification on large monorepos.
   */
  private async scanCodebase(): Promise<Map<string, ExtractedSymbol>> {
    const symbolMap = new Map<string, ExtractedSymbol>();
    const sourceFiles = await this.findSourceFiles(this.sourceDir);

    for (const file of sourceFiles) {
      try {
        const stat = await fs.stat(file);
        const relative = path.relative(this.cwd, file).replace(/\\/g, '/');

        // Fast path: mtime unchanged → reuse cached symbols without parsing
        const cachedByMtime = this.cache.getByMtime(relative, stat.mtimeMs);
        if (cachedByMtime) {
          for (const sym of cachedByMtime.extractedSymbols) {
            symbolMap.set(sym.name, sym);
          }
          continue;
        }

        const content = await fs.readFile(file, 'utf-8');
        const hash = this.cache.computeHash(content);

        let symbols: ExtractedSymbol[];
        const cached = this.cache.get(relative, hash);
        if (cached) {
          symbols = cached.extractedSymbols;
        } else {
          symbols = this.extractor.extract(content, relative);
          this.cache.set(relative, hash, stat.mtimeMs, symbols);
        }

        for (const sym of symbols) {
          symbolMap.set(sym.name, sym);
        }
      } catch {
        // Skip unreadable files
      }
    }

    return symbolMap;
  }

  private async findSourceFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.git') {
            files.push(...(await this.findSourceFiles(full)));
          }
        } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
          files.push(full);
        }
      }
    } catch {
      // Directory doesn't exist
    }
    return files;
  }

  private async findMdxFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...(await this.findMdxFiles(full)));
        } else if (/\.(mdx|md)$/.test(entry.name)) {
          files.push(full);
        }
      }
    } catch {
      // Directory doesn't exist
    }
    return files;
  }
}

/**
 * Audit a single MDX document's claims against the extracted codebase symbols.
 *
 * Pure function (no I/O) so the drift rules are unit-testable.
 *   - DOC-401: deprecated symbol used without a deprecation notice
 *   - DOC-103: phantom / hallucinated options passed to a documented function
 */
export function auditClaims(
  file: string,
  content: string,
  symbols: Map<string, ExtractedSymbol>
): CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = [];

  // DOC-401: Deprecated symbol used without a deprecation notice
  for (const [name, sym] of symbols) {
    if (!sym.isDeprecated) continue;
    const pattern = new RegExp(`\\b${escapeRegExp(name)}\\s*\\(`, 'g');
    const match = pattern.exec(content);
    if (!match) continue;

    const line = lineAt(content, match.index);
    const preceding = content.slice(Math.max(0, match.index - 300), match.index);
    const hasWarning = /deprecated/i.test(preceding) || /Callout type="warning"/.test(preceding);

    if (!hasWarning) {
      diagnostics.push({
        code: 'DOC-401',
        severity: 'warning',
        message: `\`${name}\` is deprecated in source; missing deprecation warning notice in documentation`,
        file,
        line,
        claim: `\`${name}\` usage documented without notice`,
        evidence: [`${sym.file}:${sym.line}`],
        suggestedAction: `Add a <Callout type="warning"> mentioning that ${name} is deprecated.`,
      });
    }
  }

  // DOC-103: Phantom / hallucinated options (data-driven from the AST signature)
  for (const [name, sym] of symbols) {
    if (sym.kind !== 'function') continue;

    const declaredParams = sym.parameters.map((p) => p.name.replace(/^\.\.\./, ''));
    const declaredParamSet = new Set(declaredParams);
    const paramResolutions = sym.parameters.map((p) => resolveObjectKeys(p.type, symbols));
    const hasRestParam = sym.parameters.some((p) => p.name.startsWith('...'));
    const pattern = new RegExp(`\\b${escapeRegExp(name)}\\s*\\(`, 'g');

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const open = match.index + match[0].length - 1;
      const close = findClosingParen(content, open);
      if (close === -1) continue;

      const args = splitCallArgs(content.slice(open + 1, close));
      const line = lineAt(content, match.index);

      args.forEach((arg, index) => {
        const { keys, lhsName } = extractObjectKeysFromArg(arg);
        if (keys.length === 0) return;

        // Named argument whose name is not a declared parameter → phantom parameter
        if (lhsName && !declaredParamSet.has(lhsName)) {
          diagnostics.push({
            code: 'DOC-103',
            severity: 'error',
            message: `Unknown parameter \`${lhsName}\` in documented call to \`${name}\``,
            file,
            line,
            claim: `${name} accepts a \`${lhsName}\` parameter`,
            evidence: [`${sym.file}:${sym.line} ${sym.signature}`],
            suggestedAction: `Remove \`${lhsName}\` from the documented call to ${name}.`,
          });
          return;
        }

        const resolution = index < paramResolutions.length ? paramResolutions[index] : null;
        if (!resolution) {
          if (!hasRestParam) {
            for (const key of keys) {
              diagnostics.push(phantomOption(file, line, name, key, sym));
            }
          }
          return;
        }
        if (resolution.kind === 'unknown') return;
        if (resolution.kind === 'non-object') {
          for (const key of keys) {
            diagnostics.push(phantomOption(file, line, name, key, sym));
          }
          return;
        }
        for (const key of keys) {
          if (!resolution.keys.has(key)) {
            diagnostics.push(phantomOption(file, line, name, key, sym));
          }
        }
      });
    }
  }

  return diagnostics;
}

function phantomOption(
  file: string,
  line: number,
  name: string,
  key: string,
  sym: ExtractedSymbol
): CompilerDiagnostic {
  return {
    code: 'DOC-103',
    severity: 'error',
    message: `Phantom option \`{ ${key} }\` not accepted by \`${name}\``,
    file,
    line,
    claim: `${name} accepts { ${key}: ... }`,
    evidence: [`${sym.file}:${sym.line} ${sym.signature}`],
    suggestedAction: `Remove the \`${key}\` option from the documented example of ${name}.`,
  };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function lineAt(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
}

/**
 * Find the index of the closing paren matching `open`, respecting nesting and strings.
 */
function findClosingParen(text: string, open: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote && text[i - 1] !== '\\') quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = c;
      continue;
    }
    if (c === '(' || c === '{' || c === '[') {
      depth++;
    } else if (c === ')' || c === '}' || c === ']') {
      depth--;
      if (depth === 0 && c === ')') return i;
    }
  }
  return -1;
}

/**
 * Split a call argument list on top-level commas (strings/templates/nesting aware).
 */
function splitCallArgs(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      current += c;
      if (c === quote && text[i - 1] !== '\\') quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = c;
      current += c;
      continue;
    }
    if (c === '(' || c === '{' || c === '[') {
      depth++;
      current += c;
      continue;
    }
    if (c === ')' || c === '}' || c === ']') {
      depth--;
      current += c;
      continue;
    }
    if (c === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += c;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

/**
 * Extract the top-level object-literal keys from a call argument plus an optional
 * named-argument prefix (`options?: { ... }` → lhsName "options").
 */
function extractObjectKeysFromArg(arg: string): { keys: string[]; lhsName: string | null } {
  const trimmed = arg.trim();
  const lhsMatch = trimmed.match(/^([A-Za-z_$][\w$]*)\s*\??\s*:/);
  const lhsName = lhsMatch ? lhsMatch[1] : null;

  const keys = new Set<string>();
  let nesting = 0;
  let quote: string | null = null;

  for (let i = 0; i < arg.length; i++) {
    const c = arg[i];
    if (quote) {
      if (c === quote && arg[i - 1] !== '\\') quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = c;
      continue;
    }
    if (c === '(' || c === '[') {
      nesting++;
      continue;
    }
    if (c === '{') {
      if (nesting === 0) {
        const close = findMatchingBrace(arg, i);
        if (close === -1) break;
        for (const key of keysOfObjectBody(arg.slice(i + 1, close))) keys.add(key);
        i = close;
      } else {
        nesting++;
      }
      continue;
    }
    if (c === ')' || c === ']') {
      nesting--;
      continue;
    }
    if (c === '}') nesting--;
  }

  return { keys: [...keys], lhsName };
}

/**
 * Find the index of the matching `}` for the `{` at `open`.
 */
function findMatchingBrace(text: string, open: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote && text[i - 1] !== '\\') quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = c;
      continue;
    }
    if (c === '{' || c === '(' || c === '[') {
      depth++;
    } else if (c === '}' || c === ')' || c === ']') {
      depth--;
      if (depth === 0 && c === '}') return i;
    }
  }
  return -1;
}

/**
 * Extract the keys of an object literal body (the text between `{` and `}`).
 * Only top-level keys are collected; values (including nested objects, strings,
 * booleans, and spreads) are skipped so value identifiers are never misread as keys.
 */
function keysOfObjectBody(body: string): string[] {
  const keys: string[] = [];
  let i = 0;
  let quote: string | null = null;

  while (i < body.length) {
    const c = body[i];
    if (quote) {
      if (c === quote && body[i - 1] !== '\\') quote = null;
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = c;
      i++;
      continue;
    }

    const rest = body.slice(i);

    // skip spread `...rest`
    if (rest.startsWith('...')) {
      i = skipUntilSeparator(body, i + 3);
      continue;
    }
    // skip computed key `[expr]`
    if (rest.startsWith('[')) {
      const close = findMatchingBrace(body, i);
      i = close === -1 ? body.length : close + 1;
      continue;
    }
    // quoted key `'name': value`
    const quoted = rest.match(/^(["'])((?:\\.|(?!\1).)*?)\1\s*:/);
    if (quoted) {
      keys.push(quoted[2]);
      i = skipValue(body, i + quoted[0].length);
      continue;
    }
    // identifier key `name: value`
    const ident = rest.match(/^([A-Za-z_$][\w$]*)\s*:/);
    if (ident) {
      keys.push(ident[1]);
      i = skipValue(body, i + ident[0].length);
      continue;
    }
    // numeric key `1: value`
    const numeric = rest.match(/^(\d+)\s*:/);
    if (numeric) {
      keys.push(numeric[1]);
      i = skipValue(body, i + numeric[0].length);
      continue;
    }
    // method shorthand `name(...)`
    const method = rest.match(/^([A-Za-z_$][\w$]*)\s*\(/);
    if (method) {
      const close = findClosingParen(body, i + method[0].length - 1);
      i = close === -1 ? body.length : close + 1;
      continue;
    }
    // shorthand key `name` followed by `,` or `}`
    const shorthand = rest.match(/^([A-Za-z_$][\w$]*)\s*(?=,|})/);
    if (shorthand) {
      keys.push(shorthand[1]);
      i += shorthand[0].length;
      continue;
    }
    i++;
  }
  return keys;
}

/**
 * Skip past a property value, stopping at the next top-level `,` or `}`.
 */
function skipValue(text: string, start: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote && text[i - 1] !== '\\') quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = c;
      continue;
    }
    if (c === '{' || c === '(' || c === '[') {
      depth++;
      continue;
    }
    if (c === '}' || c === ')' || c === ']') {
      if (depth === 0) return i + 1;
      depth--;
      continue;
    }
    if (c === ',' && depth === 0) return i + 1;
  }
  return text.length;
}

/**
 * Skip forward until a top-level `,` or `}` (used for spread arguments).
 */
function skipUntilSeparator(text: string, start: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote && text[i - 1] !== '\\') quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = c;
      continue;
    }
    if (c === '{' || c === '(' || c === '[') {
      depth++;
      continue;
    }
    if (c === '}' || c === ')' || c === ']') {
      if (depth === 0) return i + 1;
      depth--;
      continue;
    }
    if (c === ',' && depth === 0) return i + 1;
  }
  return text.length;
}
