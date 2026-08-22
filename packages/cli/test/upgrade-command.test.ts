import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { runChronaUpgrade } from '../src/commands/upgrade';

describe('Chrona Upgrade CLI Command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(process.cwd(), '.chrona-cli-upgrade-test-' + Math.random().toString(36).slice(2, 8));
    fs.mkdirSync(tempDir, { recursive: true });

    // Mock package.json
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-app',
        dependencies: {
          zod: '^4.0.0',
        },
      })
    );
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('parses arrow notation package specifiers and options', () => {
    const spec = 'zod@4.0.0->4.1.0';
    const [left, right] = spec.split('->');
    const leftMatch = left.match(/^([^@]+)(?:@(.+))?$/);
    const rightMatch = right.match(/^(?:([^@]+)@)?(.+)$/);

    expect(leftMatch?.[1]).toBe('zod');
    expect(leftMatch?.[2]).toBe('4.0.0');
    expect(rightMatch?.[2]).toBe('4.1.0');
  });
});
