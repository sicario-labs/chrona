import * as fs from 'node:fs';
import * as path from 'node:path';
import type { BehavioralContract, ContractRegistryData, ContractStatus } from './types';

export class ContractStore {
  private data: ContractRegistryData;
  private filePath: string;
  private storeDir: string;

  constructor(private cwd: string = process.cwd()) {
    this.storeDir = path.join(this.cwd, '.chrona');
    this.filePath = path.join(this.storeDir, 'contracts.json');
    this.data = this.createEmptyData();
  }

  private createEmptyData(): ContractRegistryData {
    return {
      version: 1,
      projectName: path.basename(this.cwd),
      updatedAt: new Date().toISOString(),
      contracts: {},
    };
  }

  public load(): void {
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        this.data = JSON.parse(raw) as ContractRegistryData;
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

  public addContract(contract: BehavioralContract): void {
    this.data.contracts[contract.id] = contract;
  }

  public getContract(id: string): BehavioralContract | null {
    return this.data.contracts[id] || null;
  }

  public listContracts(): BehavioralContract[] {
    return Object.values(this.data.contracts);
  }

  public query(filter: {
    subject?: string;
    type?: string;
    status?: ContractStatus;
    origin?: string;
  } = {}): BehavioralContract[] {
    return Object.values(this.data.contracts).filter((c) => {
      if (filter.subject && !c.subject.toLowerCase().includes(filter.subject.toLowerCase()) && !c.statement.toLowerCase().includes(filter.subject.toLowerCase())) {
        return false;
      }
      if (filter.type && c.type !== filter.type) return false;
      if (filter.status && c.status !== filter.status) return false;
      if (filter.origin && c.origin !== filter.origin) return false;
      return true;
    });
  }

  public recordViolation(contractId: string, message: string): void {
    const contract = this.data.contracts[contractId];
    if (contract) {
      contract.status = 'violated';
      contract.violationMessage = message;
      contract.lastVerifiedAt = new Date().toISOString();
    }
  }

  public resolveViolation(contractId: string): void {
    const contract = this.data.contracts[contractId];
    if (contract) {
      contract.status = 'active';
      contract.violationMessage = undefined;
      contract.lastVerifiedAt = new Date().toISOString();
    }
  }

  public getData(): ContractRegistryData {
    return this.data;
  }
}
