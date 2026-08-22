import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DeclarationResolver } from '../src/evidence/sources/declaration';
import * as fs from 'fs';
import * as path from 'path';

describe('DeclarationResolver', () => {
  const cwd = path.resolve(__dirname, './fixtures/temp-workspace');
  const nodeModules = path.join(cwd, 'node_modules');

  beforeEach(() => {
    fs.mkdirSync(path.join(nodeModules, 'mock-pkg'), { recursive: true });
    fs.mkdirSync(path.join(nodeModules, '@types', 'mock-types'), { recursive: true });

    // Mock direct types
    fs.writeFileSync(path.join(nodeModules, 'mock-pkg', 'package.json'), JSON.stringify({
      name: 'mock-pkg',
      types: 'dist/index.d.ts'
    }));
    fs.mkdirSync(path.join(nodeModules, 'mock-pkg', 'dist'), { recursive: true });
    fs.writeFileSync(path.join(nodeModules, 'mock-pkg', 'dist', 'index.d.ts'), `
      export function useMock(options?: { name: string }): void;
      export class MockClass { constructor(); }
      export interface MockConfig { url: string; }
      export type MockType = string | number;
      export const mockValue: string;
    `);

    // Mock @types
    fs.writeFileSync(path.join(nodeModules, '@types', 'mock-types', 'index.d.ts'), `
      export function getType(id: number): string;
    `);
  });

  afterEach(() => {
    if (fs.existsSync(cwd)) fs.rmdirSync(cwd, { recursive: true });
  });

  it('Resolves function declaration from explicit types field', () => {
    const resolver = new DeclarationResolver(cwd);
    const ev = resolver.resolve('mock-pkg', 'useMock');
    expect(ev).not.toBeNull();
    expect(ev?.exportKind).toBe('function');
    expect(ev?.parameters?.length).toBe(1);
    expect(ev?.parameters?.[0].name).toBe('options');
    expect(ev?.parameters?.[0].optional).toBe(true);
    expect(ev?.returnType).toBe('void');
  });

  it('Resolves class, interface, and type declarations', () => {
    const resolver = new DeclarationResolver(cwd);
    
    expect(resolver.resolve('mock-pkg', 'MockClass')?.exportKind).toBe('class');
    expect(resolver.resolve('mock-pkg', 'MockConfig')?.exportKind).toBe('interface');
    expect(resolver.resolve('mock-pkg', 'MockType')?.exportKind).toBe('type');
    expect(resolver.resolve('mock-pkg', 'mockValue')?.exportKind).toBe('const');
  });

  it('Resolves from @types/ package', () => {
    const resolver = new DeclarationResolver(cwd);
    const ev = resolver.resolve('mock-types', 'getType');
    expect(ev).not.toBeNull();
    expect(ev?.exportKind).toBe('function');
    expect(ev?.parameters?.[0].name).toBe('id');
  });

  it('Returns null for unknown package or symbol', () => {
    const resolver = new DeclarationResolver(cwd);
    expect(resolver.resolve('unknown-pkg', 'test')).toBeNull();
    expect(resolver.resolve('mock-pkg', 'unknownSymbol')).toBeNull();
  });
});
