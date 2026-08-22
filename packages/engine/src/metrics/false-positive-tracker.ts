import type { CompilerDiagnostic } from '../compiler-types';

export interface SuppressionDirective {
  ruleId: string;
  file: string;
  line: number;
  reason?: string;
  author?: string;
}

export interface MetricSummary {
  totalDiagnosticsEmitted: number;
  totalSuppressed: number;
  falsePositiveRate: number; // 0.0 - 1.0 (target: < 0.05)
  precision: number; // 0.0 - 1.0 (target: > 0.95)
  suppressionsByRule: Record<string, number>;
  diagnosticsByRule: Record<string, number>;
}

/**
 * FalsePositiveTracker
 *
 * Tracks developer suppressions, inline ignore pragmas (e.g. <!-- chrona-ignore DOC-101 -->),
 * and computes rule precision, recall, and false-positive rates to ensure high verification fidelity.
 */
export class FalsePositiveTracker {
  private suppressions: SuppressionDirective[] = [];
  private diagnosticCounts: Map<string, number> = new Map();
  private suppressionCounts: Map<string, number> = new Map();

  /**
   * Register an emitted diagnostic during compilation
   */
  recordDiagnostic(diag: CompilerDiagnostic): void {
    const count = this.diagnosticCounts.get(diag.code) || 0;
    this.diagnosticCounts.set(diag.code, count + 1);
  }

  /**
   * Register a user suppression directive (inline comment or config exclusion)
   */
  recordSuppression(directive: SuppressionDirective): void {
    this.suppressions.push(directive);
    const count = this.suppressionCounts.get(directive.ruleId) || 0;
    this.suppressionCounts.set(directive.ruleId, count + 1);
  }

  /**
   * Filter diagnostics by active suppressions
   */
  filterSuppressedDiagnostics(
    diagnostics: CompilerDiagnostic[],
    directives: SuppressionDirective[]
  ): { active: CompilerDiagnostic[]; suppressed: CompilerDiagnostic[] } {
    const active: CompilerDiagnostic[] = [];
    const suppressed: CompilerDiagnostic[] = [];

    for (const diag of diagnostics) {
      const isIgnored = directives.some(
        (dir) =>
          dir.file === diag.file &&
          (dir.ruleId === diag.code || dir.ruleId === 'ALL') &&
          diag.line !== undefined &&
          diag.line >= dir.line &&
          diag.line <= dir.line + 8
      );

      if (isIgnored) {
        this.recordSuppression({
          ruleId: diag.code,
          file: diag.file,
          line: diag.line || 1,
        });
        suppressed.push(diag);
      } else {
        this.recordDiagnostic(diag);
        active.push(diag);
      }
    }

    return { active, suppressed };
  }

  /**
   * Parse inline suppression directives from file content
   *
   * Formats supported:
   * <!-- chrona-ignore -->
   * <!-- chrona-ignore DOC-101 -->
   * <!-- @chrona-ignore DOC-101 (reason: dynamic export) -->
   * // @chrona-ignore DOC-102
   */
  parseDirectives(content: string, filePath: string): SuppressionDirective[] {
    const directives: SuppressionDirective[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // HTML comment pragma: <!-- chrona-ignore --> or <!-- chrona-ignore DOC-101 -->
      const htmlMatch = line.match(/<!--\s*@?chrona-ignore(?:\s+([A-Z0-9-, *]+))?(?:\s*\((.*?)\))?\s*-->/i);
      if (htmlMatch) {
        const rawRules = htmlMatch[1]?.trim();
        const rules = rawRules ? rawRules.split(/[,\s]+/).map((r) => r.trim()).filter(Boolean) : ['ALL'];
        const reason = htmlMatch[2]?.trim();
        for (const ruleId of rules) {
          directives.push({
            ruleId: ruleId.toUpperCase(),
            file: filePath,
            line: lineNum,
            reason,
          });
        }
        continue;
      }

      // JS/TS line comment pragma: // @chrona-ignore DOC-101
      const jsMatch = line.match(/\/\/\s*@?chrona-ignore\s+([A-Z0-9-, *]+)(?:\s*\((.*?)\))?/i);
      if (jsMatch) {
        const rules = jsMatch[1].split(/[,\s]+/).map((r) => r.trim()).filter(Boolean);
        const reason = jsMatch[2]?.trim();
        for (const ruleId of rules) {
          directives.push({
            ruleId: ruleId.toUpperCase(),
            file: filePath,
            line: lineNum,
            reason,
          });
        }
      }
    }

    return directives;
  }

  /**
   * Compute aggregate metrics and rule fidelity score
   */
  getSummary(): MetricSummary {
    let totalEmitted = 0;
    let totalSuppressed = 0;

    const diagnosticsByRule: Record<string, number> = {};
    const suppressionsByRule: Record<string, number> = {};

    for (const [code, count] of this.diagnosticCounts.entries()) {
      diagnosticsByRule[code] = count;
      totalEmitted += count;
    }

    for (const [code, count] of this.suppressionCounts.entries()) {
      suppressionsByRule[code] = count;
      totalSuppressed += count;
    }

    const totalObserved = totalEmitted + totalSuppressed;
    const falsePositiveRate = totalObserved > 0 ? totalSuppressed / totalObserved : 0;
    const precision = totalObserved > 0 ? totalEmitted / totalObserved : 1.0;

    return {
      totalDiagnosticsEmitted: totalEmitted,
      totalSuppressed,
      falsePositiveRate: Number(falsePositiveRate.toFixed(4)),
      precision: Number(precision.toFixed(4)),
      suppressionsByRule,
      diagnosticsByRule,
    };
  }

  /**
   * Clear all recorded metrics
   */
  reset(): void {
    this.suppressions = [];
    this.diagnosticCounts.clear();
    this.suppressionCounts.clear();
  }
}
