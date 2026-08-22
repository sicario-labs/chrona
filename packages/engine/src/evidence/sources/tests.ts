import fs from 'node:fs/promises';
import path from 'node:path';

export interface TestEvidence {
  hasTest: boolean;
  testFile?: string;
  testName?: string;
  line?: number;
  description?: string;
}

export class TestEvidenceResolver {
  private cwd: string;
  private testMap: Map<string, { file: string; line: number; testName: string }[]> = new Map();
  private initialized = false;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    const testDirs = [
      path.join(this.cwd, 'test'),
      path.join(this.cwd, 'tests'),
      path.join(this.cwd, '__tests__'),
      path.join(this.cwd, 'src'),
    ];

    for (const dir of testDirs) {
      await this.scanDir(dir);
    }
  }

  private async scanDir(dir: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.git') {
            await this.scanDir(full);
          }
        } else if (/\.(test|spec)\.[jt]sx?$/.test(entry.name)) {
          await this.indexTestFile(full);
        }
      }
    } catch {
      // Directory doesn't exist
    }
  }

  private async indexTestFile(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      const relPath = path.relative(this.cwd, filePath).replace(/\\/g, '/');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(/(?:it|test)\s*\(\s*['"`](.*?)['"`]/);
        if (match) {
          const testName = match[1];
          // Extract potential symbol references in test name
          const words = testName.split(/\s+/).map((w) => w.replace(/[^A-Za-z0-9_$]/g, ''));
          for (const w of words) {
            if (w.length > 2) {
              if (!this.testMap.has(w)) {
                this.testMap.set(w, []);
              }
              this.testMap.get(w)!.push({ file: relPath, line: i + 1, testName });
            }
          }
        }
      }
    } catch {
      // Ignore read errors
    }
  }

  async resolveTestEvidence(symbolOrSubject: string): Promise<TestEvidence | null> {
    await this.init();

    const matches = this.testMap.get(symbolOrSubject);
    if (matches && matches.length > 0) {
      const top = matches[0];
      return {
        hasTest: true,
        testFile: top.file,
        testName: top.testName,
        line: top.line,
        description: `Covered by test suite "${top.testName}" in ${top.file}:${top.line}`,
      };
    }

    return null;
  }
}
