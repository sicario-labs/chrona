import { describe, it, expect } from 'vitest';
import { FalsePositiveTracker } from '../src/metrics/false-positive-tracker';
import type { CompilerDiagnostic } from '../src/compiler-types';

describe('FalsePositiveTracker & Telemetry Metrics', () => {
  it('parses inline HTML and JS suppression directives accurately', () => {
    const tracker = new FalsePositiveTracker();
    const content = [
      '# My Docs',
      '<!-- chrona-ignore DOC-101 (legacy SDK) -->',
      'import { oldApi } from "pkg";',
      '',
      '// @chrona-ignore DOC-102, DOC-103',
      'oldApi(1, 2);',
    ].join('\n');

    const directives = tracker.parseDirectives(content, 'docs/api.mdx');
    expect(directives).toHaveLength(3);
    expect(directives[0].ruleId).toBe('DOC-101');
    expect(directives[0].reason).toBe('legacy SDK');
    expect(directives[1].ruleId).toBe('DOC-102');
    expect(directives[2].ruleId).toBe('DOC-103');
  });

  it('filters suppressed diagnostics and computes accurate false positive rate and precision', () => {
    const tracker = new FalsePositiveTracker();
    const diags: CompilerDiagnostic[] = [
      {
        code: 'DOC-101',
        severity: 'error',
        message: 'Symbol not found',
        file: 'docs/api.mdx',
        line: 3,
        claim: 'oldApi',
      },
      {
        code: 'DOC-102',
        severity: 'error',
        message: 'Signature mismatch',
        file: 'docs/api.mdx',
        line: 10,
        claim: 'newApi()',
      },
    ];

    const directives = [
      {
        ruleId: 'DOC-101',
        file: 'docs/api.mdx',
        line: 2, // 1 line before line 3
      },
    ];

    const { active, suppressed } = tracker.filterSuppressedDiagnostics(diags, directives);

    expect(active).toHaveLength(1);
    expect(active[0].code).toBe('DOC-102');
    expect(suppressed).toHaveLength(1);
    expect(suppressed[0].code).toBe('DOC-101');

    const summary = tracker.getSummary();
    expect(summary.totalDiagnosticsEmitted).toBe(1);
    expect(summary.totalSuppressed).toBe(1);
    expect(summary.falsePositiveRate).toBe(0.5);
    expect(summary.precision).toBe(0.5);
  });
});
