import { defineCollections } from 'chrona-mdx/macro';

export const docs = defineCollections({
  type: 'doc',
  dir: 'test/fixtures/generate-index',
  postprocess: { extractLinkReferences: true },
});
