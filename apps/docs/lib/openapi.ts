import { createOpenAPI } from 'chrona-openapi/server';
import path from 'node:path';

export const openapi = createOpenAPI({
  input: [path.resolve('./scalar.yaml')],
  proxyUrl: '/api/proxy',
});
