import { source } from '@/lib/source';
import * as fs from 'fs';
import * as path from 'path';

async function generate() {
  const pages = source.getPages();
  const index = await Promise.all(
    pages.map(async (page) => {
      const data = 'load' in page.data ? await page.data.load() : page.data;
      return {
        id: page.url,
        title: (page.data as any).title ?? '',
        description: (page.data as any).description ?? '',
        url: page.url,
        structuredData: (data as any).structuredData,
      };
    })
  );

  const outDir = path.resolve(process.cwd(), 'dist');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(outDir, 'static-search.json'),
    JSON.stringify(index)
  );

  console.log('Search index generated at dist/static-search.json');
}

generate().catch(console.error);
