import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Claim, Evidence } from '../claim/types';

export interface FileFingerprint {
  mtimeMs: number;
  hash: string;
  claimsCacheKey: string;
}

export interface CacheIndex {
  version: string;
  files: Record<string, FileFingerprint>;
  evidenceMap: Record<string, { snapshotHash: string; evidenceCacheKey: string }>;
}

/**
 * Two-Level Incremental Cache System for Chrona
 *
 * Level 1: File fingerprints (mtime + sha256) in .chrona/cache/index.json
 * Level 2: Per-file Claim IR extraction in .chrona/cache/claims/
 * Level 3: Per-claim Evidence resolution in .chrona/cache/evidence/
 */
export class IncrementalCache {
  private cacheDir: string;
  private claimsDir: string;
  private evidenceDir: string;
  private indexPath: string;
  private index: CacheIndex = { version: 'v1', files: {}, evidenceMap: {} };
  private initialized = false;
  private isDirty = false;

  constructor(cwd: string = process.cwd()) {
    this.cacheDir = path.join(cwd, '.chrona', 'cache');
    this.claimsDir = path.join(this.cacheDir, 'claims');
    this.evidenceDir = path.join(this.cacheDir, 'evidence');
    this.indexPath = path.join(this.cacheDir, 'index.json');
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      await fs.mkdir(this.claimsDir, { recursive: true });
      await fs.mkdir(this.evidenceDir, { recursive: true });

      const raw = await fs.readFile(this.indexPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed.version === 'v1') {
        this.index = parsed;
      }
    } catch {
      this.index = { version: 'v1', files: {}, evidenceMap: {} };
    }

    this.initialized = true;
  }

  computeHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  /**
   * Retrieve cached Claim IR for a documentation file if mtime/hash match
   */
  async getClaims(filePath: string, mtimeMs: number, contentHash?: string): Promise<Claim[] | null> {
    const normalized = filePath.replace(/\\/g, '/');
    const fingerprint = this.index.files[normalized];
    if (!fingerprint) return null;

    if (fingerprint.mtimeMs === mtimeMs || (contentHash && fingerprint.hash === contentHash)) {
      try {
        const cacheFile = path.join(this.claimsDir, `${fingerprint.claimsCacheKey}.json`);
        const data = await fs.readFile(cacheFile, 'utf-8');
        return JSON.parse(data) as Claim[];
      } catch {
        return null;
      }
    }

    return null;
  }

  /**
   * Save extracted Claim IR to cache
   */
  async setClaims(
    filePath: string,
    mtimeMs: number,
    contentHash: string,
    claims: Claim[]
  ): Promise<void> {
    const normalized = filePath.replace(/\\/g, '/');
    const cacheKey = this.computeHash(`${normalized}:${contentHash}`);

    try {
      const cacheFile = path.join(this.claimsDir, `${cacheKey}.json`);
      await fs.writeFile(cacheFile, JSON.stringify(claims), 'utf-8');

      this.index.files[normalized] = {
        mtimeMs,
        hash: contentHash,
        claimsCacheKey: cacheKey,
      };
      this.isDirty = true;
    } catch {
      // Ignore cache write errors
    }
  }

  /**
   * Retrieve cached evidence for a specific claim if the AST snapshot hash matches
   */
  async getEvidence(claimId: string, snapshotHash: string): Promise<Evidence[] | null> {
    const entry = this.index.evidenceMap[claimId];
    if (!entry || entry.snapshotHash !== snapshotHash) return null;

    try {
      const cacheFile = path.join(this.evidenceDir, `${entry.evidenceCacheKey}.json`);
      const data = await fs.readFile(cacheFile, 'utf-8');
      return JSON.parse(data) as Evidence[];
    } catch {
      return null;
    }
  }

  /**
   * Cache evidence resolution result for a claim
   */
  async setEvidence(claimId: string, snapshotHash: string, evidence: Evidence[]): Promise<void> {
    const cacheKey = this.computeHash(`${claimId}:${snapshotHash}`);

    try {
      const cacheFile = path.join(this.evidenceDir, `${cacheKey}.json`);
      await fs.writeFile(cacheFile, JSON.stringify(evidence), 'utf-8');

      this.index.evidenceMap[claimId] = {
        snapshotHash,
        evidenceCacheKey: cacheKey,
      };
      this.isDirty = true;
    } catch {
      // Ignore cache write errors
    }
  }

  /**
   * Persist index.json if modified
   */
  async flush(): Promise<void> {
    if (!this.isDirty) return;

    try {
      await fs.writeFile(this.indexPath, JSON.stringify(this.index, null, 2), 'utf-8');
      this.isDirty = false;
    } catch {
      // Ignore index write errors
    }
  }

  /**
   * Clear all cached files and index
   */
  async clear(): Promise<void> {
    try {
      await fs.rm(this.cacheDir, { recursive: true, force: true });
      this.index = { version: 'v1', files: {}, evidenceMap: {} };
      this.initialized = false;
      this.isDirty = false;
    } catch {
      // Ignore
    }
  }
}
