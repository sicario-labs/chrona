import { createOpenAPI } from 'chrona-openapi/server';

export const openapi =
  typeof window !== 'undefined'
    ? ({ staticSource: async () => ({ files: [] }), loaderPlugin: () => ({}) } as any)
    : createOpenAPI({
        input: ['./scalar.yaml'],
        proxyUrl: '/api/proxy',
      });
