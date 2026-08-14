import {
  Project,
  ts,
  type Node,
  type SourceFile,
  type Symbol as TsSymbol,
} from 'ts-morph';
import path from 'node:path';
import {
  type IndexedSymbol,
  type IndexOptions,
  type RepositoryIndex,
  type SymbolReference,
  getSymbolKind,
} from '@/types';

const DEFAULT_OPTIONS: IndexOptions = {
  tsconfigPath: './tsconfig.json',
  resolveAliases: true,
  collectReferences: true,
};

export async function indexProject(
  options: IndexOptions = {},
): Promise<RepositoryIndex> {
  const { tsconfigPath } = { ...DEFAULT_OPTIONS, ...options };

  const project = new Project({
    tsConfigFilePath: tsconfigPath,
    skipAddingFilesFromTsConfig: true,
  });

  return indexProjectFromProject(project, options);
}

export async function indexProjectFromProject(
  project: Project,
  options: IndexOptions = {},
): Promise<RepositoryIndex> {
  const { collectReferences = true, resolveAliases = true } = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const sourceFiles = (options.files ?? project.getSourceFiles().map((f) => f.getFilePath()))
    .map((filePath) => project.getSourceFile(filePath))
    .filter((file) => file && isIndexable(file.getFilePath(), options))
    .map((file) => file!);

  const symbols = new Map<string, IndexedSymbol>();
  const byName = new Map<string, IndexedSymbol[]>();

  for (const sourceFile of sourceFiles) {
    for (const [name, declarations] of sourceFile.getExportedDeclarations()) {
      for (const entry of declarations) {
        const node = Array.isArray(entry) ? entry[0] : entry;
        const rawSymbol = node.getSymbol();
        if (!rawSymbol) continue;

        const symbol = resolveAliases
          ? resolveThroughAliases(rawSymbol)
          : rawSymbol;
        const declaringFile = symbol.getDeclarations()[0]?.getSourceFile();
        if (!declaringFile) continue;

        const filePath = declaringFile.getFilePath();
        const id = `${filePath}#${symbol.getName()}`;
        if (symbols.has(id)) continue;

        const tags = collectTags(rawSymbol);
        let references: SymbolReference[] = [];
        if (collectReferences) {
          references = await collectReferenceLocations(symbol, project);
        }

        const indexed: IndexedSymbol = {
          id,
          name: symbol.getName(),
          filePath,
          kind: getSymbolKind(node),
          description: getDocumentation(rawSymbol, project),
          type: getTypeText(node),
          references,
          aliases: collectAliases(symbol, sourceFiles),
          deprecated: tags.deprecated,
          internal: tags.internal,
          exported: true,
        };

        symbols.set(id, indexed);
        const list = byName.get(name);
        if (list) list.push(indexed);
        else byName.set(name, [indexed]);
      }
    }
  }

  return {
    project,
    symbols,
    byName,
    files: sourceFiles.map((file) => file.getFilePath()),
  };
}

function isIndexable(filePath: string, options: IndexOptions): boolean {
  if (filePath.includes('node_modules')) return false;
  if (filePath.endsWith('.d.ts')) return false;
  if (options.include && !options.include(filePath)) return false;
  if (options.exclude && options.exclude(filePath)) return false;
  return true;
}

/**
 * follow `export { x }` / `import x from` chains to the original declaration
 */
function resolveThroughAliases(symbol: TsSymbol): TsSymbol {
  let current = symbol;
  const seen = new Set<string>();
  while (current.getAliasedSymbol() && !seen.has(current.getName())) {
    seen.add(current.getName());
    const aliased = current.getAliasedSymbol();
    if (!aliased || aliased === current) break;
    current = aliased;
  }
  return current;
}

function collectAliases(
  symbol: TsSymbol,
  sourceFiles: SourceFile[],
): string[] {
  const aliases = new Set<string>();
  for (const file of sourceFiles) {
    for (const [name, entries] of file.getExportedDeclarations()) {
      for (const entry of entries) {
        const node = Array.isArray(entry) ? entry[0] : entry;
        if (node.getSymbol()?.getName() === symbol.getName()) aliases.add(name);
      }
    }
  }
  return Array.from(aliases);
}

function collectTags(
  symbol: TsSymbol,
): { deprecated: boolean; internal: boolean } {
  let deprecated = false;
  let internal = false;
  for (const tag of symbol.getJsDocTags()) {
    if (tag.getName() === 'deprecated') deprecated = true;
    if (tag.getName() === 'internal') internal = true;
  }
  return { deprecated, internal };
}

function getDocumentation(
  symbol: TsSymbol,
  project: Project,
): string | undefined {
  const parts = symbol.compilerSymbol.getDocumentationComment(
    project.getTypeChecker().compilerObject,
  );
  if (parts.length === 0) return undefined;
  return ts.displayPartsToString(parts);
}

function getTypeText(node: Node): string {
  const type = node.getType();
  return type.getText(
    undefined,
    ts.TypeFormatFlags.NoTruncation |
      ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope,
  );
}

async function collectReferenceLocations(
  symbol: TsSymbol,
  project: Project,
): Promise<SymbolReference[]> {
  const declarations = symbol.getDeclarations();
  if (declarations.length === 0) return [];

  const languageService = project.getLanguageService();
  const references: SymbolReference[] = [];
  const seen = new Set<string>();

  for (const declaration of declarations) {
    const nodes = languageService.findReferencesAsNodes(declaration);
    for (const node of nodes) {
      const sourceFile = node.getSourceFile();
      if (!sourceFile) continue;
      const position = sourceFile.getLineAndColumnAtPos(node.getStart());
      const filePath = path.normalize(sourceFile.getFilePath());
      const key = `${filePath}:${position.line}:${position.column}`;
      if (seen.has(key)) continue;
      seen.add(key);
      references.push({
        filePath,
        line: position.line,
        column: position.column,
        kind: 'usage',
      });
    }
  }
  return references;
}