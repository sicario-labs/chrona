import { type LoaderPlugin, loader } from 'chrona-core/source';
import { lucideIconsPlugin } from 'chrona-core/source/lucide-icons';
import { openapi } from '@/lib/openapi';
import { asyncapi } from '../asyncapi';
import { graphql } from '../graphql';
import { repository } from '../repository';
// Vite SPA Source Config
import { defineCollections, defineDocs } from 'chrona-mdx/macro';
import { metaSchema, pageSchema } from 'chrona-core/source/schema';
import z from 'zod';
import type { RemarkAutoTypeTableOptions } from 'chrona-typescript';
import { defaultShikiOptions } from '../shiki';
import type { ShikiTransformer } from 'shiki';
import type { ElementContent } from 'hast';
import { remarkSteps } from '@chrona/satteri/remark-steps';
import { remarkBlockId } from '@chrona/satteri/remark-block-id';
import { remarkTs2js } from '@chrona/satteri/remark-ts2js';
import { remarkAutoTypeTable } from '@chrona/satteri/remark-auto-type-table';
import { Nodes } from 'mdast';
import { rehypeCodeDefaultOptions } from 'chrona-core/mdx-plugins/rehype-code';

import type { MdastPluginDefinition } from 'satteri';



const isLint = process.env.LINT === '1';

declare module 'satteri' {
  interface DataMap {
    elementIds?: string[];
  }
}

/** Docs lint only — collects JSX `id` attributes for link validation. */
function remarkElementIds(): MdastPluginDefinition {
  return {
    name: 'remark-element-ids',
    mdxJsxFlowElement(node, ctx) {
      if (!node.name || !node.attributes) return;

      const idAttr = node.attributes.find(
        (attr) => attr.type === 'mdxJsxAttribute' && attr.name === 'id',
      );
      if (!idAttr || typeof idAttr.value !== 'string') return;

      const ids = (ctx.data.elementIds ??= []);
      ids.push(idAttr.value);
    },
  };
}

const docs = defineDocs({
  docs: {
    compiler: 'satteri',
    schema: pageSchema.extend({
      preview: z.string().optional(),
      index: z.boolean().default(false),
      /**
       * API routes only
       */
      method: z.string().optional(),
    }),
    postprocess: {
      includeProcessedMarkdown: true,
      extractLinkReferences: true,
      valueToExport: ['elementIds'],
    },
    async: true,
    lastModified: true,
  satteriOptions() {
    if ((globalThis as any)._docsSatteriPromise) {
      return (globalThis as any)._docsSatteriPromise;
    }
    
    const promise = (async () => {
      const getModule = (name: string) => new Function(`return import("${name}")`)();
      
      const { createFileSystemGeneratorCache, createGenerator } = await getModule('chrona-typescript');
      const { transformerTwoslash } = await getModule('chrona-twoslash');
      const { createFileSystemTypesCache } = await getModule('chrona-twoslash/cache-fs');

      const typeTableGenerator = createGenerator({
        cache: createFileSystemGeneratorCache('.vite/cache/chrona-typescript'),
      });

      const typeTableOptions: RemarkAutoTypeTableOptions = {
        generator: typeTableGenerator,
        shiki: defaultShikiOptions,
      };

      const options = {
        features: {
          math: true,
        },
        rehypeCodeOptions: isLint
          ? false
          : {
              inline: 'tailing-curly-colon',
              themes: {
                light: 'catppuccin-latte',
                dark: 'catppuccin-mocha',
              },
              transformers: [
                ...(rehypeCodeDefaultOptions.transformers ?? []),
                transformerTwoslash({
                  typesCache: createFileSystemTypesCache(),
                  twoslashOptions: {
                    compilerOptions: {
                      types: ['@types/node'],
                    },
                  },
                }),
                transformerEscape(),
              ],
            },
        remarkCodeTabOptions: {
          parseMdx: true,
        },
        remarkStructureOptions: {
          stringify: {
            filterElement(node: Nodes) {
              switch (node.type) {
                case 'mdxJsxFlowElement':
                case 'mdxJsxTextElement':
                  switch (node.name) {
                    case 'File':
                    case 'TypeTable':
                    case 'Callout':
                    case 'Card':
                    case 'Custom':
                      return true;
                  }
                  return 'children-only';
              }

              return true;
            },
          },
        },
        remarkImageOptions: isLint ? false : undefined,
        remarkNpmOptions: {
          persist: {
            id: 'package-manager',
          },
        },
        mdastPlugins: (plugins: any[]) =>
          isLint
            ? [remarkElementIds(), ...plugins]
            : [
                remarkSteps(),
                remarkBlockId({ addDataAttribute: 'feedback' }),
                remarkAutoTypeTable(typeTableOptions),
                remarkTs2js(),
                ...plugins,
              ],
      };
      return options;
    })();
    
    (globalThis as any)._docsSatteriPromise = promise;
    return promise;
  },
  },
  meta: {
    schema: metaSchema.extend({
      description: z.string().optional(),
    }),
  },
});

const blog = defineCollections({
  type: 'doc',
  compiler: 'satteri',
  dir: 'content/blog',
  schema: pageSchema.extend({
    author: z.string(),
    date: z.iso.date().or(z.date()),
  }),
  async: true,
  satteriOptions() {
    if ((globalThis as any)._blogSatteriPromise) {
      return (globalThis as any)._blogSatteriPromise;
    }
    
    const promise = (async () => {
      const getModule = (name: string) => new Function(`return import("${name}")`)();
      const { rehypeCodeDefaultOptions } = await getModule('chrona-core/mdx-plugins/rehype-code');

      const options = {
        rehypeCodeOptions: isLint
          ? false
          : {
              inline: 'tailing-curly-colon',
              themes: {
                light: 'catppuccin-latte',
                dark: 'catppuccin-mocha',
              },
              transformers: [...(rehypeCodeDefaultOptions.transformers ?? []), transformerEscape()],
            },
        remarkCodeTabOptions: {
          parseMdx: true,
        },
        remarkImageOptions: isLint ? false : undefined,
        remarkNpmOptions: {
          persist: {
            id: 'package-manager',
          },
        },
        mdastPlugins: (plugins: any[]) =>
          isLint ? [remarkElementIds(), ...plugins] : [remarkSteps(), ...plugins],
      };
      return options;
    })();
    
    (globalThis as any)._blogSatteriPromise = promise;
    return promise;
  },
});

export const source = loader(
  {
    docs: docs.toChronaSource(),
    openapi: await openapi.staticSource({
      baseDir: 'openapi/(generated)',
      meta: {
        folderStyle: 'separator',
      },
      groupBy: 'tag',
    }),
    asyncapi: await asyncapi.staticSource({
      baseDir: 'asyncapi/(generated)',
      meta: {
        folderStyle: 'separator',
      },
      groupBy: 'tag',
    }),
    graphql: await graphql.staticSource({
      baseDir: 'graphql/(generated)',
      baseUrl: '/docs',
      meta: {
        folderStyle: 'separator',
      },
    }),
    repository: await repository.staticSource(),
  },
  {
    baseUrl: '/docs',
    plugins: [
      pageTreeCodeTitles(),
      lucideIconsPlugin(),
      openapi.loaderPlugin(),
      asyncapi.loaderPlugin(),
      graphql.loaderPlugin(),
    ],
  },
);

function pageTreeCodeTitles(): LoaderPlugin {
  return {
    transformPageTree: {
      file(node) {
        if (
          typeof node.name === 'string' &&
          (node.name.endsWith('()') || node.name.match(/^<\w+ \/>$/))
        ) {
          return {
            ...node,
            name: (
              <code key="0" className="text-[0.8125rem]">
                {node.name}
              </code>
            ),
          };
        }
        return node;
      },
    },
  };
}

function transformerEscape(): ShikiTransformer {
  return {
    name: '@shikijs/transformers:remove-notation-escape',
    code(hast) {
      function replace(node: ElementContent) {
        if (node.type === 'text') {
          node.value = node.value.replace('[\\!code', '[!code');
        } else if ('children' in node) {
          for (const child of node.children) {
            replace(child);
          }
        }
      }

      replace(hast);
      return hast;
    },
  };
}

export const blogLoader = loader(blog.toChronaSource(), {
  baseUrl: '/blog',
});

export type Page = (typeof source)['$inferPage'];
export type Meta = (typeof source)['$inferMeta'];
