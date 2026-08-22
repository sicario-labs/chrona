import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { VerificationReceipt } from './types';

export class ReceiptGenerator {
  private cwd: string;
  private receiptsDir: string;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
    this.receiptsDir = path.join(this.cwd, '.chrona', 'receipts');
  }

  /**
   * Generate a tamper-evident cryptographic verification receipt for a verified change.
   */
  public generateReceipt(
    data: Omit<VerificationReceipt, 'id' | 'hash' | 'signature'>,
    secretKey?: string
  ): VerificationReceipt {
    const timestamp = data.timestamp || new Date().toISOString();
    const idPrefix = 'CHRONA-PROOF';
    
    // Hash payload for deterministic checksum
    const rawPayload = JSON.stringify({
      request: data.request,
      workspaceId: data.workspaceId,
      snapshotId: data.snapshotId,
      commit: data.commit,
      summary: data.summary,
      claims: data.claims,
      contractsPreserved: data.contractsPreserved,
      contractsViolated: data.contractsViolated,
      evidenceCoverage: data.evidenceCoverage,
    });

    const hash = crypto.createHash('sha256').update(rawPayload).digest('hex');
    const id = `${idPrefix}-${hash.substring(0, 8).toUpperCase()}-${hash.substring(8, 12).toUpperCase()}`;

    // Cryptographic signature using secretKey or deterministic HMAC
    const key = secretKey || 'chrona-epistemic-verifier-root-key';
    const signature = crypto.createHmac('sha256', key).update(`${id}:${hash}`).digest('hex');

    const receipt: VerificationReceipt = {
      ...data,
      id,
      hash,
      signature,
    };

    this.saveReceipt(receipt);
    return receipt;
  }

  /**
   * Persist receipt to .chrona/receipts/
   */
  public saveReceipt(receipt: VerificationReceipt): void {
    try {
      if (!fs.existsSync(this.receiptsDir)) {
        fs.mkdirSync(this.receiptsDir, { recursive: true });
      }
      const filePath = path.join(this.receiptsDir, `${receipt.id}.json`);
      fs.writeFileSync(filePath, JSON.stringify(receipt, null, 2), 'utf-8');
    } catch {
      // Ignore disk write errors
    }
  }

  /**
   * Retrieve past receipts
   */
  public getReceipt(id: string): VerificationReceipt | null {
    const filePath = path.join(this.receiptsDir, `${id}.json`);
    if (fs.existsSync(filePath)) {
      try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch {
        return null;
      }
    }
    return null;
  }

  public listReceipts(): VerificationReceipt[] {
    if (!fs.existsSync(this.receiptsDir)) return [];
    try {
      const files = fs.readdirSync(this.receiptsDir);
      const receipts: VerificationReceipt[] = [];
      for (const f of files) {
        if (f.endsWith('.json')) {
          try {
            const raw = fs.readFileSync(path.join(this.receiptsDir, f), 'utf-8');
            receipts.push(JSON.parse(raw));
          } catch {}
        }
      }
      return receipts;
    } catch {
      return [];
    }
  }
}
