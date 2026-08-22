import type { ExtractedSymbol, ObjectTypeResolution } from '../referee/oxc-extractor';
import type { BehavioralContract } from '../contracts/types';

export interface ExtractedImportsExports {
  imports: Array<{
    toFile: string;
    specifier: string;
    importedSymbols: string[];
    isDynamic: boolean;
    isTypeOnly: boolean;
  }>;
  exports: string[];
}

export interface LanguageAdapter {
  readonly name: string;
  readonly extensions: string[];
  canParse(filePath: string): boolean;
  extractSymbols(code: string, filePath: string): ExtractedSymbol[];
  extractImportsExports(code: string, filePath: string, knownFiles: string[]): ExtractedImportsExports;
  extractContracts(code: string, filePath: string): BehavioralContract[];
  resolveType?(typeText: string, symbolMap: Map<string, ExtractedSymbol>): ObjectTypeResolution;
}
