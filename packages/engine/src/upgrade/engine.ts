import * as fs from 'node:fs';
import * as path from 'node:path';
import type { RealityStore } from '../sqlite/reality-store';
import type { ExternalRealityResolver } from '../registry/resolver';
import { PackageRealityDiffer } from './differ';
import { UpgradeCallSiteScanner } from './scanner';
import type { UpgradeOptions, UpgradeWorkOrder, UpgradeResult } from './types';

export class ChronaUpgradeEngine {
  constructor(
    private rootDir: string = process.cwd(),
    private realityStore: RealityStore,
    private realityResolver: ExternalRealityResolver
  ) {}

  /**
   * Plans an upgrade between two package versions, generating an evidence-grounded UpgradeWorkOrder.
   */
  public async planUpgrade(options: UpgradeOptions): Promise<UpgradeWorkOrder> {
    const root = options.cwd || this.rootDir;
    const pkgName = options.packageName;

    // 1. Detect fromVersion if not provided
    let fromVersion = options.fromVersion;
    if (!fromVersion) {
      fromVersion = this.detectInstalledVersion(root, pkgName);
    }

    if (!fromVersion) {
      throw new Error(`Could not determine currently installed version of "${pkgName}". Please specify --from <version>.`);
    }

    const toVersion = options.toVersion;

    // 2. Resolve verified realities from Chrona Registry
    const fromReality = await this.realityResolver.resolve(pkgName, fromVersion);
    if (!fromReality) {
      throw new Error(`Package reality not found in Chrona Registry for ${pkgName}@${fromVersion}.`);
    }

    const toReality = await this.realityResolver.resolve(pkgName, toVersion);
    if (!toReality) {
      throw new Error(`Package reality not found in Chrona Registry for ${pkgName}@${toVersion}.`);
    }

    // 3. Compute Reality Diff
    const realityDiff = PackageRealityDiffer.diff(fromReality, toReality);

    // 4. Scan Local Callsites
    const { affectedLocalFiles, callSites } = await UpgradeCallSiteScanner.scan(root, this.realityStore, realityDiff);

    // 5. Synthesize Migration Steps & Verification Plan
    const migrationSteps: string[] = [];
    if (realityDiff.removedSymbols.length > 0) {
      migrationSteps.push(
        `Refactor removed symbols: ${realityDiff.removedSymbols.map((s) => `"${s.name}"`).join(', ')} in ${affectedLocalFiles.length} files.`
      );
    }
    if (realityDiff.mutatedSymbols.filter((m) => m.isBreaking).length > 0) {
      migrationSteps.push(
        `Update argument signatures for breaking functions: ${realityDiff.mutatedSymbols
          .filter((m) => m.isBreaking)
          .map((m) => `"${m.name}"`)
          .join(', ')}.`
      );
    }
    if (realityDiff.mutatedContracts.length > 0) {
      migrationSteps.push(
        `Verify compliance with ${realityDiff.mutatedContracts.length} altered behavioral contracts across dependencies.`
      );
    }
    migrationSteps.push(`Update package.json dependency: "${pkgName}": "${toVersion}".`);
    migrationSteps.push(`Execute verification sweep and produce Chrona Proof Verification Receipt.`);

    const requiredInvariants = toReality.contracts.filter((c) => c.type === 'invariant' || c.type === 'authorization').map((c) => c.statement);

    const workOrderId = `wo_upgrade_${pkgName}_${toVersion}_${Date.now().toString(36)}`;

    return {
      id: workOrderId,
      packageName: pkgName,
      fromVersion,
      toVersion,
      realityDiff,
      affectedLocalFiles,
      callSites,
      requiredInvariants,
      migrationSteps,
      verificationPlan: {
        testsToRun: affectedLocalFiles.map((f) => f.replace(/\.(ts|js|tsx|jsx)$/, '.test.ts')),
        contractsToVerify: toReality.contracts.map((c) => c.id),
      },
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Formats the UpgradeWorkOrder into a human-readable ASCII scorecard.
   */
  public formatScorecard(workOrder: UpgradeWorkOrder): string {
    const diff = workOrder.realityDiff;
    const lines: string[] = [];

    lines.push('');
    lines.push('Dependency Reality Diff');
    lines.push('────────────────────────────────────────────────────────────────────────');
    lines.push(`Package: ${workOrder.packageName}@${workOrder.fromVersion} → ${workOrder.packageName}@${workOrder.toVersion}`);
    lines.push(`Risk Assessment: ${diff.riskLevel} (${diff.breakingChangesCount} breaking change${diff.breakingChangesCount === 1 ? '' : 's'})`);
    lines.push('');

    lines.push('API Reality Changes:');
    if (diff.addedSymbols.length === 0 && diff.removedSymbols.length === 0 && diff.mutatedSymbols.length === 0) {
      lines.push('  (No public symbol shape changes detected)');
    } else {
      for (const s of diff.addedSymbols) {
        lines.push(`  + ${s.name}${s.signature ? ` ${s.signature}` : ''}`);
      }
      for (const s of diff.mutatedSymbols) {
        lines.push(`  ~ ${s.name}: ${s.fromSignature} → ${s.toSignature}${s.isBreaking ? ' [BREAKING]' : ''}`);
      }
      for (const s of diff.removedSymbols) {
        lines.push(`  - ${s.name} [REMOVED]`);
      }
    }

    if (diff.mutatedContracts.length > 0) {
      lines.push('');
      lines.push('Behavioral Contract Changes:');
      for (const c of diff.mutatedContracts) {
        const icon = c.status === 'added' ? '+' : c.status === 'removed' ? '-' : '~';
        lines.push(`  ${icon} [${c.type.toUpperCase()}] ${c.statement} (${c.status})`);
      }
    }

    lines.push('');
    lines.push('Local Codebase Impact:');
    if (workOrder.affectedLocalFiles.length === 0) {
      lines.push('  ✓ No breaking callsites or removed symbols detected in local repository.');
    } else {
      lines.push(`  ! ${workOrder.affectedLocalFiles.length} file(s) affected (${workOrder.callSites.length} callsite(s)):`);
      for (const cs of workOrder.callSites.slice(0, 10)) {
        lines.push(`    • ${cs.file}:${cs.line} (${cs.symbol}) → ${cs.suggestedAction}`);
      }
      if (workOrder.callSites.length > 10) {
        lines.push(`    ... and ${workOrder.callSites.length - 10} more callsites`);
      }
    }

    lines.push('');
    lines.push('Agent Migration Work Order:');
    for (let i = 0; i < workOrder.migrationSteps.length; i++) {
      lines.push(`  ${i + 1}. ${workOrder.migrationSteps[i]}`);
    }
    lines.push('');

    return lines.join('\n');
  }

  private detectInstalledVersion(root: string, pkgName: string): string | undefined {
    try {
      const pkgJsonPath = path.join(root, 'package.json');
      if (fs.existsSync(pkgJsonPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps[pkgName]) {
          return deps[pkgName].replace(/[\^~>=<]/g, '').trim();
        }
      }
    } catch {}
    return undefined;
  }
}
