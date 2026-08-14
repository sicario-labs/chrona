import { allDocs, allMetas } from 'content-collections';
import { loader } from 'chrona-core/source';
import { createMDXSource } from '@chrona/content-collections';

export const source = loader({
  baseUrl: '/docs',
  source: createMDXSource(allDocs, allMetas),
});
