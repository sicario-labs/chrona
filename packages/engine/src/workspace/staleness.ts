import type { TaskWorkspacePacket } from './workspace-projector-types';
import type { RealityStore } from '../sqlite/reality-store';

export type StalenessSeverity = 'NONE' | 'LOW' | 'HIGH' | 'CRITICAL';

export type StalenessScope = 'UNRELATED' | 'TARGET' | 'DEPENDENCY' | 'CONTRACT' | 'GLOBAL';

export type StalenessReason =
  | 'UP_TO_DATE'
  | 'TARGET_FILE_MUTATED'
  | 'DEPENDENCY_CHANGED'
  | 'CONTRACT_INVALIDATED'
  | 'EVIDENCE_INVALIDATED'
  | 'UNTOUCHED_CONCURRENT_DRIFT';

export interface ContextStalenessReport {
  isStale: boolean;
  packetSnapshotId: string;
  currentSnapshotId: string;
  severity: StalenessSeverity;
  scope: StalenessScope;
  reasons: StalenessReason[];
  stalenessReason?: StalenessReason;
  mutatedFiles: string[];
  affectedTargetFiles: string[];
  invalidatedContracts: string[];
  invalidatedEvidenceIds: string[];
  invalidatedClaims: string[];
  requiresReprojection: boolean;
  recompileRecommended: boolean;
  detectedAt: string;
}

export class StaleContextError extends Error {
  constructor(public report: ContextStalenessReport) {
    super(
      `Agent workspace context is STALE (Severity: ${report.severity}, Scope: ${report.scope}). ` +
      `Underlying reality advanced from ${report.packetSnapshotId} to ${report.currentSnapshotId}. ` +
      `Reasons: ${report.reasons.join(', ')}`
    );
    this.name = 'StaleContextError';
  }
}

export class ContextStalenessDetector {
  /**
   * Detects whether an active agent workspace packet is stale relative to current RealityStore state.
   */
  public static check(
    packet: TaskWorkspacePacket,
    realityStore: RealityStore,
    currentSnapshotId?: string,
    changedFiles?: string[]
  ): ContextStalenessReport {
    const detectedAt = new Date().toISOString();
    const currentId = currentSnapshotId || realityStore.deriveCurrentSnapshotId();

    if (packet.snapshotId === currentId) {
      return {
        isStale: false,
        packetSnapshotId: packet.snapshotId,
        currentSnapshotId: currentId,
        severity: 'NONE',
        scope: 'UNRELATED',
        reasons: ['UP_TO_DATE'],
        stalenessReason: 'UP_TO_DATE',
        mutatedFiles: [],
        affectedTargetFiles: [],
        invalidatedContracts: [],
        invalidatedEvidenceIds: [],
        invalidatedClaims: [],
        requiresReprojection: false,
        recompileRecommended: false,
        detectedAt,
      };
    }

    // 1. Identify Target, Dependency, and Evidence Files
    const targetFiles = new Set<string>();
    if (packet.manifest.target && packet.manifest.target !== 'root') {
      targetFiles.add(packet.manifest.target.replace(/\\/g, '/'));
    }
    if (packet.reality.target.file) {
      targetFiles.add(packet.reality.target.file.replace(/\\/g, '/'));
    }

    const dependencyFiles = new Set<string>(
      (packet.reality.dependencies.transitiveClosure || []).map((f) => f.replace(/\\/g, '/'))
    );
    const sliceFiles = new Set<string>(
      (packet.evidence.sourceSlices || []).map((s) => s.file.replace(/\\/g, '/'))
    );
    const allRelevantFiles = new Set<string>([...targetFiles, ...dependencyFiles, ...sliceFiles]);

    // 2. Identify Mutated Files
    const mutatedFiles: string[] = [];
    const affectedTargetFiles: string[] = [];
    const invalidatedContracts: string[] = [];
    const invalidatedEvidenceIds: string[] = [];
    const invalidatedClaims: string[] = [];
    const reasons: StalenessReason[] = [];

    if (changedFiles && changedFiles.length > 0) {
      const normChanged = changedFiles.map((f) => f.replace(/\\/g, '/'));
      for (const cf of normChanged) {
        if (allRelevantFiles.has(cf)) {
          mutatedFiles.push(cf);
        }
        if (targetFiles.has(cf)) {
          affectedTargetFiles.push(cf);
        }
      }
    } else {
      // 3. Ad-hoc Inspection: Check Target Contracts & Symbols when changedFiles not passed
      for (const tf of targetFiles) {
        const curContracts = realityStore.getContracts(tf);
        const packetContracts = packet.reality.contracts.filter(
          (c) => c.subject.replace(/\\/g, '/') === tf
        );

        // Check if any contract held in packet is no longer present or modified in store
        for (const pc of packetContracts) {
          const stillHolds = curContracts.some((cc) => cc.statement === pc.statement);
          if (!stillHolds) {
            if (!affectedTargetFiles.includes(tf)) {
              affectedTargetFiles.push(tf);
            }
            if (!invalidatedContracts.includes(pc.id)) {
              invalidatedContracts.push(pc.id);
            }
          }
        }

        // Check if target symbol signatures changed
        const targetSymName = packet.reality.target.symbol;
        if (targetSymName) {
          const storeSym = realityStore.getSymbol(targetSymName);
          if (storeSym && packet.reality.target.signature && storeSym.signature !== packet.reality.target.signature) {
            if (!affectedTargetFiles.includes(tf)) {
              affectedTargetFiles.push(tf);
            }
          }
        }
      }
    }

    // 4. Inspect Source Slice Evidence Invalidation
    for (const slice of packet.evidence.sourceSlices || []) {
      const sliceFileNorm = slice.file.replace(/\\/g, '/');
      if (mutatedFiles.includes(sliceFileNorm)) {
        invalidatedEvidenceIds.push(slice.id);
        if (slice.proves) {
          invalidatedClaims.push(slice.proves);
        }
      }
    }

    // 5. Compute Scope & Severity
    let scope: StalenessScope = 'UNRELATED';
    let severity: StalenessSeverity = 'LOW';
    let requiresReprojection = false;
    let recompileRecommended = false;

    if (affectedTargetFiles.length > 0) {
      scope = 'TARGET';
      severity = 'CRITICAL';
      reasons.push('TARGET_FILE_MUTATED');
      requiresReprojection = true;
      recompileRecommended = true;
    } else if (invalidatedContracts.length > 0) {
      scope = 'CONTRACT';
      severity = 'HIGH';
      reasons.push('CONTRACT_INVALIDATED');
      requiresReprojection = true;
      recompileRecommended = true;
    } else if (mutatedFiles.some((f) => dependencyFiles.has(f))) {
      scope = 'DEPENDENCY';
      severity = 'HIGH';
      reasons.push('DEPENDENCY_CHANGED');
      requiresReprojection = true;
      recompileRecommended = true;
    } else if (invalidatedEvidenceIds.length > 0) {
      scope = 'DEPENDENCY';
      severity = 'LOW';
      reasons.push('EVIDENCE_INVALIDATED');
      requiresReprojection = false;
      recompileRecommended = true;
    } else {
      scope = 'UNRELATED';
      severity = 'LOW';
      reasons.push('UNTOUCHED_CONCURRENT_DRIFT');
      requiresReprojection = false;
      recompileRecommended = false;
    }

    return {
      isStale: true,
      packetSnapshotId: packet.snapshotId,
      currentSnapshotId: currentId,
      severity,
      scope,
      reasons,
      stalenessReason: reasons[0],
      mutatedFiles,
      affectedTargetFiles,
      invalidatedContracts,
      invalidatedEvidenceIds,
      invalidatedClaims,
      requiresReprojection,
      recompileRecommended,
      detectedAt,
    };
  }

  /**
   * Optimistic Concurrency Control Assertion:
   * Throws StaleContextError if the workspace is critically stale.
   */
  public static assertNotStale(packet: TaskWorkspacePacket, realityStore: RealityStore): void {
    const report = this.check(packet, realityStore);
    if (report.isStale && (report.severity === 'CRITICAL' || report.scope === 'TARGET')) {
      throw new StaleContextError(report);
    }
  }
}
