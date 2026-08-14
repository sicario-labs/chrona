import { defineProject } from 'vitest/config';

export default defineProject({
  resolve: {
    alias: {
      '@/': new URL('./src/', import.meta.url).pathname,
      '@chrona/engine': new URL('../engine/src/index.ts', import.meta.url).pathname,
      '@chrona/graph': new URL('../graph/src/index.ts', import.meta.url).pathname,
    },
  },
});
