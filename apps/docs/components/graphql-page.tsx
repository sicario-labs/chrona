'use client';
import { defaultShikiOptions } from '@/lib/shiki';
import { createGraphQLPage } from '@chrona/graphql/ui';

export const GraphQLPage = createGraphQLPage({
  shikiOptions: defaultShikiOptions,
  playground: {
    url: '/api/graphql',
  },
});
