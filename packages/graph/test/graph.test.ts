import { describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';
import { indexProjectFromProject } from '@chrona/engine';
import { buildSymbolGraph } from '../src/builder';

describe('graph', () => {
  it('builds a graph with typeOf edges', async () => {
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
      useInMemoryFileSystem: true,
    });
    project.createSourceFile(
      '/repo/src/models.ts',
      `export interface User { id: string; }`,
    );
    project.createSourceFile(
      '/repo/src/service.ts',
      `import type { User } from './models';
       export interface Session { user: User; token: string; }`,
    );

    const index = await indexProjectFromProject(project, {
      files: ['/repo/src/models.ts', '/repo/src/service.ts'],
    });

    const graph = buildSymbolGraph(index);
    const session = index.byName.get('Session')?.[0];
    const user = index.byName.get('User')?.[0];
    expect(session).toBeDefined();
    expect(user).toBeDefined();

    expect(graph.nodes.length).toBe(2);
    const edge = graph.edges.find(
      (e) => e.from === session?.id && e.to === user?.id && e.kind === 'typeOf',
    );
    expect(edge).toBeDefined();
    expect(graph.adjacency.get(session!.id)).toContain(user!.id);
  });

  it('walks function return types and parameters', async () => {
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
      useInMemoryFileSystem: true,
    });
    project.createSourceFile(
      '/repo/src/models.ts',
      `export interface User { id: string; }`,
    );
    project.createSourceFile(
      '/repo/src/service.ts',
      `import type { User } from './models';
       export function getUser(): User { return { id: 'x' }; }
       export function setUser(user: User): void {}`,
    );

    const index = await indexProjectFromProject(project, {
      files: ['/repo/src/models.ts', '/repo/src/service.ts'],
    });

    const graph = buildSymbolGraph(index);
    const user = index.byName.get('User')?.[0];

    expect(user).toBeDefined();
    expect(graph.adjacency.get(index.byName.get('getUser')![0].id)).toContain(
      user!.id,
    );
    expect(graph.adjacency.get(index.byName.get('setUser')![0].id)).toContain(
      user!.id,
    );
  });

  it('emits no self-edges', async () => {
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
      useInMemoryFileSystem: true,
    });
    project.createSourceFile(
      '/repo/src/a.ts',
      `export interface A { self: A; }`,
    );

    const index = await indexProjectFromProject(project, {
      files: ['/repo/src/a.ts'],
    });
    const graph = buildSymbolGraph(index);
    expect(graph.edges.filter((e) => e.from === e.to)).toHaveLength(0);
  });
});