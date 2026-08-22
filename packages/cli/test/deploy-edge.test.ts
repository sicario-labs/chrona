import { describe, expect, it } from 'vitest';
import {
  deployObjectKey,
  assetObjectKey,
  manifestKey,
  contentTypeFor,
  isHashedAssetFile,
  liveUrl,
  permalinkUrl,
  previewUrl,
  TENANT_SUFFIX,
} from '../src/utils/deploy-edge';
import { r2Host } from '../src/utils/r2';

describe('deploy store key layout', () => {
  it('builds immutable deploy snapshot keys', () => {
    expect(deployObjectKey('acme', 'dep_1', 'index.html')).toBe('acme/deploys/dep_1/index.html');
    expect(deployObjectKey('acme', 'dep_1', 'docs/guide.html')).toBe('acme/deploys/dep_1/docs/guide.html');
  });

  it('builds content-hashed shared asset keys', () => {
    expect(assetObjectKey('acme', '9a2e1f7c', 'js')).toBe('acme/assets/9a2e1f7c.js');
  });

  it('writes manifest.json as the ready marker key', () => {
    expect(manifestKey('acme', 'dep_1')).toBe('acme/deploys/dep_1/manifest.json');
  });
});

describe('tenant URLs on chronadocs.xyz', () => {
  it('builds live, permalink, and preview URLs', () => {
    expect(TENANT_SUFFIX).toBe('.chronadocs.xyz');
    expect(liveUrl('acme')).toBe('https://acme.chronadocs.xyz/');
    expect(permalinkUrl('acme', 'dep_1')).toBe('https://dep_1--acme.chronadocs.xyz/');
    expect(previewUrl('acme')).toBe('https://acme.chronadocs.xyz/preview/');
  });
});

describe('content type mapping', () => {
  it('maps known extensions', () => {
    expect(contentTypeFor('index.html')).toContain('text/html');
    expect(contentTypeFor('app.js')).toContain('javascript');
    expect(contentTypeFor('styles.css')).toContain('css');
  });

  it('falls back to octet-stream', () => {
    expect(contentTypeFor('file.unknown')).toBe('application/octet-stream');
  });
});

describe('hashed asset detection', () => {
  it('detects content-hashed filenames', () => {
    expect(isHashedAssetFile('app-9a2e1f7c.js')).toBe(true);
    expect(isHashedAssetFile('index.html')).toBe(false);
  });
});

describe('R2 host', () => {
  it('builds the R2 S3 endpoint host', () => {
    expect(r2Host({ accountId: 'abc', accessKeyId: 'x', secretAccessKey: 'y', bucket: 'chrona-builds' })).toBe(
      'chrona-builds.abc.r2.cloudflarestorage.com'
    );
  });
});