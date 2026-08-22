import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

// --- gitignore-style matcher (dependency-free) ---

interface IgnoreRule {
  negate: boolean;
  dirOnly: boolean;
  anchored: boolean;
  hasSlash: boolean;
  regex: RegExp;
}

const GLOB_SPECIAL = /[.+^${}()|[\]\\]/g;
const DOUBLE_STAR_PLACEHOLDER = '\u0000';

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(GLOB_SPECIAL, '\\$&')
    .replace(/\*\*/g, DOUBLE_STAR_PLACEHOLDER)
    .replace(/\*/g, '[^/]*')
    .replace(new RegExp(DOUBLE_STAR_PLACEHOLDER, 'g'), '.*')
    .replace(/\?/g, '[^/]');
  return new RegExp(`^${escaped}$`);
}

function parseIgnoreLine(line: string): IgnoreRule | null {
  let l = line.trimEnd();
  if (!l || l.startsWith('#')) return null;
  let negate = false;
  if (l.startsWith('!')) {
    negate = true;
    l = l.slice(1);
  }
  let dirOnly = false;
  if (l.endsWith('/')) {
    dirOnly = true;
    l = l.slice(0, -1);
  }
  let anchored = false;
  if (l.startsWith('/')) {
    anchored = true;
    l = l.slice(1);
  }
  if (!l) return null;
  const hasSlash = l.includes('/');
  return { negate, dirOnly, anchored, hasSlash, regex: globToRegex(l) };
}

/**
 * gitignore-style matcher for `.chronaignore` (or `.gitignore` fallback).
 * `file` is a posix-relative path; `isDir` signals directory.
 */
export class IgnoreMatcher {
  private rules: IgnoreRule[] = [];

  addLine(line: string): void {
    const rule = parseIgnoreLine(line);
    if (rule) this.rules.push(rule);
  }

  addFile(lines: string[]): void {
    for (const line of lines) this.addLine(line);
  }

  isIgnored(file: string, isDir = false): boolean {
    const rel = file.replace(/^\.?\//, '');
    const segments = rel.split('/');
    // Walk each prefix; a dir-only rule can ignore an ancestor.
    let ignored = false;
    for (let i = 0; i < segments.length; i++) {
      const prefix = segments.slice(0, i + 1).join('/');
      const isLast = i === segments.length - 1;
      for (const rule of this.rules) {
        let match = false;
        if (rule.hasSlash || rule.anchored) {
          match = rule.regex.test(prefix);
        } else {
          // Basename-style rule matches any segment (or the full path).
          match = rule.regex.test(segments[i]) || rule.regex.test(rel);
        }
        if (!match) continue;
        const appliesToDirOnly = rule.dirOnly && !isDir && !isLast;
        if (appliesToDirOnly) continue;
        // `!` rules only re-include if the dir itself isn't ignored.
        ignored = rule.negate ? false : true;
      }
    }
    return ignored;
  }
}

export function parseIgnoreFile(contents: string): IgnoreMatcher {
  const matcher = new IgnoreMatcher();
  matcher.addFile(contents.split(/\r?\n/));
  return matcher;
}

// --- USTAR tar writer/reader (dependency-free) ---

function octal(value: number, length: number): Buffer {
  const str = value.toString(8).padStart(length - 1, '0');
  return Buffer.from(str + '\0', 'utf-8');
}

function tarHeader(name: string, size: number, mode: number, typeflag: number): Buffer {
  const header = Buffer.alloc(512);
  const nameBytes = Buffer.from(name, 'utf-8');
  let prefix = '';
  let finalName = name;
  if (nameBytes.byteLength > 100) {
    // USTAR split: name (tail, <= 100 bytes) + prefix (head dirs, <= 155 bytes).
    const bytes = nameBytes;
    let split = -1;
    for (let i = 99; i >= 0; i--) {
      if (bytes[i] === 0x2f /* '/' */) {
        split = i;
        break;
      }
    }
    if (split < 0) {
      // No slash in first 100 bytes: hard-split at a UTF-8 boundary.
      split = 99;
      while (split > 0 && (bytes[split] & 0xc0) === 0x80) split--;
      finalName = bytes.subarray(split + 1).toString('utf-8');
      prefix = bytes.subarray(0, split + 1).toString('utf-8');
    } else {
      finalName = bytes.subarray(split + 1).toString('utf-8');
      prefix = bytes.subarray(0, split).toString('utf-8');
    }
    if (Buffer.byteLength(prefix, 'utf-8') > 155) {
      throw new Error(`Path too long for tar: ${name}`);
    }
  }
  header.write(finalName, 0, 100, 'utf-8');
  header.write(octal(mode, 8).toString(), 100, 'utf-8');
  header.write(octal(0, 8).toString(), 108, 'utf-8');
  header.write(octal(0, 8).toString(), 116, 'utf-8');
  header.write(octal(size, 12).toString(), 124, 'utf-8');
  header.write(octal(Math.floor(Date.now() / 1000), 12).toString(), 136, 'utf-8');
  header[156] = typeflag;
  header.write('ustar', 257, 5, 'utf-8');
  header.write('00', 263, 2, 'utf-8');
  header.write('chrona', 265, 6, 'utf-8');
  if (prefix) header.write(prefix, 345, 155, 'utf-8');
  // Checksum: sum with chksum field zeroed, written as 6 octal + NUL + space.
  for (let i = 148; i < 156; i++) header[i] = 32;
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += header[i];
  header.write(sum.toString(8).padStart(6, '0'), 148, 'utf-8');
  header[154] = 0;
  header[155] = 32;
  return header;
}

export interface BundleFile {
  path: string;
  content: Buffer;
}

/** Build a tar.gz from a list of files (single-block mode bits kept simple). */
export function packTarGz(files: BundleFile[]): Buffer {
  const blocks: Buffer[] = [];
  for (const file of files) {
    blocks.push(tarHeader(file.path, file.content.byteLength, 0o100644, 0x30));
    blocks.push(file.content);
    const pad = (512 - (file.content.byteLength % 512)) % 512;
    if (pad) blocks.push(Buffer.alloc(pad));
  }
  blocks.push(Buffer.alloc(1024)); // end-of-archive
  const tar = Buffer.concat(blocks);
  return zlib.gzipSync(tar, { level: 6 });
}

/** Extract a tar.gz into `{ path -> content }` (dirs + regular files). */
export function extractTarGz(buffer: Buffer): Map<string, Buffer> {
  const tar = zlib.gunzipSync(buffer);
  const out = new Map<string, Buffer>();
  let offset = 0;
  while (offset + 512 <= tar.byteLength) {
    const header = tar.subarray(offset, offset + 512);
    const nameRaw = header.subarray(0, 100).toString('utf-8').replace(/\0.*$/, '');
    if (!nameRaw) break;
    const prefix = header.subarray(345, 500).toString('utf-8').replace(/\0.*$/, '');
    const size = parseInt(header.subarray(124, 136).toString('utf-8').replace(/\0.*$/, '').trim(), 8) || 0;
    const typeflag = header[156];
    offset += 512;
    if (typeflag === 0x30 || typeflag === 0) {
      const content = tar.subarray(offset, offset + size);
      out.set(prefix ? `${prefix}/${nameRaw}` : nameRaw, Buffer.from(content));
    }
    offset += Math.ceil(size / 512) * 512;
  }
  return out;
}

// --- source bundle packing ---

const ALWAYS_IGNORE = new Set(['.git', 'node_modules', 'dist', '.chrona']);

export interface PackSourceOptions {
  cwd: string;
  ignoreFile?: string; // explicit .chronaignore path
}

export interface SourceBundle {
  tarGz: Buffer;
  commit: string; // sha256 of the bundle (idempotency key)
  fileCount: number;
}

export async function packSourceBundle(options: PackSourceOptions): Promise<SourceBundle> {
  const matcher = new IgnoreMatcher();
  const chronaignore = path.join(options.cwd, '.chronaignore');
  const gitignore = path.join(options.cwd, '.gitignore');
  const ignorePath = options.ignoreFile ?? chronaignore;
  const contents = await fs.readFile(ignorePath, 'utf-8').catch(async () => {
    if (ignorePath !== chronaignore) throw new Error(`Ignore file not found: ${ignorePath}`);
    return fs.readFile(gitignore, 'utf-8').catch(() => '');
  });
  matcher.addFile(contents.split(/\r?\n/));

  const files: BundleFile[] = [];
  const seen = new Set<string>();

  async function walk(dir: string, rel = ''): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (ALWAYS_IGNORE.has(entry.name)) continue;
      if (matcher.isIgnored(relPath, entry.isDirectory())) continue;
      if (entry.isDirectory()) {
        await walk(path.join(dir, entry.name), relPath);
      } else if (entry.isFile()) {
        const full = path.join(dir, entry.name);
        const stat = await fs.stat(full);
        if (stat.size > 64 * 1024 * 1024) continue; // skip giant files
        const content = await fs.readFile(full);
        seen.add(relPath);
        files.push({ path: relPath, content });
      } else if (entry.isSymbolicLink()) {
        const target = await fs.readlink(path.join(dir, entry.name)).catch(() => '');
        if (target) files.push({ path: relPath, content: Buffer.from(`\u0000${target}`, 'utf-8') });
      }
    }
  }

  await walk(options.cwd);

  const tarGz = packTarGz(files);
  const commit = crypto.createHash('sha256').update(tarGz).digest('hex');
  return { tarGz, commit, fileCount: files.length };
}

/** Write a source bundle to disk (for runner extraction). */
export async function writeSourceBundle(bundle: SourceBundle, destDir: string): Promise<void> {
  await fs.mkdir(destDir, { recursive: true });
  const out = path.join(destDir, `${bundle.commit}.tar.gz`);
  await fs.writeFile(out, bundle.tarGz);
  return;
}

export function sourceObjectKey(tenant: string, commit: string): string {
  return `${tenant}/sources/${commit}.tar.gz`;
}