import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runChronaCi } from '../src/commands/ci';
import { generateJunitXml } from '../src/output/junit';
import type { VerificationResult } from '../../engine/src/claim/types';

describe('Chrona CI Command & JUnit Reports', () => {
  const testRepo = path.resolve(__dirname, '../../../test-repos/radix3');
  const rootDir = path.resolve(__dirname, '../../..');
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chrona-ci-test-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('generateJunitXml serializes verification result into valid XML testsuite structure', () => {
    const mockResult: VerificationResult = {
      schemaVersion: 'v1',
      status: 'fail',
      errorsCount: 1,
      warningsCount: 0,
      infoCount: 0,
      claims: [
        {
          claim: {
            id: 'docs/auth.mdx#L42:symbol:createUser',
            type: 'symbol',
            source: { file: 'docs/auth.mdx', line: 42, text: 'createUser(email, password)' },
            subject: 'createUser',
            evidence: [],
            status: 'contradicted',
          },
          status: 'contradicted',
          evidence: [],
          diagnostic: {
            code: 'DOC-102',
            severity: 'error',
            file: 'docs/auth.mdx',
            line: 42,
            message: 'Signature mismatch for createUser',
            claim: 'createUser(email, password)',
            evidence: ['createUser(options: { email: string })'],
            suggestedAction: 'Update createUser arguments in documentation',
          },
        },
      ],
      diagnostics: [
        {
          code: 'DOC-102',
          severity: 'error',
          file: 'docs/auth.mdx',
          line: 42,
          message: 'Signature mismatch for createUser',
          claim: 'createUser(email, password)',
          evidence: ['createUser(options: { email: string })'],
          suggestedAction: 'Update createUser arguments in documentation',
        },
      ],
      summary: {
        claimsVerified: 0,
        contradictionsFound: 1,
        unverifiedCount: 0,
        ambiguousCount: 0,
        verificationTimeMs: 45,
      },
    };

    const xml = generateJunitXml(mockResult);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<testsuites name="Chrona Documentation Compiler" tests="1" failures="1"');
    expect(xml).toContain('<testsuite name="docs/auth.mdx" tests="1" failures="1"');
    expect(xml).toContain('<failure message="[DOC-102] Signature mismatch for createUser" type="DOC-102">');
    expect(xml).toContain('</testsuites>');
  });

  it('runs chrona ci and outputs JUnit XML file to target path', async () => {
    const outputFile = path.join(tempDir, 'junit-report.xml');

    await runChronaCi({
      cwd: testRepo,
      format: 'junit',
      output: outputFile,
    });

    const fileExists = await fs.stat(outputFile).then(() => true).catch(() => false);
    expect(fileExists).toBe(true);

    const content = await fs.readFile(outputFile, 'utf-8');
    expect(content).toContain('<testsuites');
    expect(content).toContain('</testsuites>');
  });

  it('runs chrona ci with github annotations format and sets exit code on errors', async () => {
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((msg) => {
      logs.push(String(msg));
    });

    await runChronaCi({
      cwd: testRepo,
      format: 'github',
    });

    logSpy.mockRestore();

    const output = logs.join('\n');
    expect(output).toContain('CHRONA ⚡ Documentation CI Gate');
    // Test repo contains deliberate documentation contradictions, so CI exit code is 1
    expect(process.exitCode).toBe(1);
  });

  it('runs chrona ci on clean repository and passes with exit code 0', async () => {
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((msg) => {
      logs.push(String(msg));
    });

    await runChronaCi({
      cwd: rootDir,
      format: 'pretty',
    });

    logSpy.mockRestore();

    expect(process.exitCode).toBe(0);
  });
});
