import { source } from '@/lib/source';
import { flexsearchFromSource } from 'chrona-core/search/flexsearch';
import type { SortedResult } from 'chrona-core/search';
import type { ChronaSymbolData } from '@chrona/intelligence';

const api = flexsearchFromSource(source);

type Evidence = ChronaSymbolData['_chrona'];

const evidenceByUrl = new Map<string, Evidence>();
for (const page of source.getPages()) {
  const evidence = (page.data as Partial<ChronaSymbolData>)._chrona;
  if (evidence) evidenceByUrl.set(page.url, evidence);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get('query');
  if (!query) return Response.json([]);

  const limit = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : undefined;
  const tag = url.searchParams.get('tag')?.split(',');
  const results = await api.search(query, {
    tag,
    limit: Number.isInteger(limit) ? limit : undefined,
  });

  return Response.json(
    results.map((result) => {
      const evidence = evidenceByUrl.get(result.url.split('#')[0]);
      if (!evidence) return result;
      return { ...result, _chrona: evidence } as SortedResult & { _chrona: Evidence };
    }),
  );
}