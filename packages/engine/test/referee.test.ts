import { describe, expect, it } from 'vitest';
import { FastAstExtractor, resolveObjectKeys } from '../src/referee/oxc-extractor';
import { ContentCache } from '../src/referee/content-cache';
import { auditClaims } from '../src/referee/truth-referee';

describe('Truth Referee & AST Extractor', () => {
  it('extracts exported functions, parameters, return types, and docstrings', () => {
    const extractor = new FastAstExtractor();
    const sourceCode = `
      /**
       * Parse a URL string into structured components.
       * @deprecated Use parseURLV2 instead
       */
      export async function parseURL(input: string, options?: { strict?: boolean }): Promise<URL> {
        return new URL(input);
      }

      export const joinURL = (base: string, path: string): string => {
        return base + path;
      };

      export interface ParseOptions {
        strict?: boolean;
        timeout: number;
      }
    `;

    const symbols = extractor.extract(sourceCode, 'src/url.ts');

    expect(symbols.length).toBe(3);

    // 1. parseURL
    const parseUrlSym = symbols.find((s) => s.name === 'parseURL');
    expect(parseUrlSym).toBeDefined();
    expect(parseUrlSym?.kind).toBe('function');
    expect(parseUrlSym?.isDeprecated).toBe(true);
    expect(parseUrlSym?.returnType).toBe('Promise<URL>');
    expect(parseUrlSym?.parameters.length).toBe(2);
    expect(parseUrlSym?.parameters[0].name).toBe('input');
    expect(parseUrlSym?.parameters[0].type).toBe('string');
    expect(parseUrlSym?.parameters[1].name).toBe('options');
    expect(parseUrlSym?.parameters[1].isOptional).toBe(true);
    expect(parseUrlSym?.span[0]).toBeLessThan(parseUrlSym!.span[1]);

    // 2. joinURL
    const joinUrlSym = symbols.find((s) => s.name === 'joinURL');
    expect(joinUrlSym).toBeDefined();
    expect(joinUrlSym?.kind).toBe('function');
    expect(joinUrlSym?.parameters.length).toBe(2);
    expect(joinUrlSym?.returnType).toBe('string');

    // 3. ParseOptions
    const interfaceSym = symbols.find((s) => s.name === 'ParseOptions');
    expect(interfaceSym).toBeDefined();
    expect(interfaceSym?.kind).toBe('interface');
    expect(interfaceSym?.properties.length).toBe(2);
    expect(interfaceSym?.properties.find((p) => p.name === 'timeout')?.isOptional).toBe(false);
  });

  it('extracts classes, enums, type aliases, rest params, and default exports via oxc', () => {
    const extractor = new FastAstExtractor();
    const sourceCode = `
      export type Opts = { retries?: number; timeout: number };
      export class Client {
        baseUrl: string;
        async fetch(path: string): Promise<string> { return ""; }
      }
      export enum Level { Debug, Info }
      export function joinURL(base: string, ...input: string[]): string { return base; }
      export default function main(): void {}
    `;

    const symbols = extractor.extract(sourceCode, 'src/client.ts');

    const opts = symbols.find((s) => s.name === 'Opts');
    expect(opts?.kind).toBe('type');
    expect(opts?.definition).toBe('{ retries?: number; timeout: number }');
    expect(opts?.properties.map((p) => p.name)).toEqual(['retries', 'timeout']);

    const client = symbols.find((s) => s.name === 'Client');
    expect(client?.kind).toBe('class');
    expect(client?.properties.map((p) => p.name)).toContain('baseUrl');
    expect(client?.properties.find((p) => p.name === 'fetch')?.type).toMatch(/string/);

    const level = symbols.find((s) => s.name === 'Level');
    expect(level?.kind).toBe('enum');
    expect(level?.properties.map((p) => p.name)).toEqual(['Debug', 'Info']);

    const join = symbols.find((s) => s.name === 'joinURL');
    expect(join?.parameters[1].name).toBe('...input');
    expect(join?.parameters[1].type).toBe('string[]');

    const main = symbols.find((s) => s.name === 'main');
    expect(main?.kind).toBe('function');
  });

  it('detects phantom options data-driven via auditClaims (DOC-103)', () => {
    const extractor = new FastAstExtractor();
    const sourceCode = `
      export interface ParseOptions {
        strict?: boolean;
        timeout: number;
      }
      export function parseURL(input: string, options?: ParseOptions): void {}
      export function joinURL(base: string, ...input: string[]): void {}
    `;
    const symbols = new Map<string, ReturnType<FastAstExtractor['extract']>[number]>();
    for (const sym of extractor.extract(sourceCode, 'src/url.ts')) symbols.set(sym.name, sym);

    const mdx = `# API
### \`parseURL(input, options?: { loose: boolean })\`
Calls \`parseURL("foo", { retries: true })\` which is unsupported.

\`\`\`ts
joinURL("/a", { forceQuery: true });
\`\`\`
`;

    const diagnostics = auditClaims('content/docs/api.mdx', mdx, symbols);

    const phantom = diagnostics.filter((d) => d.code === 'DOC-103');
    expect(phantom.length).toBe(3);
    const messages = phantom.map((d) => d.message);
    expect(messages).toContain('Phantom option `{ loose }` not accepted by `parseURL`');
    expect(messages).toContain('Phantom option `{ retries }` not accepted by `parseURL`');
    expect(messages).toContain('Phantom option `{ forceQuery }` not accepted by `joinURL`');
  });

  it('does not flag valid documented options (no false positives)', () => {
    const extractor = new FastAstExtractor();
    const sourceCode = `
      export interface ParseOptions {
        strict?: boolean;
        timeout: number;
      }
      export function parseURL(input: string, options?: ParseOptions): void {}
    `;
    const symbols = new Map<string, ReturnType<FastAstExtractor['extract']>[number]>();
    for (const sym of extractor.extract(sourceCode, 'src/url.ts')) symbols.set(sym.name, sym);

    const mdx = `# API
\`parseURL("/foo", { timeout: 500, strict: true })\`
`;

    const diagnostics = auditClaims('content/docs/api.mdx', mdx, symbols);
    expect(diagnostics.filter((d) => d.code === 'DOC-103')).toHaveLength(0);
  });

  it('detects deprecated symbols used without a notice (DOC-401)', () => {
    const extractor = new FastAstExtractor();
    const sourceCode = `
      /**
       * @deprecated use parseURLV2 instead
       */
      export function legacyParse(input: string): void {}
    `;
    const symbols = new Map<string, ReturnType<FastAstExtractor['extract']>[number]>();
    for (const sym of extractor.extract(sourceCode, 'src/legacy.ts')) symbols.set(sym.name, sym);

    const diagnostics = auditClaims('content/docs/api.mdx', 'Call legacyParse("/foo") here.', symbols);
    const deprecated = diagnostics.filter((d) => d.code === 'DOC-401');
    expect(deprecated.length).toBe(1);
    expect(deprecated[0].severity).toBe('warning');
  });

  it('resolves object keys across named type references', () => {
    const extractor = new FastAstExtractor();
    const sourceCode = `
      export type Base = { host: string };
      export interface Options extends Base { retries: number }
      export function run(opts: Options): void {}
    `;
    const symbols = new Map<string, ReturnType<FastAstExtractor['extract']>[number]>();
    for (const sym of extractor.extract(sourceCode, 'src/run.ts')) symbols.set(sym.name, sym);

    const run = symbols.get('run')!;
    const resolution = resolveObjectKeys(run.parameters[0].type, symbols);
    expect(resolution).toEqual({ kind: 'object', keys: new Set(['retries']) });

    const primitive = resolveObjectKeys('string', symbols);
    expect(primitive).toEqual({ kind: 'non-object' });

    const unknown = resolveObjectKeys('SomeMissingType', symbols);
    expect(unknown).toEqual({ kind: 'unknown' });
  });

  it('computes and matches cryptographic ContentHash in cache', () => {
    const cache = new ContentCache(process.cwd());
    const hash1 = cache.computeHash('export const a = 1;');
    const hash2 = cache.computeHash('export const a = 1;');
    const hash3 = cache.computeHash('export const a = 2;');

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
  });
});
