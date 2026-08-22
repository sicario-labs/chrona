import { describe, expect, it } from 'vitest';
import { IgnoreMatcher, packTarGz, extractTarGz, parseIgnoreFile } from '../src/utils/source-bundle';

describe('IgnoreMatcher', () => {
  it('ignores basename patterns at any level', () => {
    const m = new IgnoreMatcher();
    m.addFile(['node_modules']);
    expect(m.isIgnored('node_modules', true)).toBe(true);
    expect(m.isIgnored('apps/docs/node_modules', true)).toBe(true);
    expect(m.isIgnored('src/main.ts')).toBe(false);
  });

  it('respects anchored and slash patterns', () => {
    const m = new IgnoreMatcher();
    m.addFile(['/dist', 'build/output/']);
    expect(m.isIgnored('dist', true)).toBe(true);
    expect(m.isIgnored('nested/dist', true)).toBe(false);
    expect(m.isIgnored('build/output', true)).toBe(true);
    expect(m.isIgnored('build/input', true)).toBe(false);
  });

  it('handles glob wildcards', () => {
    const m = new IgnoreMatcher();
    m.addFile(['*.log', '**/.env']);
    expect(m.isIgnored('error.log')).toBe(true);
    expect(m.isIgnored('a/b/error.log')).toBe(true);
    expect(m.isIgnored('a/.env')).toBe(true);
    expect(m.isIgnored('src/app.ts')).toBe(false);
  });

  it('supports negation', () => {
    const m = new IgnoreMatcher();
    m.addFile(['*.log', '!keep.log']);
    expect(m.isIgnored('error.log')).toBe(true);
    expect(m.isIgnored('keep.log')).toBe(false);
  });

  it('parses comments and blank lines', () => {
    const m = parseIgnoreFile('# comment\n\nnode_modules\n');
    expect(m.isIgnored('node_modules', true)).toBe(true);
  });
});

describe('tar.gz round-trip', () => {
  it('packs and extracts files losslessly', () => {
    const files = [
      { path: 'index.html', content: Buffer.from('<h1>hi</h1>') },
      { path: 'docs/guide.md', content: Buffer.from('# Guide\n\nbody') },
      { path: 'assets/app.js', content: Buffer.from('console.log("x")') },
    ];
    const tar = packTarGz(files);
    const extracted = extractTarGz(tar);
    expect(extracted.size).toBe(3);
    expect(extracted.get('index.html')?.toString()).toBe('<h1>hi</h1>');
    expect(extracted.get('docs/guide.md')?.toString()).toBe('# Guide\n\nbody');
    expect(extracted.get('assets/app.js')?.toString()).toBe('console.log("x")');
  });

  it('handles long paths (>100 chars) via USTAR prefix', () => {
    const longPath = `${'docs/'.repeat(20)}final-page.md`;
    expect(longPath.length).toBeGreaterThan(100);
    const tar = packTarGz([{ path: longPath, content: Buffer.from('x') }]);
    const extracted = extractTarGz(tar);
    expect(extracted.get(longPath)?.toString()).toBe('x');
  });
});