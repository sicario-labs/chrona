import { createAsyncAPI } from '@chrona/asyncapi/server';

export const asyncapi =
  typeof window !== 'undefined'
    ? ({ staticSource: async () => ({ files: [] }), loaderPlugin: () => ({}) } as any)
    : createAsyncAPI({
        input: ['./scalar-asyncapi.yaml'],
      });
