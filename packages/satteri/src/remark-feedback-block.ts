import { defineMdastPlugin } from 'satteri';
import type { MdastNode, MdastVisitorContext } from 'satteri';
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

export interface RemarkFeedbackBlockOptions {
  generateHash?: (ctx: { body: string }) => string;
  tagName?: string;
  resolve?: (node: MdastNode) => boolean | 'skip';
  generateBody?: boolean;
}

// TODO: allow to define visitors from options
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
}: RemarkFeedbackBlockOptions = {}) {
  return () => {
    const counts = new Map<string, number>();

    function visit(node: MdastNode, ctx: MdastVisitorContext) {
      const resolved = resolve(node);
      if (resolved === false || resolved === 'skip') return;

      const text = ctx.textContent(node, { includeImageAlt: false }).trim();
      if (text.length === 0) return;

      let id = generateHash({ body: text });
      const count = counts.get(id) ?? 0;
      if (count > 0) id = `${id}-${count}`;
      counts.set(id, count + 1);

      const attributes = [{ type: 'mdxJsxAttribute' as const, name: 'id', value: id }];
      if (generateBody) {
        attributes.push({ type: 'mdxJsxAttribute', name: 'body', value: text });
      }

      // `wrapNode` records a per-node patch; rewriting the parent's children
      // would clobber the patches of sibling blocks visited earlier
      ctx.wrapNode(node, {
        type: 'mdxJsxFlowElement',
        name: tagName,
        attributes,
        data: { _stringify: 'children-only' },
        children: [],
      });
    }

    return defineMdastPlugin({
      name: 'remark-feedback-block',
      paragraph: visit,
      image: visit,
      listItem: visit,
    });
  };
}
