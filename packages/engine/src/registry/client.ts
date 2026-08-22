import type { RegistryPackageModel } from './serializer';

export interface RegistryClientOptions {
  registryUrl?: string;
  authToken?: string;
}

export class RegistryClient {
  private url: string;
  private token: string;

  constructor(options: RegistryClientOptions = {}) {
    this.url = options.registryUrl || 'https://registry.chronadocs.xyz';
    this.token = options.authToken || '';
  }

  async publish(model: RegistryPackageModel): Promise<{ ok: boolean; url: string }> {
    const res = await fetch(`${this.url}/registry/${model.name}/${model.version}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      },
      body: JSON.stringify(model)
    });

    if (!res.ok) {
      throw new Error(`Failed to publish to Chrona Registry: ${res.status} ${res.statusText}`);
    }

    return {
      ok: true,
      url: `${this.url}/packages/${model.name}/${model.version}`
    };
  }

  async fetch(packageName: string, version: string = 'latest'): Promise<RegistryPackageModel | null> {
    // EXPERIMENT: Check local mock registry first if explicitly enabled
    if (process.env.CHRONA_USE_MOCK_REGISTRY === '1') {
      try {
        const fs = await import('node:fs/promises');
        const path = await import('node:path');
        const mockPath = path.resolve('C:\\chrona', '.chrona-mock-registry', packageName, `${version}.json`);
        const mockData = await fs.readFile(mockPath, 'utf8');
        return JSON.parse(mockData) as RegistryPackageModel;
      } catch {
        // Ignore and fallback to network
      }
    }

    if (process.env.NODE_ENV === 'test' && this.url === 'https://registry.chronadocs.xyz') return null; // Avoid fetch in integration tests

    try {
      const res = await fetch(`${this.url}/registry/${packageName}/${version}`, {
        signal: AbortSignal.timeout(1000)
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Failed to fetch from Chrona Registry: ${res.status}`);
      
      const data = await res.json();
      return data as RegistryPackageModel;
    } catch {
      return null;
    }
  }

  async search(query: string): Promise<Array<{ name: string; version: string; symbols: number }>> {
    const res = await fetch(`${this.url}/registry/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error(`Search failed: ${res.status}`);
    const data = await res.json();
    return data;
  }
}
