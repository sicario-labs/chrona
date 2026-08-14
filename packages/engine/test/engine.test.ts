import { describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';
import { indexProjectFromProject } from '../src/indexer';
import { generateSymbolDocumentation } from '../src/generate';
import type { RepositoryIndex } from '../src/types';

describe('engine', () => {
  it('indexes exported symbols across files', async () => {
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
      useInMemoryFileSystem: true,
    });
    project.createSourceFile(
      '/repo/src/client.ts',
      `export interface Client { name: string; }`,
    );
    project.createSourceFile(
      '/repo/src/api.ts',
      `import type { Client } from './client';
       export function createClient(): Client { return { name: 'x' }; }`,
    );

    const index = await indexProjectFromProject(project, {
      files: ['/repo/src/client.ts', '/repo/src/api.ts'],
    });
    expect(index.symbols.size).toBe(2);
    expect(index.byName.get('Client')?.[0]?.kind).toBe('interface');
    expect(index.byName.get('createClient')?.[0]?.kind).toBe('function');
    expect(index.byName.get('Client')?.[0]?.references.length).toBeGreaterThan(0);
  });

  it('generates symbol documentation', async () => {
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
      useInMemoryFileSystem: true,
    });
    project.createSourceFile(
      '/repo/src/api.ts',
      `/**
       * A widget.
       */
       export interface Widget {
         /** the id */
         id: string;
         /** @deprecated use id */
         name?: string;
         private$?: never;
       }`,
    );

    const index: RepositoryIndex = await indexProjectFromProject(project, {
      files: ['/repo/src/api.ts'],
    });
    const symbol = index.byName.get('Widget')?.[0]!;
    const doc = await generateSymbolDocumentation(index, symbol.id);

    expect(doc?.description).toBe('A widget.');
    const idEntry = doc?.entries.find((e) => e.name === 'id');
    expect(idEntry?.description).toBe('the id');
    expect(idEntry?.required).toBe(true);
    const nameEntry = doc?.entries.find((e) => e.name === 'name');
    expect(nameEntry?.deprecated).toBe(true);
    expect(nameEntry?.required).toBe(false);
  });
});