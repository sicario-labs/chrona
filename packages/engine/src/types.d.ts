import { Project, type Node } from 'ts-morph';
export interface IndexedSymbol {
    /**
     * stable ID across re-indexes: `${filePath}#${name}`
     */
    id: string;
    name: string;
    filePath: string;
    kind: SymbolKind;
    /**
     * JSDoc description of the declaration
     */
    description?: string;
    /**
     * simplified textual type
     */
    type: string;
    references: SymbolReference[];
    /**
     * aliases / re-export names that resolve to this symbol
     */
    aliases: string[];
    deprecated: boolean;
    internal: boolean;
    exported: boolean;
}
export type SymbolKind = 'class' | 'interface' | 'type-alias' | 'enum' | 'function' | 'variable' | 'module' | 'unknown';
export interface SymbolReference {
    filePath: string;
    line: number;
    column: number;
    /**
     * textual form of the reference in source
     */
    kind: 'import' | 'usage';
}
export interface RepositoryIndex {
    project: Project;
    symbols: Map<string, IndexedSymbol>;
    /**
     * symbols grouped by name (a name may resolve in multiple files)
     */
    byName: Map<string, IndexedSymbol[]>;
    files: string[];
}
export interface IndexOptions {
    /**
     * @defaultValue './tsconfig.json'
     */
    tsconfigPath?: string;
    /**
     * resolve symbols to their original declaration through aliases & re-exports
     *
     * @defaultValue true
     */
    resolveAliases?: boolean;
    /**
     * limit indexing to a subset of files
     */
    include?: (filePath: string) => boolean;
    /**
     * exclude files from indexing
     */
    exclude?: (filePath: string) => boolean;
    /**
     * explicit list of files to index. when provided, the project's
     * file-system scan is skipped (used for in-memory / fixture projects)
     */
    files?: string[];
    /**
     * collect reference locations. expensive on large repos.
     *
     * @defaultValue true
     */
    collectReferences?: boolean;
}
export declare function getSymbolKind(node: Node): SymbolKind;
