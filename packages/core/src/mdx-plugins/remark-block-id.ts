import type { Transformer } from 'unified';
import type { Root, RootContent } from 'mdast';
import { visit } from 'unist-util-visit';
import { flattenNode } from './utils';
import Slugger from 'github-slugger';
function simpleHash(str: string): string {
  let h1 = 0xdeadbeef ^ 0, h2 = 0x41c6ce57 ^ 0;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export interface RemarkBlockIdOptions {
  /**
   * generate block ID.
   */
  generateId?: (ctx: { node: RootContent; text: string }) => string;

  /**
   * determine whether an ID should be generated for a given node.
   *
   * default: `true` for block nodes, otherwise `false`.
   *
   * @returns
   * - `true`: generate an ID for the node.
   * - `false`: skip the current node and look into its children.
   * - `skip`: skip the current node and its children.
   */
  shouldGenerate?: (node: RootContent) => boolean | 'skip';

  /**
   * Add `data-block="<value>"` to updated nodes, pass `null` to disable.
   *
   * @default "default"
   */
  addDataAttribute?: string | null;
}

/**
 * Generate ID for each block node in Markdown/MDX.
 *
 * Note: the uniqueness is only guaranteed per file.
 */
export function remarkBlockId({
  generateId,
  addDataAttribute = 'default',
  shouldGenerate = (node) => {
    switch (node.type) {
      case 'mdxJsxFlowElement':
        return 'skip';
      case 'paragraph':
      case 'image':
      case 'listItem':
        return true;
      default:
        return false;
    }
  },
}: RemarkBlockIdOptions = {}): Transformer<Root, Root> {
  return (tree) => {
    const slugger = new Slugger();

    visit(tree, (node) => {
      if (node.type === 'root' || node.data?.hProperties?.id) return;

      const resolved = shouldGenerate(node);
      if (resolved === false) return;
      if (resolved === 'skip') return 'skip';

      const text = flattenNode(node).trim();
      if (text.length === 0) return;

      const id = generateId
        ? slugger.slug(generateId({ node, text }))
        : slugger.slug(simpleHash(text));

      node.data ??= {};
      node.data.hProperties ??= {};
      node.data.hProperties.id = id;
      if (addDataAttribute) {
        node.data.hProperties['data-block'] = addDataAttribute;
      }
    });
  };
}
