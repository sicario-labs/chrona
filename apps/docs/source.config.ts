import { defineConfig } from 'chrona-mdx/config';
import jsonSchema from 'chrona-mdx/plugins/json-schema';
import lastModified from 'chrona-mdx/plugins/last-modified';

export default defineConfig({
  compiler: 'satteri',
  plugins: [
    jsonSchema({
      insert: true,
    }),
    lastModified(),
  ],
});
