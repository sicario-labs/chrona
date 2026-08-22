import { EventEmitter } from 'node:events';
import type { TaskWorkspacePacket } from '../workspace/workspace-projector-types';
import type { RealityStore } from '../sqlite/reality-store';
import type {
  AgentLease,
  LeaseConflict,
  LeaseAcquisitionResult,
  SwarmSyncDelta,
} from './types';

export class ChronaSwarmArbiter extends EventEmitter {
  private leases = new Map<string, AgentLease>();

  constructor(private defaultTtlMs: number = 60_000) {
    super();
  }

  /**
   * Evaluates boundary overlap and acquires an exclusive semantic lease for an agent workspace.
   */
  public acquireLease(
    agentId: string,
    packet: TaskWorkspacePacket,
    ttlMs?: number
  ): LeaseAcquisitionResult {
    this.purgeExpiredLeases();

    const targetFiles: string[] = [];
    if (packet.manifest.target && packet.manifest.target !== 'root') {
      targetFiles.push(packet.manifest.target.replace(/\\/g, '/'));
    }
    if (packet.reality.target.file) {
      targetFiles.push(packet.reality.target.file.replace(/\\/g, '/'));
    }

    const boundaryFiles: string[] = [
      ...(packet.reality.boundary?.sourceModules || []),
      ...((packet.reality.boundary as any)?.directDependents || []),
      ...((packet.reality.boundary as any)?.transitiveDependents || []),
      ...(packet.reality.boundary?.tests || []),
      ...((packet.reality.boundary as any)?.affectedTests || []),
      ...(packet.reality.dependencies?.transitiveClosure || []),
      ...(packet.reality.dependencies?.graphEdges?.map((e) => e.to) || []),
      ...(packet.reality.dependencies?.graphEdges?.map((e) => e.from) || []),
    ].map((f) => f.replace(/\\/g, '/'));
    const conflicts: LeaseConflict[] = [];

    // Scan existing active leases for semantic collisions
    for (const lease of this.leases.values()) {
      if (lease.status !== 'ACTIVE' || lease.agentId === agentId) continue;

      const intersectingTargets = targetFiles.filter((tf) => lease.targetFiles.includes(tf));
      if (intersectingTargets.length > 0) {
        conflicts.push({
          conflictingLeaseId: lease.leaseId,
          conflictingAgentId: lease.agentId,
          conflictingWorkspaceId: lease.workspaceId,
          intersectingFiles: intersectingTargets,
          conflictType: 'DIRECT_TARGET',
          resolution: 'BLOCK',
          explanation: `Agent "${lease.agentId}" currently holds an active lease on target file(s): ${intersectingTargets.join(', ')}.`,
        });
      } else {
        const intersectingBoundary = boundaryFiles.filter((bf) => lease.targetFiles.includes(bf));
        if (intersectingBoundary.length > 0) {
          conflicts.push({
            conflictingLeaseId: lease.leaseId,
            conflictingAgentId: lease.agentId,
            conflictingWorkspaceId: lease.workspaceId,
            intersectingFiles: intersectingBoundary,
            conflictType: 'BOUNDARY_COLLISION',
            resolution: 'PROCEED_WITH_WARNING',
            explanation: `Agent "${lease.agentId}" is actively modifying files in your boundary context: ${intersectingBoundary.join(', ')}.`,
          });
        }
      }
    }

    const hasBlockingConflict = conflicts.some((c) => c.resolution === 'BLOCK');
    if (hasBlockingConflict) {
      return {
        granted: false,
        conflicts,
        reason: 'Semantic lease request blocked by concurrent agent target collision.',
      };
    }

    const duration = ttlMs || this.defaultTtlMs;
    const now = Date.now();
    const leaseId = `lease_${agentId}_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    const newLease: AgentLease = {
      leaseId,
      agentId,
      workspaceId: packet.workspaceId,
      snapshotId: packet.snapshotId,
      targetFiles: Array.from(new Set(targetFiles)),
      boundaryFiles: Array.from(new Set(boundaryFiles)),
      acquiredAt: new Date(now).toISOString(),
      expiresAt: new Date(now + duration).toISOString(),
      status: 'ACTIVE',
    };

    this.leases.set(leaseId, newLease);
    this.emit('lease_acquired', newLease);

    return {
      granted: true,
      lease: newLease,
      conflicts,
    };
  }

  /**
   * Releases an agent's active lease.
   */
  public releaseLease(leaseId: string): boolean {
    const lease = this.leases.get(leaseId);
    if (!lease || lease.status !== 'ACTIVE') return false;

    lease.status = 'RELEASED';
    this.emit('lease_released', lease);
    return true;
  }

  /**
   * Notifies the arbiter that an agent has committed code changes, calculating affected swarm peers.
   */
  public notifyCommit(
    leaseId: string,
    modifiedFiles: string[],
    realityStore: RealityStore
  ): SwarmSyncDelta {
    this.purgeExpiredLeases();

    const committingLease = this.leases.get(leaseId);
    const committingAgentId = committingLease ? committingLease.agentId : 'unknown_agent';
    const normModified = modifiedFiles.map((f) => f.replace(/\\/g, '/'));

    const affectedAgentIds = new Set<string>();
    const reprojectionRequiredAgents = new Set<string>();

    for (const lease of this.leases.values()) {
      if (lease.status !== 'ACTIVE' || lease.leaseId === leaseId) continue;

      const targetHit = lease.targetFiles.some((tf) => normModified.includes(tf));
      const boundaryHit = lease.boundaryFiles.some((bf) => normModified.includes(bf));

      if (targetHit) {
        affectedAgentIds.add(lease.agentId);
        reprojectionRequiredAgents.add(lease.agentId);
      } else if (boundaryHit) {
        affectedAgentIds.add(lease.agentId);
      }
    }

    const currentSnapshotId = realityStore.deriveCurrentSnapshotId();

    const delta: SwarmSyncDelta = {
      committedByAgentId: committingAgentId,
      committedSnapshotId: currentSnapshotId,
      modifiedFiles: normModified,
      affectedAgentIds: Array.from(affectedAgentIds),
      reprojectionRequiredAgents: Array.from(reprojectionRequiredAgents),
      timestamp: new Date().toISOString(),
    };

    this.emit('swarm_delta', delta);
    return delta;
  }

  /**
   * Returns all currently active leases.
   */
  public getActiveLeases(): AgentLease[] {
    this.purgeExpiredLeases();
    return Array.from(this.leases.values()).filter((l) => l.status === 'ACTIVE');
  }

  private purgeExpiredLeases(): void {
    const now = Date.now();
    for (const lease of this.leases.values()) {
      if (lease.status === 'ACTIVE' && new Date(lease.expiresAt).getTime() < now) {
        lease.status = 'EXPIRED';
        this.emit('lease_expired', lease);
      }
    }
  }
}
