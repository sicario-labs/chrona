import { indexProjectFromProject } from '@chrona/engine';
import { buildSymbolGraph } from '@chrona/graph';
import { createRepositorySource } from '@chrona/intelligence';
import { Project, ModuleKind, ModuleResolutionKind, ScriptTarget } from 'ts-morph';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '../../..');

const MOAT_FILES = [
  'packages/engine/src/types.ts',
  'packages/engine/src/indexer.ts',
  'packages/engine/src/generate.ts',
  'packages/engine/src/index.ts',
  'packages/graph/src/types.ts',
  'packages/graph/src/builder.ts',
  'packages/graph/src/index.ts',
  'packages/intelligence/src/source.ts',
  'packages/intelligence/src/index.ts',
];

function createProject() {
  const files = MOAT_FILES.map((file) => path.join(repoRoot, file));
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: {
      allowJs: true,
      noEmit: true,
      moduleResolution: ModuleResolutionKind.Bundler,
      module: ModuleKind.ESNext,
      target: ScriptTarget.ES2022,
      lib: ['lib.esnext.d.ts'],
      paths: {
        '@/types': ['packages/engine/src/types.ts'],
        '@/indexer': ['packages/engine/src/indexer.ts'],
        '@/generate': ['packages/engine/src/generate.ts'],
        '@/builder': ['packages/graph/src/builder.ts'],
        '@/': ['packages/intelligence/src/'],
        '@chrona/engine': ['packages/engine/src/index.ts'],
        '@chrona/graph': ['packages/graph/src/index.ts'],
      },
      baseUrl: repoRoot,
      types: ['node'],
    },
  });

  for (const file of files) {
    project.addSourceFileAtPath(file);
  }

  return { project, files };
}

export async function createRepository() {
  const { project, files } = createProject();
  const index = await indexProjectFromProject(project, { files });
  const graph = buildSymbolGraph(index);

  return createRepositorySource({
    index,
    graph,
    baseDir: 'repository/(generated)',
    include: (symbol) => !symbol.internal,
  });
}

export const repository = await createRepository();
