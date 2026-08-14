import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { chronaMdx } from 'chrona-mdx/vite';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';

export default defineConfig({
  plugins: [
    TanStackRouterVite({ target: 'react', autoCodeSplitting: true, routesDirectory: './src/routes' }),
    chronaMdx(),
    tailwindcss(),
    react(),
  ] as any[],
  resolve: {
    alias: { '@': new URL('./src', import.meta.url).pathname },
  },
  optimizeDeps: {
    exclude: ['@oxc-resolver/binding-wasm32-wasi', '@types/mdx', 'mdx/types'],
    esbuildOptions: {
      plugins: [
        {
          name: 'external-mdx-types',
          setup(build) {
            build.onResolve({ filter: /.*\.mdx$/ }, (args) => ({ path: args.path, external: true }));
          },
        },
      ],
    },
  },
  build: {
    target: 'esnext'
  }
});
