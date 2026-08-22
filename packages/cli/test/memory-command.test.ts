import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { x } from 'tinyexec';
import * as path from 'path';
import * as fs from 'fs';

describe('Memory CLI Command', () => {
  const cliPath = path.resolve(__dirname, '../dist/index.js');
  const targetDir = path.resolve(__dirname, '../../engine/test/fixtures/test-repo');
  const memoryDir = path.join(targetDir, '.chrona');
  const memoryFile = path.join(memoryDir, 'memory.json');

  beforeAll(() => {
    if (!fs.existsSync(memoryDir)) fs.mkdirSync(memoryDir, { recursive: true });
    const mockMemory = {
      version: 1,
      projectName: 'test',
      createdAt: new Date().toISOString(),
      snapshots: [{ summary: {} }],
      symbols: {
        'createRouter': {
          symbol: 'createRouter',
          file: 'src/index.ts',
          currentSignature: 'createRouter()',
          history: [],
          driftEvents: [{
            claimFile: 'docs/api.md',
            claimLine: 1,
            code: 'DOC-102',
            detectedAt: new Date().toISOString()
          }]
        }
      }
    };
    fs.writeFileSync(memoryFile, JSON.stringify(mockMemory));
  });

  afterAll(() => {
    if (fs.existsSync(memoryFile)) fs.unlinkSync(memoryFile);
  });

  it('runs chrona memory --json and returns valid JSON', async () => {
    const result = await x('node', [cliPath, 'memory', '--json', '--cwd', targetDir]);
    expect(result.exitCode).toBe(0);
    
    const parsed = JSON.parse(result.stdout);
    expect(parsed.version).toBe(1);
    expect(parsed.snapshots.length).toBeGreaterThan(0);
  });

  it('runs chrona memory <symbol> and outputs timeline', async () => {
    const result = await x('node', [cliPath, 'memory', 'createRouter', '--cwd', targetDir]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Timeline: createRouter');
    expect(result.stdout).toContain('Current Signature:');
  });

  it('runs chrona memory --drift-report and outputs metrics', async () => {
    const result = await x('node', [cliPath, 'memory', '--drift-report', '--cwd', targetDir]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Chrona Drift Report');
    expect(result.stdout).toContain('Total Drift Events:');
  });
});
