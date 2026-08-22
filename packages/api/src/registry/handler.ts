import type { RegistryPackageModel } from '@chrona-engine/engine';

// Mock in-memory database for the Chrona Truth Registry
const registryStore: Map<string, RegistryPackageModel> = new Map();

export async function publishPackage(model: RegistryPackageModel): Promise<{ ok: boolean }> {
  // Validate model structure briefly
  if (!model.name || !model.version || !model.symbols || !model.integrity) {
    throw new Error('Invalid RegistryPackageModel format');
  }

  const key = `${model.name}@${model.version}`;
  registryStore.set(key, model);

  // Set latest pointer
  const latestKey = `${model.name}@latest`;
  registryStore.set(latestKey, model);

  return { ok: true };
}

export async function fetchPackage(name: string, version: string = 'latest'): Promise<RegistryPackageModel | null> {
  const key = `${name}@${version}`;
  return registryStore.get(key) || null;
}

export async function searchPackages(query: string): Promise<Array<{ name: string; version: string; symbols: number }>> {
  const results = [];
  for (const [key, model] of registryStore.entries()) {
    if (key.endsWith('@latest') && model.name.toLowerCase().includes(query.toLowerCase())) {
      results.push({
        name: model.name,
        version: model.version,
        symbols: model.symbols.length
      });
    }
  }
  return results;
}
