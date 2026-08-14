/**
 * Original: https://github.com/shikijs/shiki/blob/main/packages/vitepress-twoslash/src/cache-fs.ts
 */
function simpleHash(str: string): string {
  let h1 = 0xdeadbeef ^ 0, h2 = 0x41c6ce57 ^ 0;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import type { TwoslashTypesCache } from '@shikijs/twoslash';

export interface FileSystemTypeResultCacheOptions {
  /**
   * The directory to store the cache files.
   *
   * @default '.next/cache/twoslash'
   */
  dir?: string;

  cwd?: string;
}

export function createFileSystemTypesCache(
  options: FileSystemTypeResultCacheOptions = {},
): TwoslashTypesCache {
  const { cwd = process.cwd() } = options;
  const dir = path.join(cwd, options.dir ?? '.next/cache/twoslash');

  return {
    init() {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch {
        // skip
      }
    },
    read(code) {
      const hash = simpleHash(code);
      const filePath = path.join(dir, `${hash}.json`);
      if (!fs.existsSync(filePath)) {
        return null;
      }
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    },
    write(code, data) {
      const hash = simpleHash(code);
      const filePath = path.join(dir, `${hash}.json`);
      const json = JSON.stringify(data);
      fs.writeFileSync(filePath, json, 'utf-8');
    },
  };
}
