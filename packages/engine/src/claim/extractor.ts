import type { Claim, ClaimType } from './types';

export interface ExtractorOptions {
  cwd?: string;
}

const COMMON_GLOBALS = new Set([
  'console',
  'log',
  'warn',
  'error',
  'info',
  'debug',
  'test',
  'it',
  'describe',
  'expect',
  'beforeEach',
  'afterEach',
  'beforeAll',
  'afterAll',
  'Math',
  'JSON',
  'Object',
  'Array',
  'Promise',
  'Set',
  'Map',
  'WeakMap',
  'WeakSet',
  'Date',
  'RegExp',
  'Error',
  'TypeError',
  'RangeError',
  'SyntaxError',
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'fetch',
  'require',
  'import',
  'super',
  'this',
  'parseInt',
  'parseFloat',
  'isNaN',
  'isFinite',
  'decodeURI',
  'decodeURIComponent',
  'encodeURI',
  'encodeURIComponent',
]);

/**
 * ClaimExtractor parses MDX / Markdown documents and extracts first-class Claim IR entities.
 */
export class ClaimExtractor {
  extractClaims(content: string, filePath: string): Claim[] {
    const claims: Claim[] = [];
    const lines = content.split('\n');

    // 1. Extract Recipe uses
    this.extractRecipeClaims(content, filePath, claims);

    // 2. Extract Import statement symbol claims
    this.extractImportClaims(content, lines, filePath, claims);

    // 3. Extract Heading signatures and symbol claims
    this.extractHeadingClaims(lines, filePath, claims);

    // 4. Extract ParamField components
    this.extractParamFieldClaims(content, lines, filePath, claims);

    // 5. Extract Documented Parameter & Return sections
    this.extractDocSections(content, lines, filePath, claims);

    // 6. Extract function call parameter & option usage from code blocks and inline code
    this.extractFunctionCallClaims(content, filePath, claims);

    // 7. Extract Fenced Code Block Examples
    this.extractCodeBlockExamples(content, filePath, claims);

    return claims;
  }

  private extractRecipeClaims(content: string, filePath: string, claims: Claim[]): void {
    const recipeRegex = /<Recipe[^>]*uses=\{([^}]+)\}[^>]*>/g;
    let match: RegExpExecArray | null;

    while ((match = recipeRegex.exec(content)) !== null) {
      const line = lineAtOffset(content, match.index);
      const rawUses = match[1];
      const symbolNames = extractStringLiterals(rawUses);

      for (const name of symbolNames) {
        claims.push(
          createClaim(
            'symbol',
            filePath,
            line,
            match[0],
            name,
            { origin: 'recipe-uses', rawSnippet: match[0] }
          )
        );
      }
    }
  }

  private extractImportClaims(
    content: string,
    lines: string[],
    filePath: string,
    claims: Claim[]
  ): void {
    const importRegex = /import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;

    while ((match = importRegex.exec(content)) !== null) {
      const line = lineAtOffset(content, match.index);
      const importedMembers = match[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
      const moduleSpecifier = match[2];

      for (const member of importedMembers) {
        claims.push(
          createClaim(
            'symbol',
            filePath,
            line,
            match[0],
            member,
            { moduleSpecifier, origin: 'import-statement' }
          )
        );
      }
    }
  }

  private extractHeadingClaims(lines: string[], filePath: string, claims: Claim[]): void {
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      // Only inspect code-styled headings `foo` or `foo(...)`
      const headingMatch = lineText.match(/^(#{1,6})\s+`([A-Za-z_$][\w$]*)(?:\(([^)]*)\))?(?::\s*([^`\n]+))?`/);
      if (!headingMatch) continue;

      const lineNumber = i + 1;
      const symbolName = headingMatch[2];
      const rawParams = headingMatch[3];
      const rawReturn = headingMatch[4]?.trim();

      // Heading introduces a symbol claim
      claims.push(
        createClaim(
          'symbol',
          filePath,
          lineNumber,
          lineText.trim(),
          symbolName,
          { headingLevel: headingMatch[1].length, origin: 'heading' }
        )
      );

      // If heading includes a signature `foo(...)`
      if (rawParams !== undefined) {
        const parsedParams = parseSignatureParams(rawParams);
        claims.push(
          createClaim(
            'signature',
            filePath,
            lineNumber,
            lineText.trim(),
            symbolName,
            {
              rawParams,
              parameters: parsedParams,
              returnType: rawReturn,
              origin: 'heading-signature',
            }
          )
        );

        if (rawReturn) {
          claims.push(
            createClaim(
              'return',
              filePath,
              lineNumber,
              lineText.trim(),
              symbolName,
              { claimedReturnType: rawReturn, origin: 'heading-return' }
            )
          );
        }
      }
    }
  }

  private extractParamFieldClaims(
    content: string,
    lines: string[],
    filePath: string,
    claims: Claim[]
  ): void {
    const paramFieldRegex = /<ParamField\s+path=["']([^"']+)["'](?:\s+type=["']([^"']+)["'])?(?:\s+default=["']([^"']+)["'])?[^>]*>/g;
    let match: RegExpExecArray | null;

    // Find the enclosing symbol for this ParamField based on preceding headings
    while ((match = paramFieldRegex.exec(content)) !== null) {
      const line = lineAtOffset(content, match.index);
      const pathValue = match[1];
      const paramType = match[2];
      const defaultValue = match[3];

      const precedingText = content.slice(0, match.index);
      const precedingHeadings = [...precedingText.matchAll(/#{2,4}\s+`?([A-Za-z_$][\w$]*)/g)];
      const lastHeading = precedingHeadings.length > 0 ? precedingHeadings[precedingHeadings.length - 1][1] : null;

      const parts = pathValue.split('.');
      const subject = lastHeading || (parts.length > 1 ? parts[0] : pathValue);
      const paramName = parts.length > 1 ? parts[1] : parts[0];

      claims.push(
        createClaim(
          'parameter',
          filePath,
          line,
          match[0],
          subject,
          {
            fullPath: pathValue,
            paramName,
            paramType,
            defaultValue,
            origin: 'param-field',
          }
        )
      );
    }
  }

  private extractDocSections(
    content: string,
    lines: string[],
    filePath: string,
    claims: Claim[]
  ): void {
    let currentSymbol: string | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const headingMatch = line.match(/^#{1,4}\s+`?([A-Za-z_$][\w$]*)/);
      if (headingMatch && !['Parameters', 'Returns', 'Example', 'Overview', 'Supported'].includes(headingMatch[1])) {
        currentSymbol = headingMatch[1];
      }

      // Check for parameter doc: - `options.tsconfigPath` (`string`, optional): ...
      const paramDocMatch = line.match(/^\s*-\s+`([A-Za-z_$][\w$.]*\??)`\s*(?:\(([^)]+)\))?/);
      if (paramDocMatch && currentSymbol) {
        const rawParam = paramDocMatch[1].replace(/\?$/, '');
        const typeInfo = paramDocMatch[2];
        const parts = rawParam.split('.');
        const paramName = parts.length > 1 ? parts[1] : parts[0];

        claims.push(
          createClaim(
            'parameter',
            filePath,
            i + 1,
            line.trim(),
            currentSymbol,
            {
              rawParam,
              paramName,
              typeInfo,
              origin: 'parameter-list',
            }
          )
        );
      }

      // Check for Returns section doc: - `Promise<RepositoryIndex>`: ...
      const returnDocMatch = line.match(/^\s*-\s+`([^`]+)`:\s*(.+)$/);
      if (returnDocMatch && currentSymbol && i > 0 && /returns/i.test(lines[i - 1])) {
        claims.push(
          createClaim(
            'return',
            filePath,
            i + 1,
            line.trim(),
            currentSymbol,
            {
              claimedReturnType: returnDocMatch[1],
              origin: 'returns-list',
            }
          )
        );
      }
    }
  }

  private extractFunctionCallClaims(content: string, filePath: string, claims: Claim[]): void {
    // Only search for function calls within code snippets or inline backticks
    // e.g. `createRouter({ strict: true })` or inside ```ts ... ```
    const codeSpanRegex = /`([^`\n]+)`|```(?:ts|tsx|typescript|js|jsx|javascript)\b[^\n]*\n([\s\S]*?)```/g;
    let spanMatch: RegExpExecArray | null;

    while ((spanMatch = codeSpanRegex.exec(content)) !== null) {
      const snippet = spanMatch[1] || spanMatch[2];
      if (!snippet) continue;
      const snippetOffset = spanMatch.index + (spanMatch[1] ? 1 : spanMatch[0].indexOf('\n') + 1);

      const callRegex = /\b([A-Za-z_$][\w$]*)\s*\(/g;
      let match: RegExpExecArray | null;

      while ((match = callRegex.exec(snippet)) !== null) {
        const funcName = match[1];
        if (COMMON_GLOBALS.has(funcName)) continue;
        if (['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'import'].includes(funcName)) continue;

        // Check character before identifier in snippet
        const charBefore = match.index > 0 ? snippet[match.index - 1] : '';
        if (charBefore === '.') {
          // It's a method call like router.lookup(...) or console.log(...) -> ignore
          continue;
        }

        const openParen = match.index + match[0].length - 1;
        const closeParen = findClosingParen(snippet, openParen);
        if (closeParen === -1) continue;

        const fullCall = snippet.slice(match.index, closeParen + 1);
        const line = lineAtOffset(content, snippetOffset + match.index);
        const argsText = snippet.slice(openParen + 1, closeParen);
        const parsedArgs = splitCallArgs(argsText);

        // Parameter / option claims
        for (let argIdx = 0; argIdx < parsedArgs.length; argIdx++) {
          const arg = parsedArgs[argIdx];
          const { keys, lhsName } = extractObjectKeysFromArg(arg);

          if (keys.length > 0) {
            claims.push(
              createClaim(
                'parameter',
                filePath,
                line,
                fullCall,
                funcName,
                {
                  argIndex: argIdx,
                  lhsName,
                  keys,
                  rawArg: arg,
                  origin: 'object-argument',
                }
              )
            );
          } else if (lhsName) {
            claims.push(
              createClaim(
                'parameter',
                filePath,
                line,
                fullCall,
                funcName,
                {
                  argIndex: argIdx,
                  lhsName,
                  rawArg: arg,
                  origin: 'named-argument',
                }
              )
            );
          }
        }
      }
    }
  }

  private extractCodeBlockExamples(content: string, filePath: string, claims: Claim[]): void {
    const codeBlockRegex = /```(ts|tsx|typescript|js|jsx|javascript)\b([^\n]*)\n([\s\S]*?)```/g;
    let match: RegExpExecArray | null;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      const line = lineAtOffset(content, match.index);
      const lang = match[1];
      const meta = match[2]?.trim() || '';
      const code = match[3];

      let subject = 'example';
      const titleMatch = meta.match(/title=["']([^"']+)["']/);
      if (titleMatch) {
        subject = titleMatch[1];
      } else {
        const commentMatch = code.match(/^\s*\/\/\s*([^\n]+)/);
        if (commentMatch) {
          subject = commentMatch[1].trim();
        }
      }

      claims.push(
        createClaim(
          'example',
          filePath,
          line,
          match[0],
          subject,
          {
            language: lang,
            code,
            meta,
            origin: 'fenced-code-block',
          }
        )
      );
    }
  }
}

function createClaim(
  type: ClaimType,
  file: string,
  line: number,
  text: string,
  subject: string,
  metadata?: Record<string, unknown>,
  startOffset?: number,
  endOffset?: number
): Claim {
  const normalizedFile = file.replace(/\\/g, '/');
  const id = `${normalizedFile}#L${line}:${type}:${subject}`;
  return {
    id,
    type,
    source: {
      file: normalizedFile,
      line,
      text: text.slice(0, 300),
      startOffset,
      endOffset,
    },
    subject,
    metadata,
    evidence: [],
    status: 'unverified',
  };
}

function lineAtOffset(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
}

function extractStringLiterals(raw: string): string[] {
  const results: string[] = [];
  const regex = /["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    results.push(match[1]);
  }
  return results;
}

export interface ParsedParam {
  name: string;
  type?: string;
  isOptional: boolean;
}

function parseSignatureParams(raw: string): ParsedParam[] {
  const parts = splitCallArgs(raw);
  return parts.map((part) => {
    const trimmed = part.trim();
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) {
      const isOpt = trimmed.endsWith('?');
      return {
        name: trimmed.replace(/\?$/, ''),
        isOptional: isOpt,
      };
    }
    const namePart = trimmed.slice(0, colonIdx).trim();
    const typePart = trimmed.slice(colonIdx + 1).trim();
    const isOpt = namePart.endsWith('?') || typePart.includes('undefined');
    return {
      name: namePart.replace(/\?$/, ''),
      type: typePart,
      isOptional: isOpt,
    };
  });
}

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
    if (rest.startsWith('...')) {
      i = skipUntilSeparator(body, i + 3);
      continue;
    }
    if (rest.startsWith('[')) {
      const close = findMatchingBrace(body, i);
      i = close === -1 ? body.length : close + 1;
      continue;
    }
    const quoted = rest.match(/^(["'])((?:\\.|(?!\1).)*?)\1\s*:/);
    if (quoted) {
      keys.push(quoted[2]);
      i = skipValue(body, i + quoted[0].length);
      continue;
    }
    const ident = rest.match(/^([A-Za-z_$][\w$]*)\s*:/);
    if (ident) {
      keys.push(ident[1]);
      i = skipValue(body, i + ident[0].length);
      continue;
    }
    const numeric = rest.match(/^(\d+)\s*:/);
    if (numeric) {
      keys.push(numeric[1]);
      i = skipValue(body, i + numeric[0].length);
      continue;
    }
    const method = rest.match(/^([A-Za-z_$][\w$]*)\s*\(/);
    if (method) {
      const close = findClosingParen(body, i + method[0].length - 1);
      i = close === -1 ? body.length : close + 1;
      continue;
    }
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

