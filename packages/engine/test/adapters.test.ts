import { describe, it, expect } from 'vitest';
import { AdapterRegistry } from '../src/adapters/registry';
import { TypeScriptAdapter } from '../src/adapters/typescript';
import { PythonAdapter } from '../src/adapters/python';

describe('Language Adapters', () => {
  it('AdapterRegistry routes files by extension', () => {
    const registry = new AdapterRegistry();

    const tsAdapter = registry.getAdapterForFile('src/auth.ts');
    expect(tsAdapter).toBeInstanceOf(TypeScriptAdapter);

    const pyAdapter = registry.getAdapterForFile('src/client.py');
    expect(pyAdapter).toBeInstanceOf(PythonAdapter);

    const unknown = registry.getAdapterForFile('readme.txt');
    expect(unknown).toBeNull();
  });

  it('TypeScriptAdapter extracts symbols and properties cleanly', () => {
    const adapter = new TypeScriptAdapter();
    const code = `
export interface RouterOptions {
  strict?: boolean;
}

export function createRouter(options?: RouterOptions): Router {
  return {};
}
`;
    const symbols = adapter.extractSymbols(code, 'test.ts');
    expect(symbols.length).toBeGreaterThanOrEqual(2);

    const fn = symbols.find((s) => s.name === 'createRouter');
    expect(fn).toBeDefined();
    expect(fn?.kind).toBe('function');
    expect(fn?.parameters).toHaveLength(1);
    expect(fn?.parameters[0].name).toBe('options');
  });

  it('PythonAdapter extracts functions, classes, type annotations, and docstrings', () => {
    const adapter = new PythonAdapter();
    const code = `
class ClientConfig:
    timeout: int = 30
    api_key: str

def create_client(base_url: str, timeout: int = 30) -> ClientConfig:
    """Create a configured client instance."""
    pass
`;
    const symbols = adapter.extractSymbols(code, 'client.py');
    expect(symbols.length).toBe(2);

    const cls = symbols.find((s) => s.name === 'ClientConfig');
    expect(cls?.kind).toBe('class');
    expect(cls?.properties).toHaveLength(2);

    const fn = symbols.find((s) => s.name === 'create_client');
    expect(fn?.kind).toBe('function');
    expect(fn?.parameters).toHaveLength(2);
    expect(fn?.parameters[0].name).toBe('base_url');
    expect(fn?.parameters[0].type).toBe('str');
    expect(fn?.parameters[1].name).toBe('timeout');
    expect(fn?.parameters[1].defaultValue).toBe('30');
    expect(fn?.returnType).toBe('ClientConfig');
    expect(fn?.docstring).toBe('Create a configured client instance.');
  });
});
