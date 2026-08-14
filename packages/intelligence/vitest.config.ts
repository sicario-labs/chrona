import { defineProject } from 'vitest/config';

export default defineProject({
  resolve: {
    alias: {
      '@/types': new URL('../engine/src/types.ts', import.meta.url).pathname,
      '@/indexer': new URL('../engine/src/indexer.ts', import.meta.url).pathname,
      '@/generate': new URL('../engine/src/generate.ts', import.meta.url).pathname,
      '@/builder': new URL('../graph/src/builder.ts', import.meta.url).pathname,
      '@/': new URL('./src/', import.meta.url).pathname,
      '@chrona/engine': new URL('../engine/src/index.ts', import.meta.url).pathname,
      '@chrona/graph': new URL('../graph/src/index.ts', import.meta.url).pathname,
    },
  },
});