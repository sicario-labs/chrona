import { type OramaDocument, sync } from 'chrona-core/search/orama-cloud';
import fs from 'node:fs/promises';
import { DataSourceId, isAdmin, orama } from '../src/lib/orama/client.ts';

export async function updateSearchIndexes(): Promise<void> {
  if (!isAdmin) {
    console.log('no private API key for Orama found, skipping');
    return;
  }

  const content = await fs.readFile('dist/static-search.json');
  const records = JSON.parse(content.toString()) as OramaDocument[];

  await sync(orama, {
    index: DataSourceId,
    documents: records,
  });

  console.log(`search updated: ${records.length} records`);
}
