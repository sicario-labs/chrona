import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryStore } from '../src/memory/store';
import * as fs from 'fs';
import * as path from 'path';

describe('Memory Store', () => {
  const cwd = path.resolve(__dirname, './fixtures/temp-workspace');
  const memoryDir = path.join(cwd, '.chrona');
  const memoryFile = path.join(memoryDir, 'memory.json');

  beforeEach(() => {
    if (fs.existsSync(memoryFile)) fs.unlinkSync(memoryFile);
    if (fs.existsSync(memoryDir)) fs.rmdirSync(memoryDir);
  });

  afterEach(() => {
    if (fs.existsSync(memoryFile)) fs.unlinkSync(memoryFile);
    if (fs.existsSync(memoryDir)) fs.rmdirSync(memoryDir);
  });

  it('Creates memory file on first save()', () => {
    const store = new MemoryStore(cwd);
    store.save();
    expect(fs.existsSync(memoryFile)).toBe(true);
    const data = JSON.parse(fs.readFileSync(memoryFile, 'utf-8'));
    expect(data.version).toBe(1);
    expect(data.projectName).toBe('temp-workspace');
  });

  it('Records verification snapshot', () => {
    const store = new MemoryStore(cwd);
    const mockResult = {
      claims: [{}, {}],
      summary: {
        claimsVerified: 1,
        contradictionsFound: 1,
        unverifiedCount: 0,
        ambiguousCount: 0,
        verificationTimeMs: 150
      }
    } as any;
    
    store.recordVerification(mockResult, 'abc1234', 'main');
    const snapshots = store.getSnapshots();
    
    expect(snapshots.length).toBe(1);
    expect(snapshots[0].commit).toBe('abc1234');
    expect(snapshots[0].summary.totalClaims).toBe(2);
    expect(snapshots[0].summary.claimsVerified).toBe(1);
  });

  it('Records symbol timeline entry and breaking changes', () => {
    const store = new MemoryStore(cwd);
    store.recordSymbolChange('createRouter', 'src/index.ts', 'createRouter(options: object)', 'abc1234');
    
    let timeline = store.getSymbolTimeline('createRouter');
    expect(timeline?.currentSignature).toBe('createRouter(options: object)');
    expect(timeline?.history.length).toBe(0);

    store.recordSymbolChange('createRouter', 'src/index.ts', 'createRouter(options: object, overrides: object)', 'def5678');
    
    timeline = store.getSymbolTimeline('createRouter');
    expect(timeline?.currentSignature).toBe('createRouter(options: object, overrides: object)');
    expect(timeline?.history.length).toBe(1);
    expect(timeline?.history[0].breaking).toBe(true);
  });

  it('Records drift event', () => {
    const store = new MemoryStore(cwd);
    store.recordDriftEvent('useStore', 'docs/api.md', 10, 'DOC-102');
    
    const timeline = store.getSymbolTimeline('useStore');
    expect(timeline?.driftEvents.length).toBe(1);
    expect(timeline?.driftEvents[0].code).toBe('DOC-102');
    expect(timeline?.driftEvents[0].resolution).toBeUndefined();
  });

  it('Resolves drift event', () => {
    const store = new MemoryStore(cwd);
    store.recordDriftEvent('useStore', 'docs/api.md', 10, 'DOC-102');
    store.resolveDriftEvent('useStore', 'DOC-102', 'docs/api.md', 10, 'fixed');
    
    const timeline = store.getSymbolTimeline('useStore');
    expect(timeline?.driftEvents[0].resolution).toBe('fixed');
  });

  it('Computes drift metrics correctly', () => {
    const store = new MemoryStore(cwd);
    store.recordDriftEvent('useStore', 'docs/api.md', 10, 'DOC-102');
    store.resolveDriftEvent('useStore', 'DOC-102', 'docs/api.md', 10, 'fixed');
    
    store.recordDriftEvent('useStore', 'docs/api.md', 15, 'DOC-103');
    store.resolveDriftEvent('useStore', 'DOC-103', 'docs/api.md', 15, 'suppressed');
    
    const metrics = store.getDriftMetrics();
    expect(metrics.totalDriftEvents).toBe(2);
    expect(metrics.fixRate).toBe(0.5);
    expect(metrics.suppressionRate).toBe(0.5);
    expect(metrics.topDriftingSymbols[0].symbol).toBe('useStore');
    expect(metrics.topDriftingSymbols[0].count).toBe(2);
  });

  it('query filters properly', () => {
    const store = new MemoryStore(cwd);
    store.recordSymbolChange('A', 'src/A.ts', 'A()', 'c1');
    store.recordSymbolChange('B', 'src/B.ts', 'B()', 'c1');
    
    const res = store.query({ symbol: 'A' });
    expect(res.length).toBe(1);
    expect(res[0].symbol).toBe('A');
  });

  it('Persists and reloads across instances', () => {
    const store1 = new MemoryStore(cwd);
    store1.recordSymbolChange('A', 'src/A.ts', 'A()', 'c1');
    store1.save();

    const store2 = new MemoryStore(cwd);
    store2.load();
    const timeline = store2.getSymbolTimeline('A');
    expect(timeline?.currentSignature).toBe('A()');
  });
});
