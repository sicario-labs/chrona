import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { VerificationResult, ClaimResult, ExtractedSymbol } from '../claim/types';

export interface VerificationSnapshot {
  id: string;                    // SHA-256 of commit + timestamp
  commit: string;
  branch: string;
  timestamp: string;             // ISO 8601
  summary: {
    totalClaims: number;
    claimsVerified: number;
    contradictionsFound: number;
    unverifiedCount: number;
    ambiguousCount: number;
  };
  durationMs: number;
}

export interface SymbolTimeline {
  symbol: string;
  file: string;
  currentSignature: string;
  history: Array<{
    signature: string;
    commit: string;
    timestamp: string;
    breaking: boolean;
  }>;
  driftEvents: Array<{
    claimFile: string;
    claimLine: number;
    code: string;               // DOC-102, DOC-103, etc.
    detectedAt: string;
    resolvedAt?: string;
    resolution?: 'fixed' | 'suppressed' | 'unresolved';
  }>;
}

export interface DriftMetrics {
  totalDriftEvents: number;
  meanDriftDurationMs: number;
  fixRate: number;              // fixed / (fixed + suppressed)
  suppressionRate: number;
  topDriftingSymbols: Array<{ symbol: string; count: number }>;
}

export interface MemoryData {
  version: 1;
  projectName: string;
  createdAt: string;
  snapshots: VerificationSnapshot[];
  symbols: Record<string, SymbolTimeline>;
}

export class MemoryStore {
  private data: MemoryData;
  private filePath: string;
  private memoryDir: string;

  constructor(private cwd: string) {
    this.memoryDir = path.join(this.cwd, '.chrona');
    this.filePath = path.join(this.memoryDir, 'memory.json');
    this.data = this.createEmptyData();
  }

  private createEmptyData(): MemoryData {
    return {
      version: 1,
      projectName: path.basename(this.cwd),
      createdAt: new Date().toISOString(),
      snapshots: [],
      symbols: {}
    };
  }

  public load(): void {
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        this.data = JSON.parse(raw) as MemoryData;
      } catch (err) {
        // If file is corrupted, fall back to empty data
        this.data = this.createEmptyData();
      }
    }
  }

  public save(): void {
    if (!fs.existsSync(this.memoryDir)) {
      fs.mkdirSync(this.memoryDir, { recursive: true });
    }
    try {
      const tempPath = this.filePath + '.tmp';
      fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), 'utf-8');
      try {
        fs.renameSync(tempPath, this.filePath);
      } catch {
        fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
        try { fs.unlinkSync(tempPath); } catch {}
      }
    } catch {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    }
  }

  public recordVerification(result: VerificationResult, commit: string, branch: string): void {
    const timestamp = new Date().toISOString();
    const id = crypto.createHash('sha256').update(`${commit}-${timestamp}`).digest('hex').substring(0, 16);

    const snapshot: VerificationSnapshot = {
      id,
      commit,
      branch,
      timestamp,
      summary: {
        totalClaims: result.claims.length,
        claimsVerified: result.summary.claimsVerified,
        contradictionsFound: result.summary.contradictionsFound,
        unverifiedCount: result.summary.unverifiedCount,
        ambiguousCount: result.summary.ambiguousCount
      },
      durationMs: result.summary.verificationTimeMs
    };

    this.data.snapshots.push(snapshot);

    // Prune to latest 1000 snapshots
    if (this.data.snapshots.length > 1000) {
      this.data.snapshots = this.data.snapshots.slice(-1000);
    }
  }

  public recordSymbolChange(symbol: string, file: string, newSig: string, commit: string): void {
    if (!this.data.symbols[symbol]) {
      this.data.symbols[symbol] = {
        symbol,
        file,
        currentSignature: newSig,
        history: [],
        driftEvents: []
      };
      return;
    }

    const timeline = this.data.symbols[symbol];
    const oldSig = timeline.currentSignature;
    if (oldSig !== newSig) {
      timeline.history.push({
        signature: oldSig,
        commit,
        timestamp: new Date().toISOString(),
        breaking: this.isBreakingChange(oldSig, newSig)
      });
      timeline.currentSignature = newSig;
    }
  }

  private isBreakingChange(oldSig: string, newSig: string): boolean {
    if (!oldSig || !newSig) return false;
    const oldParams = oldSig.split('(')[1]?.split(')')[0] || '';
    const newParams = newSig.split('(')[1]?.split(')')[0] || '';
    return oldParams.split(',').length !== newParams.split(',').length;
  }

  public recordDriftEvent(symbol: string, claimFile: string, claimLine: number, code: string): void {
    if (!this.data.symbols[symbol]) {
      this.data.symbols[symbol] = {
        symbol,
        file: 'unknown',
        currentSignature: 'unknown',
        history: [],
        driftEvents: []
      };
    }
    
    const timeline = this.data.symbols[symbol];
    
    const isDuplicate = timeline.driftEvents.some(
      e => e.claimFile === claimFile && e.claimLine === claimLine && e.code === code && e.resolution === undefined
    );

    if (!isDuplicate) {
      timeline.driftEvents.push({
        claimFile,
        claimLine,
        code,
        detectedAt: new Date().toISOString()
      });
    }

    if (timeline.driftEvents.length > 1000) {
      timeline.driftEvents = timeline.driftEvents.slice(-1000);
    }
  }

  public resolveDriftEvent(symbol: string, code: string, claimFile: string, claimLine: number, resolution: 'fixed' | 'suppressed'): void {
    const timeline = this.data.symbols[symbol];
    if (!timeline) return;

    const event = timeline.driftEvents.find(
      e => e.claimFile === claimFile && e.claimLine === claimLine && e.code === code && e.resolution === undefined
    );

    if (event) {
      event.resolvedAt = new Date().toISOString();
      event.resolution = resolution;
    }
  }

  public getSymbolTimeline(symbol: string): SymbolTimeline | null {
    return this.data.symbols[symbol] || null;
  }

  public getSnapshots(since?: string): VerificationSnapshot[] {
    if (!since) return [...this.data.snapshots];
    const sinceDate = new Date(since).getTime();
    return this.data.snapshots.filter(s => new Date(s.timestamp).getTime() >= sinceDate);
  }

  public getDriftMetrics(): DriftMetrics {
    let totalDriftEvents = 0;
    let totalResolved = 0;
    let totalFixed = 0;
    let totalSuppressed = 0;
    let totalDriftDurationMs = 0;

    const symbolDriftCounts: Record<string, number> = {};

    for (const [sym, timeline] of Object.entries(this.data.symbols)) {
      symbolDriftCounts[sym] = timeline.driftEvents.length;
      totalDriftEvents += timeline.driftEvents.length;

      for (const event of timeline.driftEvents) {
        if (event.resolution) {
          totalResolved++;
          if (event.resolution === 'fixed') totalFixed++;
          if (event.resolution === 'suppressed') totalSuppressed++;

          if (event.resolvedAt && event.detectedAt) {
            totalDriftDurationMs += (new Date(event.resolvedAt).getTime() - new Date(event.detectedAt).getTime());
          }
        }
      }
    }

    const topDriftingSymbols = Object.entries(symbolDriftCounts)
      .map(([symbol, count]) => ({ symbol, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalDriftEvents,
      meanDriftDurationMs: totalResolved > 0 ? totalDriftDurationMs / totalResolved : 0,
      fixRate: totalResolved > 0 ? totalFixed / totalResolved : 0,
      suppressionRate: totalResolved > 0 ? totalSuppressed / totalResolved : 0,
      topDriftingSymbols
    };
  }

  public query(opts: { symbol?: string; since?: string; until?: string; type?: 'drift' | 'breaking' | 'all' }): SymbolTimeline[] {
    let results = Object.values(this.data.symbols);
    
    if (opts.symbol) {
      results = results.filter(s => s.symbol === opts.symbol);
    }
    
    return results;
  }

  public getData(): MemoryData {
    return this.data;
  }
}
