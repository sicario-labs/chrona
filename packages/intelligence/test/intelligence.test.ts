import { describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';
import { indexProjectFromProject } from '@chrona/engine';
import { buildSymbolGraph } from '@chrona/graph';
import { createRepositorySource } from '../src/source';

describe('intelligence', () => {
  it('emits one virtual page per indexed symbol', async () => {
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
    const graph = buildSymbolGraph(index);

    const source = createRepositorySource({ index, graph });
    const files = await (await source.staticSource()).files;

    const pages = files.filter((file) => file.type === 'page');
    expect(pages.length).toBe(2);

    const createClient = pages.find(
      (file) => file.type === 'page' && file.data.title === 'createClient',
    );
    expect(createClient).toBeDefined();
    if (createClient?.type !== 'page') throw new Error('expected page');

    expect(createClient.path).toBe('~/repository/createClient.mdx');
    expect(createClient.data.title).toBe('createClient');
    expect(createClient.data.description).toBeDefined();
    expect(createClient.data._chrona.kind).toBe('function');
    expect(createClient.data._chrona.filePath).toBe('/repo/src/api.ts');
    expect(createClient.data._chrona.graph?.map((n) => n.name)).toContain('Client');

    const client = pages.find((file) => file.type === 'page' && file.data.title === 'Client');
    expect(client).toBeDefined();
    if (client?.type !== 'page') throw new Error('expected page');
    expect(client.data._chrona.references.length).toBeGreaterThan(0);

    expect(createClient.data.structuredData.headings.length).toBeGreaterThan(0);
  });

  it('applies include/exclude filters', async () => {
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
      useInMemoryFileSystem: true,
    });
    project.createSourceFile('/repo/src/a.ts', `export const a = 1;`);
    project.createSourceFile('/repo/src/b.ts', `export const b = 2;`);

    const index = await indexProjectFromProject(project, {
      files: ['/repo/src/a.ts', '/repo/src/b.ts'],
    });

    const source = createRepositorySource({
      index,
      include: (symbol) => symbol.name === 'a',
    });
    const files = await (await source.staticSource()).files;
    const pages = files.filter((file) => file.type === 'page');

    expect(pages).toHaveLength(1);
    expect(pages[0].type === 'page' ? pages[0].data.title : '').toBe('a');
  });

  it('supports custom baseDir and slug', async () => {
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
      useInMemoryFileSystem: true,
    });
    project.createSourceFile('/repo/src/api.ts', `export const api = 1;`);

    const index = await indexProjectFromProject(project, {
      files: ['/repo/src/api.ts'],
    });

    const source = createRepositorySource({
      index,
      baseDir: '~symbols',
      slug: () => ['custom'],
    });
    const files = await (await source.staticSource()).files;

    expect(files[0].type === 'page' ? files[0].path : '').toBe('~symbols/custom/api.mdx');
  });
});
