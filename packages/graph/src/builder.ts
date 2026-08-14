import { Node, ts, type Node as TsNode, type SourceFile, type Symbol as TsSymbol, type Type } from 'ts-morph';
import type { RepositoryIndex } from '@chrona/engine';
import type { BuildGraphOptions, EdgeKind, GraphEdge, GraphNode, SymbolGraph } from '@/types';

export interface EdgeAccumulator {
  add: (from: string, to: string, kind: EdgeKind, filePath: string) => void;
}

/**
 * fork of `packages/story/src/type-tree/builder.ts` — same recursive
 * Type walker, but instead of producing render nodes it records
 * relationships between indexed symbols (the edge accumulator).
 */
export function buildSymbolGraph(
  index: RepositoryIndex,
  options: BuildGraphOptions = {},
): SymbolGraph {
  const { includeInternal = true } = options;
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  const byId = new Map<string, GraphNode>();
  const lookup = buildLookup(index);

  const addEdge = (from: string, to: string, kind: EdgeKind, filePath: string) => {
    if (from === to) return;
    const key = `${from}\u0000${kind}\u0000${to}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ from, to, kind, filePath });
  };

  const accumulator: EdgeAccumulator = { add: addEdge };

  for (const symbol of index.symbols.values()) {
    if (!includeInternal && symbol.internal) continue;
    byId.set(symbol.id, {
      id: symbol.id,
      name: symbol.name,
      filePath: symbol.filePath,
      kind: symbol.kind,
    });
  }

  for (const symbol of index.symbols.values()) {
    if (!includeInternal && symbol.internal) continue;
    const sourceFile = index.project.getSourceFile(symbol.filePath);
    if (!sourceFile) continue;

    const declaration = findDeclaration(sourceFile, symbol.name);
    if (!declaration) continue;

    const symbolNode = declaration.getSymbol();
    if (!symbolNode) continue;

    walkAliases(symbol, symbolNode, index, lookup, addEdge);

    for (const entry of declaration.getType().getProperties()) {
      const propertyType = entry.getTypeAtLocation(declaration);
      walkType(
        propertyType,
        declaration,
        symbol.id,
        index,
        lookup,
        accumulator,
        new Set(),
      );
    }

    // functions & methods: walk the return type and parameters
    for (const signature of declaration.getType().getCallSignatures()) {
      const returnType = signature.getReturnType();
      walkType(
        returnType,
        declaration,
        symbol.id,
        index,
        lookup,
        accumulator,
        new Set(),
      );

      for (const parameter of signature.getParameters()) {
        walkType(
          parameter.getTypeAtLocation(declaration),
          declaration,
          symbol.id,
          index,
          lookup,
          accumulator,
          new Set(),
        );
      }
    }
  }

  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const list = adjacency.get(edge.from);
    if (list) list.push(edge.to);
    else adjacency.set(edge.from, [edge.to]);
  }

  return {
    nodes: Array.from(byId.values()),
    edges,
    adjacency,
  };
}

function walkAliases(
  symbol: { id: string; name: string; filePath: string },
  nodeSymbol: TsSymbol,
  index: RepositoryIndex,
  lookup: (filePath: string, name: string) => string | undefined,
  addEdge: (from: string, to: string, kind: EdgeKind, filePath: string) => void,
) {
  const aliased = nodeSymbol.getAliasedSymbol();
  if (!aliased || aliased.getName() === nodeSymbol.getName()) return;

  const declaration = aliased.getDeclarations()[0];
  if (!declaration) return;
  const filePath = declaration.getSourceFile().getFilePath();
  const target = lookup(filePath, aliased.getName());
  if (target) addEdge(symbol.id, target, 'alias', symbol.filePath);
}

/**
 * recursive type walker. `baseHandler` in story's builder only descends
 * into objects, unions, intersections, arrays and tuples; this mirrors it
 * and emits a `typeOf` edge whenever a type resolves to an indexed symbol.
 */
function walkType(
  type: Type,
  location: TsNode,
  from: string,
  index: RepositoryIndex,
  lookup: (filePath: string, name: string) => string | undefined,
  accumulator: EdgeAccumulator,
  visited: Set<string>,
) {
  const filePath = location.getSourceFile().getFilePath();
  const typeText = type.getText(
    location,
    ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope,
  );
  if (visited.has(`${typeText}\u0000${filePath}`)) return;
  visited.add(`${typeText}\u0000${filePath}`);

  const targetId = resolveTargetId(type, lookup);
  if (targetId) accumulator.add(from, targetId, 'typeOf', filePath);

  if (type.isUnion()) {
    for (const member of type.getUnionTypes()) {
      walkType(member, location, from, index, lookup, accumulator, visited);
    }
    return;
  }

  if (type.isIntersection()) {
    for (const member of type.getIntersectionTypes()) {
      walkType(member, location, from, index, lookup, accumulator, visited);
    }
    return;
  }

  if (type.isArray() || type.isReadonlyArray()) {
    const element = type.getArrayElementType();
    if (element) walkType(element, location, from, index, lookup, accumulator, visited);
    return;
  }

  if (type.isTuple()) {
    for (const element of type.getTupleElements()) {
      walkType(element, location, from, index, lookup, accumulator, visited);
    }
    return;
  }

  if (type.isObject() || type.isClassOrInterface() || type.getProperties().length > 0) {
    for (const prop of type.getProperties()) {
      if (prop.getName().startsWith('#')) continue;
      walkType(
        prop.getTypeAtLocation(location),
        location,
        from,
        index,
        lookup,
        accumulator,
        visited,
      );
    }
  }
}

function resolveTargetId(
  type: Type,
  lookup: (filePath: string, name: string) => string | undefined,
): string | undefined {
  const candidates: Array<{ symbol: TsSymbol; filePath?: string }> = [];
  const alias = type.getAliasSymbol();
  const symbol = type.getSymbol();
  if (alias) candidates.push({ symbol: alias });
  if (symbol && symbol !== alias) candidates.push({ symbol });

  for (const candidate of candidates) {
    const declaration = candidate.symbol.getDeclarations()[0];
    if (!declaration) continue;
    const filePath = declaration.getSourceFile().getFilePath();
    const resolved = lookup(filePath, candidate.symbol.getName());
    if (resolved) return resolved;
  }
  return undefined;
}

function buildLookup(
  index: RepositoryIndex,
): (filePath: string, name: string) => string | undefined {
  const map = new Map<string, string>();
  for (const symbol of index.symbols.values()) {
    map.set(`${symbol.filePath}\u0000${symbol.name}`, symbol.id);
  }
  return (filePath, name) => map.get(`${filePath}\u0000${name}`);
}

function findDeclaration(
  sourceFile: SourceFile,
  name: string,
): TsNode | undefined {
  for (const [exportName, declarations] of sourceFile.getExportedDeclarations()) {
    if (exportName !== name) continue;
    for (const entry of declarations) {
      const node = Array.isArray(entry) ? entry[0] : entry;
      if (Node.isSourceFile(node)) continue;
      return node;
    }
  }
  return undefined;
}