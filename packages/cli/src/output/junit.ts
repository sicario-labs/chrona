import type { VerificationResult, ClaimResult } from '../../../engine/src/claim/types';

/**
 * Generate standard JUnit XML format for CI systems (GitLab, CircleCI, Azure Pipelines, Jenkins)
 */
export function generateJunitXml(result: VerificationResult): string {
  const fileMap = new Map<string, ClaimResult[]>();
  for (const cr of result.claims) {
    const file = cr.claim.source.file;
    if (!fileMap.has(file)) fileMap.set(file, []);
    fileMap.get(file)!.push(cr);
  }

  const durationSec = (result.summary.verificationTimeMs / 1000).toFixed(3);
  const totalTests = Math.max(result.claims.length, 1);
  const totalFailures = result.errorsCount;

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<testsuites name="Chrona Documentation Compiler" tests="${totalTests}" failures="${totalFailures}" time="${durationSec}">\n`;

  if (fileMap.size === 0) {
    xml += `  <testsuite name="workspace" tests="1" failures="0" errors="0" time="0.000">\n`;
    xml += `    <testcase name="no_claims" classname="workspace" time="0.000"/>\n`;
    xml += `  </testsuite>\n`;
  } else {
    for (const [file, claims] of fileMap.entries()) {
      const suiteErrors = claims.filter((c) => c.status === 'contradicted' && c.diagnostic?.severity === 'error').length;
      const suiteTests = claims.length;

      xml += `  <testsuite name="${escapeXml(file)}" tests="${suiteTests}" failures="${suiteErrors}" errors="0" time="0.001">\n`;

      for (const cr of claims) {
        const testName = escapeXml(`${cr.claim.type}:${cr.claim.subject} (L${cr.claim.source.line})`);
        const className = escapeXml(file);

        if (cr.status === 'contradicted' && cr.diagnostic) {
          const diag = cr.diagnostic;
          const msg = escapeXml(`[${diag.code}] ${diag.message}`);
          const details = escapeXml(
            [
              `File: ${diag.file}:${diag.line}`,
              `Claim: ${diag.claim || ''}`,
              `Evidence:\n${(diag.evidence || []).map((e) => `  • ${e}`).join('\n')}`,
              `Suggested Action: ${diag.suggestedAction || ''}`,
            ].join('\n')
          );

          xml += `    <testcase name="${testName}" classname="${className}" time="0.001">\n`;
          xml += `      <failure message="${msg}" type="${escapeXml(diag.code)}">${details}</failure>\n`;
          xml += `    </testcase>\n`;
        } else {
          xml += `    <testcase name="${testName}" classname="${className}" time="0.001"/>\n`;
        }
      }

      xml += `  </testsuite>\n`;
    }
  }

  xml += `</testsuites>\n`;
  return xml;
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
