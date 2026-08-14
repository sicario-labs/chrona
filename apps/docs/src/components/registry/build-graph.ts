import { source } from '@/lib/source';
import type { Graph } from '@/components/graph-view';

export function buildGraph(): Graph {
  const pages = source.getPages();
  const graph: Graph = { links: [], nodes: [] };

  for (const page of pages) {
    graph.nodes.push({
      id: page.url,
      url: page.url,
      text: (page.data as any).title ?? page.url,
      description: (page.data as any).description,
    });

    const { extractedReferences = [] } = page.data as any;
    for (const ref of extractedReferences) {
      const refPage = source.getPageByHref(ref.href);
      if (!refPage) continue;

      graph.links.push({
        source: page.url,
        target: refPage.page.url,
      });
    }
  }

  return graph;
}
