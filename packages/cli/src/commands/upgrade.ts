import picocolors from 'picocolors';
import {
  RealityStore,
  ExternalRealityResolver,
  RegistryClient,
  ChronaUpgradeEngine,
  type UpgradeWorkOrder,
} from '@chrona-engine/engine';

export interface RunUpgradeOptions {
  cwd?: string;
  packageSpec?: string;
  from?: string;
  to?: string;
  json?: boolean;
}

export async function runChronaUpgrade(options: RunUpgradeOptions): Promise<UpgradeWorkOrder | null> {
  const cwd = options.cwd || process.cwd();
  let pkgName = '';
  let fromVer = options.from;
  let toVer = options.to;

  const spec = options.packageSpec || '';

  if (spec.includes('->')) {
    // Format: zod@4.0.0->4.1.0 or zod@4.0.0->zod@4.1.0
    const [left, right] = spec.split('->');
    const leftMatch = left.match(/^([^@]+)(?:@(.+))?$/);
    const rightMatch = right.match(/^(?:([^@]+)@)?(.+)$/);

    if (leftMatch) {
      pkgName = leftMatch[1];
      if (leftMatch[2]) fromVer = leftMatch[2];
    }
    if (rightMatch) {
      if (rightMatch[1]) pkgName = rightMatch[1];
      toVer = rightMatch[2];
    }
  } else if (spec.includes('@')) {
    // Format: zod@4.1.0
    const parts = spec.split('@');
    pkgName = parts[0];
    toVer = parts[1];
  } else if (spec) {
    pkgName = spec;
  }

  if (!pkgName) {
    console.error(picocolors.red('Error: Package name is required. Usage: chrona upgrade <pkg>@<toVersion> or chrona upgrade <pkg>@<from>-><to>'));
    process.exit(1);
  }

  if (!toVer) {
    console.error(picocolors.red('Error: Target version is required. Usage: chrona upgrade zod@4.1.0'));
    process.exit(1);
  }

  try {
    const store = new RealityStore(cwd);
    const registryClient = new RegistryClient();
    const realityResolver = new ExternalRealityResolver(registryClient);
    const engine = new ChronaUpgradeEngine(cwd, store, realityResolver);

    const workOrder = await engine.planUpgrade({
      cwd,
      packageName: pkgName,
      fromVersion: fromVer,
      toVersion: toVer,
    });

    if (options.json) {
      console.log(JSON.stringify(workOrder, null, 2));
    } else {
      console.log(engine.formatScorecard(workOrder));
    }

    return workOrder;
  } catch (err: any) {
    if (options.json) {
      console.log(JSON.stringify({ error: err.message }, null, 2));
    } else {
      console.error(picocolors.red(`\n❌ Upgrade Planning Error: ${err.message}\n`));
    }
    process.exit(1);
  }
}
