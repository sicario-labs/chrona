import path from 'node:path';
import picocolors from 'picocolors';
import { DocumentationVerifier } from '@chrona-engine/engine';

export interface AuditTarget {
  name: string;
  archetype: string;
  cwd: string;
  docsDir?: string;
}

export interface AuditResult {
  name: string;
  archetype: string;
  claimsDetected: number;
  claimsVerified: number;
  contradictionsFound: number;
  unverifiedCount: number;
  durationMs: number;
  precision: number;
  status: 'pass' | 'warn' | 'fail';
}

/**
 * Execute real-world verification audits across multiple repositories
 */
export async function runChronaAudit(options: { targets?: AuditTarget[]; json?: boolean } = {}): Promise<AuditResult[]> {
  const defaultTargets: AuditTarget[] = [
    {
      name: 'radix3',
      archetype: 'Open Source Library',
      cwd: path.resolve(process.cwd(), 'test-repos/radix3'),
    },
    {
      name: 'typed-sdk',
      archetype: 'Developer API / SDK',
      cwd: path.resolve(process.cwd(), 'test-repos/typed-sdk'),
    },
    {
      name: 'agent-monorepo',
      archetype: 'Agent-Heavy Codebase',
      cwd: path.resolve(process.cwd(), 'test-repos/agent-monorepo'),
    },
    {
      name: 'cli-tool',
      archetype: 'Developer CLI',
      cwd: path.resolve(process.cwd(), 'test-repos/cli-tool'),
    },
    {
      name: 'rest-api',
      archetype: 'REST API Backend',
      cwd: path.resolve(process.cwd(), 'test-repos/rest-api'),
    },
    {
      name: 'state-store',
      archetype: 'Frontend State Store',
      cwd: path.resolve(process.cwd(), 'test-repos/state-store'),
    },
    {
      name: 'orm-database',
      archetype: 'Database ORM',
      cwd: path.resolve(process.cwd(), 'test-repos/orm-database'),
    },
    {
      name: 'auth-provider',
      archetype: 'OAuth / Identity Provider',
      cwd: path.resolve(process.cwd(), 'test-repos/auth-provider'),
    },
    {
      name: 'infra-iac',
      archetype: 'Infrastructure & IaC',
      cwd: path.resolve(process.cwd(), 'test-repos/infra-iac'),
    },
    {
      name: 'ai-agent-harness',
      archetype: 'AI Agent Execution Harness',
      cwd: path.resolve(process.cwd(), 'test-repos/ai-agent-harness'),
    },
  ];

  const targets = options.targets || defaultTargets;
  const results: AuditResult[] = [];

  for (const target of targets) {
    const verifier = new DocumentationVerifier({
      cwd: target.cwd,
      docsDir: target.docsDir,
    });

    const startTime = performance.now();
    const verification = await verifier.verifyWorkspace();
    const durationMs = Math.round(performance.now() - startTime);

    const totalObserved = verification.summary.claimsVerified + verification.summary.contradictionsFound;
    const precision = totalObserved > 0 ? verification.summary.claimsVerified / totalObserved : 1.0;

    results.push({
      name: target.name,
      archetype: target.archetype,
      claimsDetected: verification.claims.length,
      claimsVerified: verification.summary.claimsVerified,
      contradictionsFound: verification.summary.contradictionsFound,
      unverifiedCount: verification.summary.unverifiedCount,
      durationMs,
      precision: Number(precision.toFixed(4)),
      status: verification.status,
    });
  }

  if (options.json) {
    console.log(JSON.stringify({ schemaVersion: 'v1', auditDate: new Date().toISOString(), results }, null, 2));
    return results;
  }

  console.log(picocolors.bold(picocolors.cyan('\n=== Chrona Reality Audit Matrix (Sprint 9) ===\n')));

  for (const res of results) {
    const statusColor =
      res.status === 'pass' ? picocolors.green('PASS') : res.status === 'warn' ? picocolors.yellow('WARN') : picocolors.red('FAIL');

    console.log(
      `  • ${picocolors.bold(res.name)} (${picocolors.dim(res.archetype)}) → [${statusColor}] in ${res.durationMs}ms`
    );
    console.log(
      `    Claims: ${res.claimsDetected} total │ Verified: ${picocolors.green(res.claimsVerified)} │ Contradictions: ${res.contradictionsFound > 0 ? picocolors.red(res.contradictionsFound) : picocolors.dim('0')} │ Precision: ${picocolors.cyan((res.precision * 100).toFixed(1) + '%')}`
    );
  }

  const avgPrecision =
    results.length > 0
      ? (results.reduce((acc, r) => acc + r.precision, 0) / results.length) * 100
      : 100;

  console.log(picocolors.bold(picocolors.green(`\n✓ Aggregate Audit Precision: ${avgPrecision.toFixed(1)}%\n`)));

  return results;
}
