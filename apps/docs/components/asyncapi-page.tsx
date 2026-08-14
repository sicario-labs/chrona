'use client';
import { defaultShikiOptions } from '@/lib/shiki';
import { createAsyncAPIPage } from '@chrona/asyncapi/ui';

export const AsyncAPIPage = createAsyncAPIPage({
  shikiOptions: defaultShikiOptions,
});
