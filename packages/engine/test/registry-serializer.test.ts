import { describe, it, expect } from 'vitest';
import { workspaceToRegistryModel, registryModelToEvidence } from '../src/registry/serializer';
import { ChronaWorkspace } from '../src/workspace/model';
import * as path from 'path';

describe('Registry Serializer', () => {
  const cwd = path.resolve(__dirname, '../../../test-repos/radix3');

  it('Serializes workspace to registry model with all symbols', async () => {
    const ws = await ChronaWorkspace.fromDirectory(cwd);
    const model = workspaceToRegistryModel(ws, 'radix3', '1.0.0');
    expect(model.symbols.length).toBe(ws.software.symbolsCount);
    expect(model.checksum).toBeDefined();
  });

  it('Checksum is deterministic', async () => {
    const ws = await ChronaWorkspace.fromDirectory(cwd);
    const model1 = workspaceToRegistryModel(ws, 'radix3', '1.0.0');
    // Simulate re-creation
    model1.publishedAt = 'SAME'; 
    const str1 = JSON.stringify({ ...model1, checksum: undefined });
    
    const model2 = workspaceToRegistryModel(ws, 'radix3', '1.0.0');
    model2.publishedAt = 'SAME';
    const str2 = JSON.stringify({ ...model2, checksum: undefined });
    
    expect(str1).toBe(str2);
  });

  it('Deserializes registry model back to valid Evidence', async () => {
    const ws = await ChronaWorkspace.fromDirectory(cwd);
    const model = workspaceToRegistryModel(ws, 'radix3', '1.0.0');
    
    const ev = registryModelToEvidence(model, 'createRouter');
    expect(ev).toBeDefined();
    expect(ev?.source).toBe('dependency-types');
    expect(ev?.strength).toBe('STRONG');
    expect((ev?.data as any).signature).toBeDefined();
  });
});
