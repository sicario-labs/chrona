'use client';
import { defaultShikiOptions } from '@/lib/shiki';
import { createOpenAPIPage } from 'chrona-openapi/ui';

export const OpenAPIPage = createOpenAPIPage({
  shikiOptions: defaultShikiOptions,
});
