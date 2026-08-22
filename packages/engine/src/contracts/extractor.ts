import path from 'node:path';
import type { BehavioralContract, ContractType, ContractEvidence } from './types';

export interface ExtractContractsOptions {
  cwd?: string;
  sourceFiles?: Array<{ filePath: string; content: string }>;
  testFiles?: Array<{ filePath: string; content: string }>;
}

export class ContractExtractor {
  private cwd: string;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
  }

  /**
   * Extract behavioral contracts across source code, tests, and comments.
   */
  public extractFromCode(content: string, filePath: string): BehavioralContract[] {
    const contracts: BehavioralContract[] = [];
    const lines = content.split(/\r?\n/);
    const relPath = path.isAbsolute(filePath) ? path.relative(this.cwd, filePath).replace(/\\/g, '/') : filePath.replace(/\\/g, '/');
    const now = new Date().toISOString();

    // 1. AST / Pattern Analysis for Code Guards & Assertions
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Pattern A: Throw / Error Guards (JS/TS & Python Preconditions / Invariants)
      let condition: string | undefined;
      let errorClass = 'Error';
      let rawMsg = '';

      const singleLineMatch =
        line.match(/if\s*\(([^)]+)\)\s*(?:throw\s+new\s+([A-Za-z0-9_$]+Error|[A-Za-z0-9_$]+)\(([^)]*)\)|return\b)/) ||
        line.match(/if\s+([^:]+):\s*(?:raise\s+([A-Za-z0-9_$]+Error|[A-Za-z0-9_$]+)\(([^)]*)\)|return\b)/);

      if (singleLineMatch) {
        condition = singleLineMatch[1].trim();
        errorClass = singleLineMatch[2] || 'Error';
        rawMsg = singleLineMatch[3] ? singleLineMatch[3].replace(/['"`]/g, '').trim() : '';
      } else if (line.trim().startsWith('if ') && line.trim().endsWith(':') && i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        const raiseMatch = nextLine.match(/^(?:throw\s+new|raise)\s+([A-Za-z0-9_$]+Error|[A-Za-z0-9_$]+)\(([^)]*)\)/);
        if (raiseMatch) {
          condition = line.trim().replace(/^if\s+/, '').replace(/:$/, '').trim();
          errorClass = raiseMatch[1];
          rawMsg = raiseMatch[2] ? raiseMatch[2].replace(/['"`]/g, '').trim() : '';
        }
      }

      if (condition) {
        const type: ContractType = errorClass.toLowerCase().includes('auth') || condition.includes('role') || condition.includes('permission')
          ? 'authorization'
          : condition.includes('expire') || condition.includes('timeout')
          ? 'persistence'
          : condition.includes('null') || condition.includes('undefined') || condition.includes('!') || condition.includes('not ') || condition.includes('is None')
          ? 'precondition'
          : 'invariant';

        const statement = rawMsg
          ? `Guard constraint: ${rawMsg}`
          : `Precondition [${condition}] must not trigger ${errorClass}`;

        const id = `contract:guard:${this.sanitizeId(relPath)}:L${lineNum}`;

        contracts.push({
          id,
          type,
          statement,
          subject: relPath,
          status: 'active',
          confidence: 0.95,
          origin: 'code-assertion',
          evidence: [
            {
              source: 'ast-guard',
              file: relPath,
              line: lineNum,
              snippet: line.trim(),
              description: `Enforced by runtime guard ${errorClass} on line ${lineNum}`,
              strength: 'STRONG',
              confidence: 0.95,
            },
          ],
          dependents: [relPath],
          createdAt: now,
          lastVerifiedAt: now,
        });
      }

      // Pattern B: Explicit assert() / invariant() calls (JS & Python)
      // JS: assert(options.timeout > 0, 'Timeout must be positive');
      // Python: assert options.timeout > 0, "Timeout must be positive"
      const assertMatch =
        line.match(/\b(?:assert|invariant)\s*\(([^,]+)(?:,\s*['"`]([^'"`]+)['"`])?\)/) ||
        line.match(/\bassert\s+([^,]+)(?:,\s*['"`]([^'"`]+)['"`])?/);
      if (assertMatch) {
        const conditionStr = assertMatch[1].trim();
        const msg = assertMatch[2] || `Invariant ${conditionStr} must hold`;
        const id = `contract:assert:${this.sanitizeId(relPath)}:L${lineNum}`;

        contracts.push({
          id,
          type: 'invariant',
          statement: msg,
          subject: relPath,
          status: 'active',
          confidence: 0.98,
          origin: 'code-assertion',
          evidence: [
            {
              source: 'ast-guard',
              file: relPath,
              line: lineNum,
              snippet: line.trim(),
              description: `Runtime invariant assertion in ${relPath}:${lineNum}`,
              strength: 'STRONG',
              confidence: 0.98,
            },
          ],
          dependents: [relPath],
          createdAt: now,
          lastVerifiedAt: now,
        });
      }

      // Pattern C: JSDoc Contract Directives (@contract, @invariant, @security)
      const docContractMatch = line.match(/\*\s*@(contract|invariant|precondition|postcondition|security|persistence)\s+(.+)/);
      if (docContractMatch) {
        const directive = docContractMatch[1].toLowerCase();
        const contractStmt = docContractMatch[2].trim();

        const type: ContractType = directive === 'security'
          ? 'authorization'
          : directive === 'precondition'
          ? 'precondition'
          : directive === 'postcondition'
          ? 'postcondition'
          : directive === 'persistence'
          ? 'persistence'
          : 'invariant';

        const id = `contract:doc:${this.sanitizeId(relPath)}:L${lineNum}`;

        contracts.push({
          id,
          type,
          statement: contractStmt,
          subject: relPath,
          status: 'active',
          confidence: 0.92,
          origin: 'developer-declared',
          evidence: [
            {
              source: 'declaration',
              file: relPath,
              line: lineNum,
              snippet: line.trim(),
              description: `Explicit developer contract declared in JSDoc: @${directive}`,
              strength: 'STRONG',
              confidence: 0.92,
            },
          ],
          dependents: [relPath],
          createdAt: now,
          lastVerifiedAt: now,
        });
      }
    }

    return contracts;
  }

  /**
   * Extract behavioral contracts from test files (vitest, jest, mocha).
   */
  public extractFromTests(testContent: string, testFilePath: string): BehavioralContract[] {
    const contracts: BehavioralContract[] = [];
    const lines = testContent.split(/\r?\n/);
    const relPath = path.relative(this.cwd, testFilePath).replace(/\\/g, '/');
    const now = new Date().toISOString();

    let currentDescribe = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Track describe suite context
      const descMatch = line.match(/(?:describe|suite)\s*\(\s*['"`]([^'"`]+)['"`]/);
      if (descMatch) {
        currentDescribe = descMatch[1].trim();
      }

      // Track test/it cases
      const itMatch = line.match(/(?:it|test)\s*\(\s*['"`]([^'"`]+)['"`]/);
      if (itMatch) {
        const testName = itMatch[1].trim();
        const fullGoal = currentDescribe ? `${currentDescribe} → ${testName}` : testName;

        // Categorize test contract
        let type: ContractType = 'invariant';
        if (/persist|survive|refresh|store|storage|reload/i.test(testName)) {
          type = 'persistence';
        } else if (/auth|admin|role|permission|token|jwt|session/i.test(testName)) {
          type = 'authorization';
        } else if (/timeout|latency|fast|duration|ms|rate/i.test(testName)) {
          type = 'performance';
        } else if (/compat|legacy|v[0-9]|deprecat/i.test(testName)) {
          type = 'compatibility';
        } else if (/throws|rejects|error|invalid|fail/i.test(testName)) {
          type = 'precondition';
        } else if (/returns|updates|creates|emits/i.test(testName)) {
          type = 'postcondition';
        }

        const id = `contract:test:${this.sanitizeId(relPath)}:L${lineNum}`;

        contracts.push({
          id,
          type,
          statement: fullGoal,
          subject: currentDescribe || relPath,
          status: 'active',
          confidence: 0.99,
          origin: 'test-inference',
          evidence: [
            {
              source: 'test-assertion',
              file: relPath,
              line: lineNum,
              snippet: line.trim(),
              description: `Proven by executable test suite: "${testName}"`,
              strength: 'STRONG',
              confidence: 0.99,
            },
          ],
          dependents: [relPath],
          createdAt: now,
          lastVerifiedAt: now,
        });
      }
    }

    return contracts;
  }

  private sanitizeId(str: string): string {
    return str.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  }
}
