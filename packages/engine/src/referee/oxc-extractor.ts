import { parseSync } from 'oxc-parser';
import type {
  ArrowFunctionExpression,
  BindingIdentifier,
  BindingPattern,
  Class,
  Comment,
  ExportDefaultDeclaration,
  ExportNamedDeclaration,
  Function,
  ParamPattern,
  PropertyKey,
  Statement,
  TSEnumDeclaration,
  TSEnumMemberName,
  TSInterfaceDeclaration,
  TSParenthesizedType,
  TSSignature,
  TSType,
  TSTypeAliasDeclaration,
  TSTypeAnnotation,
  TSTypeLiteral,
  VariableDeclaration,
} from 'oxc-parser';

export interface ExtractedParam {
  name: string;
  type: string;
  isOptional: boolean;
  defaultValue?: string;
  description?: string;
}

export interface ExtractedProperty {
  name: string;
  type: string;
  isOptional: boolean;
  description?: string;
}

export interface ExtractedSymbol {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'type' | 'variable' | 'enum';
  signature: string;
  file: string;
  line: number;
  span: [number, number]; // [start, end]
  isDeprecated: boolean;
  deprecationNotice?: string;
  parameters: ExtractedParam[];
  properties: ExtractedProperty[];
  returnType?: string;
  docstring?: string;
  /** Raw source of a type alias RHS, used for recursive property resolution. */
  definition?: string;
}

/**
 * Truth Referee AST Extractor
 *
 * Backed by the `oxc` Rust parser (arena-allocated, single-pass parsing) rather
 * than a regex heuristic. Traverses the typed oxc AST and emits context-specific
 * symbols (`BindingIdentifier`, `TSTypeAnnotation`, ...) with span offsets,
 * parameter lists, JSDoc ranges, and deprecation flags.
 */
export class FastAstExtractor {
  extract(sourceText: string, filePath: string): ExtractedSymbol[] {
    const result = parseSync(filePath, sourceText, {
      lang: detectLang(filePath),
      sourceType: 'module',
      astType: /\.tsx?$/.test(filePath) || /\.d\.ts$/.test(filePath) ? 'ts' : 'js',
    });

    const ctx = new ExtractCtx(sourceText, result.comments);
    const exports = new ExportIndex(result.module.staticExports);
    const symbols: ExtractedSymbol[] = [];

    const emit = (binding: string | null, make: () => Omit<ExtractedSymbol, 'name'>, force = false): void => {
      if (!binding) return;
      if (!force && !exports.isExported(binding)) return;
      symbols.push({ ...make(), name: force ? binding : exports.publicName(binding) });
    };

    for (const statement of result.program.body) {
      switch (statement.type) {
        case 'ExportNamedDeclaration': {
          const named = statement as ExportNamedDeclaration;
          if (named.declaration) this.visitDeclaration(named.declaration, emit, ctx);
          break;
        }
        case 'ExportDefaultDeclaration': {
          const def = statement as ExportDefaultDeclaration;
          const decl = def.declaration;
          if (decl.type === 'FunctionDeclaration' || decl.type === 'FunctionExpression') {
            emit(decl.id?.name ?? 'default', () => ctx.toFunctionSymbol(decl), true);
          } else if (decl.type === 'ClassDeclaration' || decl.type === 'ClassExpression') {
            emit(decl.id?.name ?? 'default', () => ctx.toClassSymbol(decl), true);
          } else if (decl.type === 'TSInterfaceDeclaration') {
            emit(decl.id.name, () => ctx.toInterfaceSymbol(decl), true);
          }
          break;
        }
        default:
          this.visitDeclaration(statement, emit, ctx);
      }
    }

    return symbols;
  }

  private visitDeclaration(
    statement: Statement,
    emit: (binding: string | null, make: () => Omit<ExtractedSymbol, 'name'>) => void,
    ctx: ExtractCtx
  ): void {
    switch (statement.type) {
      case 'FunctionDeclaration':
        emit(statement.id?.name ?? null, () => ctx.toFunctionSymbol(statement));
        break;
      case 'ClassDeclaration':
        emit(statement.id?.name ?? null, () => ctx.toClassSymbol(statement));
        break;
      case 'VariableDeclaration': {
        const variable = statement as VariableDeclaration;
        for (const declarator of variable.declarations) {
          const init = declarator.init;
          if (init && (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')) {
            const binding = bindingName(declarator.id, ctx.sourceText);
            emit(binding, () => ctx.toArrowSymbol(declarator.id, init));
          }
        }
        break;
      }
      case 'TSInterfaceDeclaration': {
        const iface = statement as TSInterfaceDeclaration;
        emit(iface.id.name, () => ctx.toInterfaceSymbol(iface));
        break;
      }
      case 'TSTypeAliasDeclaration': {
        const alias = statement as TSTypeAliasDeclaration;
        emit(alias.id.name, () => ctx.toTypeAliasSymbol(alias));
        break;
      }
      case 'TSEnumDeclaration': {
        const en = statement as TSEnumDeclaration;
        emit(en.id.name, () => ctx.toEnumSymbol(en));
        break;
      }
    }
  }
}

class ExportIndex {
  private readonly exported = new Set<string>();
  private readonly publicByName = new Map<string, string>();

  constructor(staticExports: Array<{ entries: Array<{ localName: { name?: string | null } | null; exportName: { name?: string | null } | null }> }>) {
    for (const statement of staticExports) {
      for (const entry of statement.entries) {
        const local = entry.localName?.name ?? null;
        const exported = entry.exportName?.name ?? null;
        if (local) {
          this.exported.add(local);
          if (exported) this.publicByName.set(local, exported);
        }
        if (exported) this.exported.add(exported);
        if (!local && !exported) this.exported.add('default');
      }
    }
  }

  isExported(name: string): boolean {
    return this.exported.has(name);
  }

  publicName(local: string): string {
    return this.publicByName.get(local) ?? local;
  }
}

class ExtractCtx {
  constructor(
    readonly sourceText: string,
    private readonly comments: Comment[]
  ) {}

  toFunctionSymbol(fn: Function): Omit<ExtractedSymbol, 'name'> {
    const { isDeprecated, docstring, deprecationNotice } = this.leadingJsdoc(fn.start);
    const returnType = this.typeAnnotationText(fn.returnType) || (fn.async ? 'Promise<void>' : '');
    const params = this.extractParams(fn.params);
    return {
      kind: 'function',
      signature: this.functionSignature(fn.params, returnType),
      file: '',
      line: getLineNumber(this.sourceText, fn.start),
      span: [fn.start, fn.end],
      isDeprecated,
      deprecationNotice,
      parameters: params,
      properties: [],
      returnType,
      docstring,
    };
  }

  toArrowSymbol(id: BindingPattern, arrow: ArrowFunctionExpression | Function): Omit<ExtractedSymbol, 'name'> {
    const { isDeprecated, docstring, deprecationNotice } = this.leadingJsdoc(arrow.start);
    const returnType = this.typeAnnotationText(arrow.returnType) || (arrow.async ? 'Promise<void>' : '');
    const params = this.extractParams(arrow.params);
    return {
      kind: 'function',
      signature: this.functionSignature(arrow.params, returnType),
      file: '',
      line: getLineNumber(this.sourceText, arrow.start),
      span: [id.start, arrow.end],
      isDeprecated,
      deprecationNotice,
      parameters: params,
      properties: [],
      returnType,
      docstring,
    };
  }

  toInterfaceSymbol(iface: TSInterfaceDeclaration): Omit<ExtractedSymbol, 'name'> {
    const { isDeprecated, docstring, deprecationNotice } = this.leadingJsdoc(iface.start);
    return {
      kind: 'interface',
      signature: `interface ${iface.id.name}`,
      file: '',
      line: getLineNumber(this.sourceText, iface.start),
      span: [iface.start, iface.end],
      isDeprecated,
      deprecationNotice,
      parameters: [],
      properties: this.extractTypeMembers(iface.body.body),
      docstring,
    };
  }

  toTypeAliasSymbol(alias: TSTypeAliasDeclaration): Omit<ExtractedSymbol, 'name'> {
    const { isDeprecated, docstring, deprecationNotice } = this.leadingJsdoc(alias.start);
    const definition = this.sourceText.slice(alias.typeAnnotation.start, alias.typeAnnotation.end).trim();
    return {
      kind: 'type',
      signature: `type ${alias.id.name} = ${definition}`,
      file: '',
      line: getLineNumber(this.sourceText, alias.start),
      span: [alias.start, alias.end],
      isDeprecated,
      deprecationNotice,
      parameters: [],
      properties: this.extractTypeMembersFromType(alias.typeAnnotation),
      returnType: definition,
      docstring,
      definition,
    };
  }

  toClassSymbol(node: Class): Omit<ExtractedSymbol, 'name'> {
    const { isDeprecated, docstring, deprecationNotice } = this.leadingJsdoc(node.start);
    const props: ExtractedProperty[] = [];
    for (const element of node.body.body) {
      if (element.type === 'PropertyDefinition' || element.type === 'AccessorProperty') {
        if (element.key.type === 'PrivateIdentifier') continue;
        props.push({
          name: keyName(element.key, this.sourceText),
          type: this.typeAnnotationText(element.typeAnnotation) || 'any',
          isOptional: Boolean(element.optional),
        });
      } else if (element.type === 'MethodDefinition') {
        if (element.key.type === 'PrivateIdentifier') continue;
        const params = element.value.params.map((p) => this.paramSlice(p)).join(', ');
        const ret = this.typeAnnotationText(element.value.returnType);
        props.push({
          name: keyName(element.key, this.sourceText),
          type: `(${params})${ret ? `: ${ret}` : ''}`,
          isOptional: false,
        });
      }
    }
    return {
      kind: 'class',
      signature: `class ${node.id?.name ?? 'default'}${node.superClass ? ` extends ${this.sourceText.slice(node.superClass.start, node.superClass.end).trim()}` : ''}`,
      file: '',
      line: getLineNumber(this.sourceText, node.start),
      span: [node.start, node.end],
      isDeprecated,
      deprecationNotice,
      parameters: [],
      properties: props,
      docstring,
    };
  }

  toEnumSymbol(en: TSEnumDeclaration): Omit<ExtractedSymbol, 'name'> {
    const { isDeprecated, docstring, deprecationNotice } = this.leadingJsdoc(en.start);
    return {
      kind: 'enum',
      signature: `enum ${en.id.name}`,
      file: '',
      line: getLineNumber(this.sourceText, en.start),
      span: [en.start, en.end],
      isDeprecated,
      deprecationNotice,
      parameters: [],
      properties: en.body.members.map((m) => ({
        name: enumMemberName(m.id, this.sourceText),
        type: 'enum',
        isOptional: false,
      })),
      docstring,
    };
  }

  private extractParams(params: ParamPattern[]): ExtractedParam[] {
    return params.map((p) => {
      if (p.type === 'RestElement') {
        return {
          name: `...${bindingName(p.argument, this.sourceText)}`,
          isOptional: true,
          type: this.paramTypeText(p) || 'any',
        };
      }
      if (p.type === 'TSParameterProperty') {
        return this.extractBindingParam(p.parameter);
      }
      return this.extractBindingParam(p);
    });
  }

  private extractBindingParam(pattern: BindingPattern): ExtractedParam {
    switch (pattern.type) {
      case 'Identifier': {
        const identifier = pattern as BindingIdentifier;
        return {
          name: identifier.name,
          isOptional: Boolean(identifier.optional),
          type: this.patternTypeText(identifier) || 'any',
        };
      }
      case 'AssignmentPattern':
        return {
          name: bindingName(pattern.left, this.sourceText),
          isOptional: true,
          type: this.patternTypeText(pattern.left) || 'any',
          defaultValue: this.sourceText.slice(pattern.right.start, pattern.right.end).trim(),
        };
      case 'ObjectPattern':
      case 'ArrayPattern':
        return {
          name: bindingName(pattern, this.sourceText),
          isOptional: Boolean(pattern.optional),
          type: this.patternTypeText(pattern) || 'any',
        };
    }
  }

  private patternTypeText(pattern: BindingPattern): string {
    const annotation = pattern.typeAnnotation;
    if (!annotation) return '';
    return this.sourceText.slice(annotation.typeAnnotation.start, annotation.typeAnnotation.end).trim();
  }

  private paramTypeText(p: ParamPattern): string {
    const annotation = patternAnnotation(p);
    if (!annotation) return '';
    return this.sourceText.slice(annotation.typeAnnotation.start, annotation.typeAnnotation.end).trim();
  }

  private typeAnnotationText(annotation: TSTypeAnnotation | null | undefined): string {
    if (!annotation) return '';
    return this.sourceText.slice(annotation.typeAnnotation.start, annotation.typeAnnotation.end).trim();
  }

  private paramSlice(p: ParamPattern): string {
    const end = patternAnnotation(p)?.end ?? p.end;
    return this.sourceText.slice(p.start, end).trim();
  }

  private functionSignature(params: ParamPattern[], returnType: string): string {
    const paramText = params.map((p) => this.paramSlice(p)).join(', ');
    return `(${paramText}): ${returnType || 'void'}`;
  }

  private extractTypeMembers(body: TSSignature[]): ExtractedProperty[] {
    const members: ExtractedProperty[] = [];
    for (const member of body) {
      if (member.type === 'TSIndexSignature') continue;
      if (member.type === 'TSPropertySignature') {
        if (member.key.type === 'PrivateIdentifier') continue;
        members.push({
          name: keyName(member.key, this.sourceText),
          type: this.typeAnnotationText(member.typeAnnotation) || 'any',
          isOptional: member.optional,
        });
      } else if (member.type === 'TSMethodSignature') {
        const params = member.params.map((p) => this.paramSlice(p)).join(', ');
        const ret = this.typeAnnotationText(member.returnType);
        members.push({
          name: keyName(member.key, this.sourceText),
          type: `(${params})${ret ? `: ${ret}` : ''}`,
          isOptional: member.optional,
        });
      }
    }
    return members;
  }

  private extractTypeMembersFromType(type: TSType): ExtractedProperty[] {
    if (type.type === 'TSTypeLiteral') {
      return this.extractTypeMembers((type as TSTypeLiteral).members);
    }
    if (type.type === 'TSUnionType' || type.type === 'TSIntersectionType') {
      const members: ExtractedProperty[] = [];
      for (const sub of type.types) members.push(...this.extractTypeMembersFromType(sub));
      return members;
    }
    if (type.type === 'TSParenthesizedType') {
      return this.extractTypeMembersFromType((type as TSParenthesizedType).typeAnnotation);
    }
    return [];
  }

  private leadingJsdoc(offset: number): { isDeprecated: boolean; deprecationNotice?: string; docstring?: string } {
    let best: Comment | null = null;
    for (const comment of this.comments) {
      if (comment.end <= offset) {
        if (!best || comment.start > best.start) best = comment;
      }
    }
    if (!best) return { isDeprecated: false };
    const raw = this.sourceText.slice(best.start, best.end);
    const deprecated = /@deprecated\b/.test(best.value);
    return {
      isDeprecated: deprecated,
      deprecationNotice: deprecated ? best.value.trim() : undefined,
      docstring: raw.startsWith('/**') ? best.value.replace(/^\s*\*\s?/gm, '').trim() : undefined,
    };
  }
}

function detectLang(filePath: string): 'ts' | 'tsx' | 'js' | 'jsx' | 'dts' {
  if (filePath.endsWith('.d.ts')) return 'dts';
  if (filePath.endsWith('.tsx')) return 'tsx';
  if (filePath.endsWith('.mts') || filePath.endsWith('.cts') || filePath.endsWith('.ts')) return 'ts';
  if (filePath.endsWith('.jsx')) return 'jsx';
  return 'js';
}

function getLineNumber(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
}

function bindingName(pattern: BindingPattern, sourceText: string): string {
  switch (pattern.type) {
    case 'Identifier':
      return pattern.name;
    case 'AssignmentPattern':
      return bindingName(pattern.left, sourceText);
    case 'ObjectPattern': {
      const names: string[] = [];
      for (const property of pattern.properties) {
        if (property.type === 'RestElement') {
          names.push(`...${bindingName(property.argument, sourceText)}`);
        } else {
          names.push(keyName(property.key, sourceText));
        }
      }
      return `{ ${names.join(', ')} }`;
    }
    case 'ArrayPattern': {
      const names: string[] = [];
      for (const element of pattern.elements) {
        if (!element) continue;
        if (element.type === 'RestElement') {
          names.push(`...${bindingName(element.argument, sourceText)}`);
        } else {
          names.push(bindingName(element, sourceText));
        }
      }
      return `[${names.join(', ')}]`;
    }
  }
}

function keyName(key: PropertyKey, sourceText: string): string {
  if (key.type === 'Identifier') return key.name;
  if (key.type === 'PrivateIdentifier') return `#${key.name}`;
  if (key.type === 'Literal') {
    const value = key.value;
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return String(value);
    if (value instanceof RegExp) return String(value);
  }
  return sourceText.slice(key.start, key.end).trim();
}

function enumMemberName(id: TSEnumMemberName, sourceText: string): string {
  if (id.type === 'Literal') {
    const value = id.value;
    if (typeof value === 'string' || typeof value === 'number') return String(value);
  }
  if (id.type === 'Identifier') return id.name;
  return sourceText.slice(id.start, id.end).trim();
}

function patternAnnotation(p: ParamPattern): TSTypeAnnotation | undefined {
  if (p.type === 'TSParameterProperty') return p.parameter.typeAnnotation ?? undefined;
  return p.typeAnnotation ?? undefined;
}

/**
 * Resolution of a parameter type string into the set of object keys it accepts.
 *
 * `object`  — the keys the param accepts (empty set means "no keys").
 * `non-object` — a primitive/array; any object literal passed is invalid.
 * `unknown` — cannot resolve; skip validation to avoid false positives.
 */
export type ObjectTypeResolution =
  | { kind: 'object'; keys: Set<string> }
  | { kind: 'non-object' }
  | { kind: 'unknown' };

const BUILTIN_OBJECT_TYPES = new Set([
  'object', 'Object', 'Function', 'any', 'unknown', 'Record', 'Readonly',
  'Partial', 'Required', 'Pick', 'Omit', 'Exclude', 'Extract', 'NonNullable',
  'ThisType', 'Array', 'Iterable', 'Promise',
]);

const PRIMITIVE_TYPES = new Set([
  'string', 'number', 'boolean', 'bigint', 'symbol', 'null', 'undefined',
  'void', 'never', 'true', 'false', 'Date', 'URL', 'RegExp', 'Map', 'Set',
  'WeakMap', 'WeakSet', 'Error', 'Buffer',
]);

/**
 * Resolve the object keys accepted by a parameter type string.
 */
export function resolveObjectKeys(
  typeText: string,
  symbolMap: Map<string, ExtractedSymbol>
): ObjectTypeResolution {
  return resolveType(typeText.trim(), symbolMap, new Set(), 0);
}

function resolveType(
  raw: string,
  symbolMap: Map<string, ExtractedSymbol>,
  seen: Set<string>,
  depth: number
): ObjectTypeResolution {
  if (depth > 8) return { kind: 'unknown' };
  const text = raw.trim();
  if (!text) return { kind: 'unknown' };
  if (text.startsWith('{') && text.endsWith('}')) {
    return { kind: 'object', keys: new Set(extractLiteralKeys(text)) };
  }

  const union = splitTopLevel(text, '|');
  if (union.length > 1) {
    const keys = new Set<string>();
    for (const branch of union) {
      const resolution = resolveType(branch, symbolMap, seen, depth + 1);
      if (resolution.kind === 'unknown') return resolution;
      if (resolution.kind === 'non-object') return resolution;
      for (const key of resolution.keys) keys.add(key);
    }
    return { kind: 'object', keys };
  }

  const intersection = splitTopLevel(text, '&');
  if (intersection.length > 1) {
    const keys = new Set<string>();
    for (const branch of intersection) {
      const resolution = resolveType(branch, symbolMap, seen, depth + 1);
      if (resolution.kind === 'unknown') return resolution;
      if (resolution.kind === 'non-object') return resolution;
      for (const key of resolution.keys) keys.add(key);
    }
    return { kind: 'object', keys };
  }

  if (text.startsWith('(') && text.endsWith(')')) {
    return resolveType(text.slice(1, -1), symbolMap, seen, depth + 1);
  }
  if (text.startsWith('[') && text.endsWith(']')) return { kind: 'non-object' };
  if (text.endsWith('[]')) return { kind: 'non-object' };
  if (text.startsWith('() =>') || text.startsWith('(')) return { kind: 'non-object' };
  if (text.startsWith('`')) return { kind: 'non-object' };

  const baseName = extractBaseName(text);
  if (!baseName) return { kind: 'unknown' };

  if (PRIMITIVE_TYPES.has(baseName)) return { kind: 'non-object' };
  if (BUILTIN_OBJECT_TYPES.has(baseName)) return { kind: 'unknown' };

  if (seen.has(baseName)) return { kind: 'unknown' };
  seen.add(baseName);

  const symbol = symbolMap.get(baseName);
  if (!symbol) return { kind: 'unknown' };

  if (symbol.kind === 'interface' || symbol.kind === 'class' || symbol.kind === 'enum') {
    return { kind: 'object', keys: new Set(symbol.properties.map((p) => p.name)) };
  }
  if (symbol.kind === 'type' && symbol.definition) {
    return resolveType(symbol.definition, symbolMap, seen, depth + 1);
  }
  return { kind: 'unknown' };
}

function extractBaseName(text: string): string | null {
  const match = text.match(/^([A-Za-z_$][\w$]*)/);
  return match ? match[1] : null;
}

function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '{' || char === '(' || char === '[' || char === '<') depth++;
    else if (char === '}' || char === ')' || char === ']' || char === '>') depth--;
    if (char === separator && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current);
  return parts;
}

/**
 * Extract the top-level keys of an object literal *type* (e.g. `{ strict?: boolean }`).
 * Re-parses the snippet through oxc so the literal is understood structurally.
 */
function extractLiteralKeys(literal: string): string[] {
  try {
    const result = parseSync('inline.ts', `type __ObjectLiteral = ${literal};`, {
      lang: 'ts',
      sourceType: 'module',
    });
    const alias = result.program.body.find((statement) => statement.type === 'TSTypeAliasDeclaration') as
      | TSTypeAliasDeclaration
      | undefined;
    if (!alias) return [];
    return collectTypeKeys(alias.typeAnnotation);
  } catch {
    return [];
  }
}

function collectTypeKeys(type: TSType): string[] {
  const keys: string[] = [];
  if (type.type === 'TSTypeLiteral') {
    const literal = type as TSTypeLiteral;
    for (const member of literal.members) {
      if (member.type === 'TSIndexSignature') continue;
      if (member.type === 'TSPropertySignature') {
        if (member.key.type === 'PrivateIdentifier') continue;
        keys.push(keyName(member.key, ''));
      } else if (member.type === 'TSMethodSignature') {
        if (member.key.type === 'Identifier') keys.push(member.key.name);
      }
    }
  } else if (type.type === 'TSUnionType' || type.type === 'TSIntersectionType') {
    for (const sub of type.types) keys.push(...collectTypeKeys(sub));
  } else if (type.type === 'TSParenthesizedType') {
    keys.push(...collectTypeKeys((type as TSParenthesizedType).typeAnnotation));
  }
  return keys;
}
