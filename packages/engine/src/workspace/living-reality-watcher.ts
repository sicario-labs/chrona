import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TaskWorkspacePacket } from './workspace-projector-types';
import type { RealityStore } from '../sqlite/reality-store';
import { ContextStalenessDetector, type ContextStalenessReport } from './staleness';
import { AdapterRegistry } from '../adapters/registry';
import { ContractExtractor } from '../contracts/extractor';

export interface LivingRealityEvents {
  snapshot_advanced: (payload: { previousSnapshotId: string; newSnapshotId: string; changedFiles: string[] }) => void;
  workspace_staleness: (payload: { workspaceId: string; report: ContextStalenessReport }) => void;
  critical_invalidation: (payload: { workspaceId: string; report: ContextStalenessReport }) => void;
}

export class ChronaLivingRealityWatcher extends EventEmitter {
  private activeWorkspaces = new Map<string, TaskWorkspacePacket>();
  private adapters: AdapterRegistry;
  private contractExtractor: ContractExtractor;
  private currentSnapshotId: string;
  private isRunning = false;

  constructor(
    private rootDir: string,
    private realityStore: RealityStore,
    adapters?: AdapterRegistry
  ) {
    super();
    this.adapters = adapters || new AdapterRegistry();
    this.contractExtractor = new ContractExtractor(rootDir);
    this.currentSnapshotId = this.realityStore.deriveCurrentSnapshotId();
  }

  /**
   * Register an active agent workspace to receive continuous staleness and invalidation events.
   */
  public registerWorkspace(packet: TaskWorkspacePacket): void {
    this.activeWorkspaces.set(packet.workspaceId, packet);
  }

  /**
   * Unregister an agent workspace when the task is completed or abandoned.
   */
  public unregisterWorkspace(workspaceId: string): void {
    this.activeWorkspaces.delete(workspaceId);
  }

  /**
   * Process a single or batch of modified files continuously, updating SQLite
   * and notifying all registered agent workspaces.
   */
  public async handleFileChanges(changedRelativePaths: string[]): Promise<string> {
    const fileList: Array<{ relativePath: string; fullPath: string; mtimeMs: number; size: number }> = [];

    for (const rel of changedRelativePaths) {
      const full = path.join(this.rootDir, rel);
      try {
        const stat = fs.statSync(full);
        fileList.push({
          relativePath: rel.replace(/\\/g, '/'),
          fullPath: full,
          mtimeMs: stat.mtimeMs,
          size: stat.size,
        });
      } catch {
        // File may have been deleted; empty stat will trigger sync deletion
      }
    }

    // 1. Sync modified files incrementally to SQLite
    await this.realityStore.syncIncremental(fileList, this.adapters, this.contractExtractor);

    // 2. Advance snapshot identity
    const prevSnapshotId = this.currentSnapshotId;
    const newSnapshotId = this.realityStore.deriveCurrentSnapshotId();
    this.currentSnapshotId = newSnapshotId;

    this.emit('snapshot_advanced', {
      previousSnapshotId: prevSnapshotId,
      newSnapshotId,
      changedFiles: changedRelativePaths,
    });

    // 3. Evaluate staleness across all active agent workspaces
    for (const [wsId, packet] of this.activeWorkspaces.entries()) {
      const report = ContextStalenessDetector.check(packet, this.realityStore, newSnapshotId, changedRelativePaths);

      if (report.isStale) {
        this.emit('workspace_staleness', { workspaceId: wsId, report });

        if (report.severity === 'CRITICAL' || report.scope === 'TARGET') {
          this.emit('critical_invalidation', { workspaceId: wsId, report });
        }
      }
    }

    return newSnapshotId;
  }

  public getCurrentSnapshotId(): string {
    return this.currentSnapshotId;
  }

  public getActiveWorkspaceCount(): number {
    return this.activeWorkspaces.size;
  }
}
