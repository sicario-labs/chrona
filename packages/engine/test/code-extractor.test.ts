import { describe, it, expect } from 'vitest';
import { CodeClaimExtractor } from '../src/claim/code-extractor';

describe('Code Claim Extractor', () => {
  const extractor = new CodeClaimExtractor();

  it('Extracts signature claim from export function createRouter()', () => {
    const claims = extractor.extractClaims('export function createRouter(options) {}', 'test.ts');
    const sig = claims.find(c => c.type === 'signature');
    expect(sig).toBeDefined();
    expect(sig?.subject).toBe('createRouter');
  });

  it('Extracts parameter claims with types', () => {
    const claims = extractor.extractClaims('export function createRouter(options: any) {}', 'test.ts');
    const param = claims.find(c => c.type === 'parameter');
    expect(param).toBeDefined();
    expect(param?.subject).toBe('createRouter');
    expect(param?.source.text).toContain('options');
  });

  it('Extracts throw claim', () => {
    const code = `
      function validate() {
        throw new TypeError("bad");
      }
    `;
    const claims = extractor.extractClaims(code, 'test.ts');
    const err = claims.find(c => c.type === 'exception');
    expect(err).toBeDefined();
    expect(err?.subject).toBe('validate');
    expect(err?.metadata?.errorType).toBe('TypeError');
  });

  it('Extracts import dependency claim', () => {
    const claims = extractor.extractClaims('import { createRouter } from "radix3";', 'test.ts');
    const dep = claims.find(c => c.type === 'dependency');
    expect(dep).toBeDefined();
    expect(dep?.subject).toBe('createRouter');
  });

  it('Handles empty file gracefully', () => {
    const claims = extractor.extractClaims('', 'test.ts');
    expect(claims.length).toBe(0);
  });
});
