import type { Transformer } from 'unified';
import type { BlockContent, Root, RootContent } from 'mdast';
import type { MdxJsxFlowElement } from 'mdast-util-mdx';
import { visit } from 'unist-util-visit';
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
import { flattenNode } from './utils';

export interface RemarkFeedbackBlockOptions {
  /**
   * generate block ID, default to using MD5.
   */
  generateHash?: (ctx: { body: string }) => string;

  /**
   * @defaultValue FeedbackBlock
   */
  tagName?: string;

  /**
   * determine how the node should be resolved into a feedback block.
   *
   * default: skip MDX elements, convert paragraph, list item, and image nodes.
   *
   * @returns
   * - `true`: convert the node into a feedback block.
   * - `false`: skip the current node and look into its children.
   * - `skip`: skip the current node and its children.
   */
  resolve?: (node: RootContent) => boolean | 'skip';

  /**
   * generate & include the block body to `<FeedbackBlock body="..." />` as string
   *
   * @defaultValue true
   */
  generateBody?: boolean;
}

export interface FeedbackBlockProps {
  id: string;
  /** the text body of block, only exists when `generateBody` is enabled. */
  body?: string;
}

/**
 * Generate MDX `<FeedbackBlock />` elements with an unique `id` for every block-like element.
 *
 * Note: the uniqueness is only guaranteed per MDX file/page.
 */
export function remarkFeedbackBlock({
  generateHash = ({ body }) => simpleHash(body),
  tagName = 'FeedbackBlock',
  resolve = (node) => {
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
  generateBody = true,
}: RemarkFeedbackBlockOptions = {}): Transformer<Root, Root> {
  return (tree) => {
    const counts = new Map<string, number>();

    visit(tree, (node, index, parent) => {
      if (node.type === 'root' || !parent || typeof index !== 'number') return;
      const resolved = resolve(node);
      if (resolved === false) return;
      if (resolved === 'skip') return 'skip';

      const text = flattenNode(node).trim();
      if (text.length === 0) return;
      let id = generateHash({ body: text });
      const count = counts.get(id) ?? 0;
      if (count > 0) id = `${id}-${count}`;
      counts.set(id, count + 1);

      const wrapper: MdxJsxFlowElement = {
        type: 'mdxJsxFlowElement',
        name: tagName,
        attributes: [
          {
            type: 'mdxJsxAttribute',
            name: 'id',
            value: id,
          },
        ],
        data: {
          _stringify: 'children-only',
        },
        children: [node as BlockContent],
      };
      if (generateBody)
        wrapper.attributes.push({
          type: 'mdxJsxAttribute',
          name: 'body',
          value: text,
        });

      parent.children[index] = wrapper;
      return 'skip';
    });
  };
}
