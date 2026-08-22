import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ExtractedSymbol } from './oxc-extractor';

export interface FileCacheRecord {
  filePath: string;
  contentHash: string;
  mtimeMs: number;
  extractedSymbols: ExtractedSymbol[];
}

export interface CacheStore {
  version: 'v1';
  records: Record<string, FileCacheRecord>;
}

/**
 * High-speed ContentHash cache for Truth Referee
 * Stored in `.chrona/referee-cache.json` for persistent sub-100ms incremental checks
 */
export class ContentCache {
  private cacheDir: string;
  private cacheFilePath: string;
  private store: CacheStore = { version: 'v1', records: {} };
  private dirty = false;

  constructor(cwd: string) {
    this.cacheDir = path.join(cwd, '.chrona');
    this.cacheFilePath = path.join(this.cacheDir, 'referee-cache.json');
  }

  async init(): Promise<void> {
    try {
      const data = await fs.readFile(this.cacheFilePath, 'utf-8');
      const parsed = JSON.parse(data) as CacheStore;
      if (parsed.version === 'v1' && parsed.records) {
        this.store = parsed;
      }
    } catch {
      this.store = { version: 'v1', records: {} };
    }
  }

  computeHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  get(filePath: string, currentHash: string): FileCacheRecord | null {
    const record = this.store.records[filePath];
    if (record && record.contentHash === currentHash) {
      return record;
    }
    return null;
  }

  /**
   * Fast-path lookup: a matching filesystem mtime short-circuits the parser entirely,
   * skipping the file read and content hash for untouched files.
   */
  getByMtime(filePath: string, mtimeMs: number): FileCacheRecord | null {
    const record = this.store.records[filePath];
    if (record && record.mtimeMs === mtimeMs && record.extractedSymbols) {
      return record;
    }
    return null;
  }

  set(filePath: string, contentHash: string, mtimeMs: number, symbols: ExtractedSymbol[]): void {
    this.store.records[filePath] = {
      filePath,
      contentHash,
      mtimeMs,
      extractedSymbols: symbols,
    };
    this.dirty = true;
  }

  async flush(): Promise<void> {
    if (!this.dirty) return;
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      await fs.writeFile(this.cacheFilePath, JSON.stringify(this.store, null, 2), 'utf-8');
      this.dirty = false;
    } catch {
      // Ignore cache write failure
    }
  }
}
