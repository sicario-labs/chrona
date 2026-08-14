import type { RepositoryIndex, IndexedSymbol } from '@chrona/engine';
import type { SymbolGraph } from '@chrona/graph';
import { generateSymbolDocumentation } from '@chrona/engine';
import type { DynamicSource, PageData, StaticSource, VirtualFile } from 'chrona-core/source';
import type { StructuredData } from 'chrona-core/mdx-plugins/remark-structure';
import path from 'node:path';

export interface ChronaSymbolData extends PageData {
  /**
   * Evidence payload consumed by the "Ask Chrona" UI / search index.
   */
  _chrona: {
    id: string;
    name: string;
    kind: string;
    filePath: string;
    deprecated: boolean;
    internal: boolean;
    aliases: string[];
    references: IndexedSymbol['references'];
    graph?: {
      id: string;
      name: string;
      kind: string;
    }[];
  };
}

export interface RepositorySourceOptions {
  index: RepositoryIndex;
  graph?: SymbolGraph;
  /**
   * base directory of generated virtual files.
   *
   * @defaultValue `~/repository`
   */
  baseDir?: string;
  /**
   * only include symbols matching this predicate
   */
  include?: (symbol: IndexedSymbol) => boolean;
  /**
   * exclude symbols matching this predicate
   */
  exclude?: (symbol: IndexedSymbol) => boolean;
  /**
   * customize the generated slugs for a symbol.
   *
   * @defaultValue relative file path + symbol name
   */
  slug?: (symbol: IndexedSymbol) => string[];
}

export interface RepositorySource {
  /**
   * Generate virtual pages for Chrona Source API.
   */
  staticSource: () => Promise<
    StaticSource<{
      pageData: ChronaSymbolData;
      metaData: {
        title?: string;
        description?: string;
      };
    }>
  >;

  /**
   * Generate virtual pages for Chrona Source API, re-evaluated on every read
   * (suitable for dev-time revalidation).
   */
  dynamicSource: () => DynamicSource<{
    pageData: ChronaSymbolData;
    metaData: {
      title?: string;
      description?: string;
    };
  }>;
}

export function createRepositorySource(options: RepositorySourceOptions): RepositorySource {
  return {
    async staticSource() {
      return {
        files: await getVirtualFiles(options),
      };
    },
    dynamicSource() {
      return {
        files: () => getVirtualFiles(options),
      };
    },
  };
}

type SourceConfig = {
  pageData: ChronaSymbolData;
  metaData: {
    title?: string;
    description?: string;
  };
};

async function getVirtualFiles(
  options: RepositorySourceOptions,
): Promise<VirtualFile<SourceConfig>[]> {
  const { index, graph } = options;
  const baseDir = options.baseDir ?? '~/repository';
  const files: VirtualFile<SourceConfig>[] = [];

  const symbols = Array.from(index.symbols.values()).filter((symbol) => {
    if (options.include && !options.include(symbol)) return false;
    if (options.exclude && options.exclude(symbol)) return false;
    return true;
  });

  for (const symbol of symbols) {
    const slug = options.slug?.(symbol) ?? defaultSlug(index, symbol);
    const doc = await generateSymbolDocumentation(index, symbol.id);
    const neighbors = graph ? getNeighbors(graph, symbol.id, index) : undefined;

    files.push({
      type: 'page',
      path: path.posix.join(baseDir, ...slug, `${symbol.name}.mdx`),
      slugs: [...baseDir.split('/'), ...slug, symbol.name],
      data: {
        title: symbol.name,
        description: doc?.description ?? symbol.description,
        structuredData: toStructuredData(symbol, doc),
        _chrona: {
          id: symbol.id,
          name: symbol.name,
          kind: symbol.kind,
          filePath: toPosix(symbol.filePath),
          deprecated: symbol.deprecated,
          internal: symbol.internal,
          aliases: symbol.aliases,
          references: symbol.references,
          graph: neighbors,
        },
      },
    });
  }

  return files;
}

function defaultSlug(index: RepositoryIndex, symbol: IndexedSymbol): string[] {
  const relative = path.posix.relative(computeRoot(index.files), toPosix(symbol.filePath));
  const dir = path.posix.dirname(relative);
  const segments = dir === '.' ? [] : dir.split('/');
  return segments.filter((v) => v.length > 0 && v !== 'node_modules');
}

function computeRoot(files: string[]): string {
  if (files.length === 0) return '.';
  let root = path.posix.normalize(toPosix(files[0]));

  for (const file of files.slice(1)) {
    const current = path.posix.normalize(toPosix(file));
    while (!current.startsWith(root) && root !== '.' && root.length > 0) {
      root = path.posix.dirname(root);
    }
    if (root === '.') break;
  }

  return root === '/' ? '.' : root;
}

/**
 * normalize a native (possibly Windows `\`) path to forward slashes
 * so slug generation and evidence paths are stable across platforms.
 */
export function toPosix(filePath: string): string {
  return filePath.replaceAll(path.sep, '/');
}

function getNeighbors(
  graph: SymbolGraph,
  id: string,
  index: RepositoryIndex,
): { id: string; name: string; kind: string }[] {
  const neighbors = graph.adjacency.get(id);
  if (!neighbors) return [];

  return neighbors
    .map((neighbor) => {
      const symbol = index.symbols.get(neighbor);
      if (!symbol) return undefined;
      return { id: neighbor, name: symbol.name, kind: symbol.kind };
    })
    .filter((v): v is { id: string; name: string; kind: string } => v !== undefined);
}

function toStructuredData(
  symbol: IndexedSymbol,
  doc: Awaited<ReturnType<typeof generateSymbolDocumentation>>,
): StructuredData {
  const headings = [
    {
      id: slugify(symbol.name),
      content: symbol.name,
    },
  ];

  const contents: StructuredData['contents'] = [];
  const description = doc?.description ?? symbol.description;
  if (description) {
    contents.push({
      content: description,
      heading: headings[0].id,
    });
  }

  for (const entry of doc?.entries ?? []) {
    headings.push({
      id: slugify(entry.name),
      content: entry.name,
    });

    const parts = [entry.description, entry.required ? '' : 'optional', `type: ${entry.type}`];
    contents.push({
      content: parts.filter((v) => v.length > 0).join('\n\n'),
      heading: slugify(entry.name),
    });
  }

  return { headings, contents };
}

export function slugify(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9\s_-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}
