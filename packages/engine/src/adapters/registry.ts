import path from 'node:path';
import type { LanguageAdapter } from './types';
import { TypeScriptAdapter } from './typescript';
import { PythonAdapter } from './python';

export class AdapterRegistry {
  private adapters: LanguageAdapter[] = [];
  private extensionMap = new Map<string, LanguageAdapter>();

  constructor() {
    this.register(new TypeScriptAdapter());
    this.register(new PythonAdapter());
  }

  register(adapter: LanguageAdapter): void {
    this.adapters.push(adapter);
    for (const ext of adapter.extensions) {
      this.extensionMap.set(ext.toLowerCase(), adapter);
    }
  }

  getAdapterForFile(filePath: string): LanguageAdapter | null {
    const ext = path.extname(filePath).toLowerCase();
    return this.extensionMap.get(ext) || null;
  }

  getSupportedExtensions(): string[] {
    return Array.from(this.extensionMap.keys());
  }
}
