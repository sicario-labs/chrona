import { describe, it, expect } from 'vitest';
import { extractCodeClaims } from '../src/guard/code-claim-detector';

describe('Code Claim Detector', () => {
  it('Extracts function call claim from useStore(store, selector)', () => {
    const code = `const val = useStore(store, selector);`;
    const claims = extractCodeClaims(code, 'test.ts');
    
    expect(claims.length).toBeGreaterThan(0);
    const callClaim = claims.find(c => c.type === 'function-call');
    expect(callClaim).toBeDefined();
    expect(callClaim?.symbol).toBe('useStore');
  });

  it('Extracts import claim from import { createRouter } from "radix3"', () => {
    const code = `import { createRouter } from "radix3";`;
    const claims = extractCodeClaims(code, 'test.ts');
    
    const importClaim = claims.find(c => c.type === 'import');
    expect(importClaim).toBeDefined();
    expect(importClaim?.symbol).toBe('createRouter');
  });

  it('Extracts parameter name claim from function handler(req, res)', () => {
    const code = `function handler(req, res) { }`;
    const claims = extractCodeClaims(code, 'test.ts');
    
    const paramClaims = claims.filter(c => c.type === 'parameter-name');
    expect(paramClaims.length).toBe(2);
    expect(paramClaims[0].impliedAssertion).toContain('"req"');
    expect(paramClaims[1].impliedAssertion).toContain('"res"');
  });

  it('Returns empty array for empty file', () => {
    const claims = extractCodeClaims('', 'test.ts');
    expect(claims.length).toBe(0);
  });
});
