import type { ClaimResult, VerificationResult } from '../../../engine/src/claim/types';
import type { CompilerDiagnostic } from '../../../engine/src/compiler-types';

export type StreamEvent =
  | { type: 'check:start'; timestamp: string; scope: string }
  | { type: 'file:start'; file: string; claimsCount: number }
  | { type: 'claim:verified'; claimId: string; file: string; line: number; subject: string }
  | { type: 'claim:contradicted'; claimId: string; file: string; line: number; diagnostic: CompilerDiagnostic }
  | {
      type: 'check:complete';
      status: 'pass' | 'warn' | 'fail';
      errorsCount: number;
      warningsCount: number;
      claimsVerified: number;
      contradictionsFound: number;
      durationMs: number;
    };

/**
 * NDJSON streaming writer for CI runners and IDE background workers.
 */
export class NdjsonStreamWriter {
  private outputStream: NodeJS.WritableStream;

  constructor(outputStream: NodeJS.WritableStream = process.stdout) {
    this.outputStream = outputStream;
  }

  writeEvent(event: StreamEvent): void {
    this.outputStream.write(JSON.stringify(event) + '\n');
  }

  emitVerificationStream(result: VerificationResult, scope = 'workspace'): void {
    this.writeEvent({
      type: 'check:start',
      timestamp: new Date().toISOString(),
      scope,
    });

    const fileMap = new Map<string, ClaimResult[]>();
    for (const cr of result.claims) {
      const file = cr.claim.source.file;
      if (!fileMap.has(file)) fileMap.set(file, []);
      fileMap.get(file)!.push(cr);
    }

    for (const [file, claims] of fileMap.entries()) {
      this.writeEvent({
        type: 'file:start',
        file,
        claimsCount: claims.length,
      });

      for (const cr of claims) {
        if (cr.status === 'contradicted' && cr.diagnostic) {
          this.writeEvent({
            type: 'claim:contradicted',
            claimId: cr.claim.id,
            file: cr.claim.source.file,
            line: cr.claim.source.line,
            diagnostic: cr.diagnostic,
          });
        } else if (cr.status === 'verified') {
          this.writeEvent({
            type: 'claim:verified',
            claimId: cr.claim.id,
            file: cr.claim.source.file,
            line: cr.claim.source.line,
            subject: cr.claim.subject,
          });
        }
      }
    }

    this.writeEvent({
      type: 'check:complete',
      status: result.status,
      errorsCount: result.errorsCount,
      warningsCount: result.warningsCount,
      claimsVerified: result.summary.claimsVerified,
      contradictionsFound: result.summary.contradictionsFound,
      durationMs: result.summary.verificationTimeMs,
    });
  }
}
