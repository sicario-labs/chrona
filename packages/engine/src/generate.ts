import { ts, type Node, type SourceFile, type Symbol as TsSymbol, type Type } from 'ts-morph';
import type { RepositoryIndex, IndexedSymbol } from '@/types';

export interface DocEntry {
  name: string;
  description: string;
  type: string;
  simplifiedType: string;
  tags: RawTag[];
  required: boolean;
  deprecated: boolean;
}

export interface RawTag {
  name: string;
  text: string;
}

export interface GeneratedSymbolDoc {
  id: string;
  name: string;
  filePath: string;
  description?: string;
  entries: DocEntry[];
}

export interface GenerateOptions {
  allowInternal?: boolean;
  /**
   * modify a property entry before it is emitted
   */
  transform?: (entry: DocEntry, propertyType: Type, property: TsSymbol) => void;
}

/**
 * generalize the per-file `generateDocumentation` (chrona-typescript)
 * to resolve a symbol through the repository index and document it
 * in isolation, including cross-file property types.
 */
export async function generateSymbolDocumentation(
  index: RepositoryIndex,
  id: string,
  options: GenerateOptions = {},
): Promise<GeneratedSymbolDoc | undefined> {
  const symbol = index.symbols.get(id);
  if (!symbol) return undefined;

  const project = index.project;
  const sourceFile = project.getSourceFile(symbol.filePath);
  if (!sourceFile) return undefined;

  const declaration = findDeclaration(sourceFile, symbol);
  if (!declaration) return undefined;

  const checker = project.getTypeChecker();
  const comment = declaration
    .getSymbol()
    ?.compilerSymbol.getDocumentationComment(checker.compilerObject);

  const entries: DocEntry[] = [];
  for (const prop of declaration.getType().getProperties()) {
    const entry = await getDocEntry(prop, declaration, project, options);
    if (entry) entries.push(entry);
  }

  return {
    id,
    name: symbol.name,
    filePath: symbol.filePath,
    description: comment ? ts.displayPartsToString(comment) : undefined,
    entries,
  };
}

function findDeclaration(
  sourceFile: SourceFile,
  symbol: IndexedSymbol,
): Node | undefined {
  for (const [name, declarations] of sourceFile.getExportedDeclarations()) {
    if (name !== symbol.name) continue;
    for (const entry of declarations) {
      const node = Array.isArray(entry) ? entry[0] : entry;
      if (node.getSymbol()?.getName() === symbol.name) return node;
    }
  }
  return undefined;
}

async function getDocEntry(
  prop: TsSymbol,
  declaration: Node,
  project: RepositoryIndex['project'],
  options: GenerateOptions,
): Promise<DocEntry | undefined> {
  const checker = project.getTypeChecker();
  const type = declaration.getType();
  if (type.isClass() && prop.getName().startsWith('#')) return undefined;

  const subType = prop.getTypeAtLocation(declaration);
  const isOptional = prop.isOptional();
  const tags: RawTag[] = [];

  for (const tag of prop.getJsDocTags()) {
    if (!options.allowInternal && tag.getName() === 'internal') return undefined;
    tags.push({
      name: tag.getName(),
      text: ts.displayPartsToString(tag.getText()),
    });
  }

  const entry: DocEntry = {
    name: prop.getName(),
    description: ts.displayPartsToString(
      prop.compilerSymbol.getDocumentationComment(checker.compilerObject),
    ),
    type: subType.getText(
      declaration,
      ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope |
        ts.TypeFormatFlags.NoTruncation,
    ),
    simplifiedType: subType.getText(
      declaration,
      ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope,
    ),
    tags,
    required: !isOptional,
    deprecated: tags.some((tag) => tag.name === 'deprecated'),
  };

  options.transform?.(entry, subType, prop);
  return entry;
}