import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Evidence } from '../claim/types';

export interface ArchitecturalDecision {
  id: string;                         // ADR-001 or dec_...
  statement: string;                  // "We use Redis for distributed locks and rate limiting"
  rationale: string;                  // "Cross-process coordination for queue workers"
  recordedAt: string;
  recordedBy: 'developer' | 'ai-agent';
  status: 'active' | 'superseded' | 'stale';
  contracts: string[];                // Associated contract IDs
  sourceCommit?: string;
  tags?: string[];
  lastVerifiedAt: string;
}

export interface DecisionRegistryData {
  version: 1;
  projectName: string;
  updatedAt: string;
  decisions: Record<string, ArchitecturalDecision>;
}

export class DecisionStore {
  private data: DecisionRegistryData;
  private filePath: string;
  private storeDir: string;

  constructor(private cwd: string = process.cwd()) {
    this.storeDir = path.join(this.cwd, '.chrona');
    this.filePath = path.join(this.storeDir, 'decisions.json');
    this.data = this.createEmptyData();
  }

  private createEmptyData(): DecisionRegistryData {
    return {
      version: 1,
      projectName: path.basename(this.cwd),
      updatedAt: new Date().toISOString(),
      decisions: {},
    };
  }

  public load(): void {
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        this.data = JSON.parse(raw) as DecisionRegistryData;
      } catch {
        this.data = this.createEmptyData();
      }
    }
  }

  public save(): void {
    if (!fs.existsSync(this.storeDir)) {
      fs.mkdirSync(this.storeDir, { recursive: true });
    }
    this.data.updatedAt = new Date().toISOString();
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

  public recordDecision(
    statement: string,
    options: {
      rationale?: string;
      recordedBy?: 'developer' | 'ai-agent';
      contracts?: string[];
      commit?: string;
      tags?: string[];
    } = {}
  ): ArchitecturalDecision {
    const existingCount = Object.keys(this.data.decisions).length;
    const id = `ADR-${String(existingCount + 1).padStart(3, '0')}`;
    const now = new Date().toISOString();

    const decision: ArchitecturalDecision = {
      id,
      statement: statement.trim(),
      rationale: options.rationale || 'Architectural decision recorded via Chrona institutional memory.',
      recordedAt: now,
      recordedBy: options.recordedBy || 'developer',
      status: 'active',
      contracts: options.contracts || [],
      sourceCommit: options.commit,
      tags: options.tags || [],
      lastVerifiedAt: now,
    };

    this.data.decisions[id] = decision;
    this.save();
    return decision;
  }

  public listDecisions(): ArchitecturalDecision[] {
    return Object.values(this.data.decisions);
  }

  public getDecision(id: string): ArchitecturalDecision | null {
    return this.data.decisions[id] || null;
  }
}
