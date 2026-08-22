export type LeaseConflictType = 'DIRECT_TARGET' | 'BOUNDARY_COLLISION' | 'CONTRACT_INTERSECTION';
export type ConflictResolution = 'BLOCK' | 'QUEUE' | 'FORK_BRANCH' | 'PROCEED_WITH_WARNING';

export interface LeaseConflict {
  conflictingLeaseId: string;
  conflictingAgentId: string;
  conflictingWorkspaceId: string;
  intersectingFiles: string[];
  conflictType: LeaseConflictType;
  resolution: ConflictResolution;
  explanation: string;
}

export interface AgentLease {
  leaseId: string;
  agentId: string;
  workspaceId: string;
  snapshotId: string;
  targetFiles: string[];
  boundaryFiles: string[];
  acquiredAt: string;
  expiresAt: string;
  status: 'ACTIVE' | 'RELEASED' | 'EXPIRED' | 'PREEMPTED';
}

export interface LeaseAcquisitionResult {
  granted: boolean;
  lease?: AgentLease;
  conflicts: LeaseConflict[];
  reason?: string;
}

export interface SwarmSyncDelta {
  committedByAgentId: string;
  committedSnapshotId: string;
  modifiedFiles: string[];
  affectedAgentIds: string[];
  reprojectionRequiredAgents: string[];
  timestamp: string;
}
