import { describe, it, expect, vi } from 'vitest';
import { RegistryClient } from '../src/registry/client';

// Mock fetch
const originalFetch = global.fetch;

describe('Registry Client', () => {
  const client = new RegistryClient({ registryUrl: 'https://test.registry.local', authToken: 'test-token' });

  it('publish() sends correct HTTP PUT with model payload', async () => {
    const mockModel = { name: 'test-pkg', version: '1.0.0', publishedAt: '', symbols: [], integrity: { claimsVerified: 0, contradictions: 0, soundnessPercent: '100%' }, checksum: 'abc' };
    
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201
    });

    const result = await client.publish(mockModel);
    expect(result.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://test.registry.local/registry/test-pkg/1.0.0',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify(mockModel) })
    );
  });

  it('fetch() returns parsed model for existing package', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ name: 'zustand', version: '5.0.0' })
    });

    const result = await client.fetch('zustand');
    expect(result?.name).toBe('zustand');
  });

  it('fetch() returns null for non-existent package', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404
    });

    const result = await client.fetch('nonexistent');
    expect(result).toBeNull();
  });

  it('search() returns array of matching packages', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ([{ name: 'radix3', version: '1.0.0', symbols: 10 }])
    });

    const results = await client.search('radix');
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('radix3');
  });
});
