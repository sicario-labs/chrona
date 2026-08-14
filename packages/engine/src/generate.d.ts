import { type Symbol as TsSymbol, type Type } from 'ts-morph';
import type { RepositoryIndex } from '@/types';
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
export declare function generateSymbolDocumentation(index: RepositoryIndex, id: string, options?: GenerateOptions): Promise<GeneratedSymbolDoc | undefined>;
