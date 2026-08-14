import { createGraphQL } from '@chrona/graphql/server';

export const graphql =
  typeof window !== 'undefined'
    ? ({ staticSource: async () => ({ files: [] }), loaderPlugin: () => ({}) } as any)
    : createGraphQL({
        input: ['./store.graphql'],
      });
