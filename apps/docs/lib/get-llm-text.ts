import { type Page } from '@/lib/source';
import { getSection } from './source/navigation';

export async function getLLMText(page: Page) {
  if (page.type !== 'docs' || !('getText' in page.data)) return '';

  const section = getSection(page.slugs[0]);
  const category =
    {
      framework: 'Chrona (Framework Mode)',
      ui: 'Chrona UI (the default theme of Chrona)',
      headless: 'Chrona Core (the core library of Chrona)',
      mdx: 'Chrona MDX (the built-in content source)',
      cli: 'Chrona CLI (the CLI tool for automating Chrona apps)',
    }[section] ?? section;

  let processed: string;
  try {
    processed = await page.data.getText('processed');
  } catch {
    return '';
  }

  return `# ${category}: ${page.data.title}
URL: ${page.url}
Source: https://raw.githubusercontent.com/chrona/chrona/refs/heads/main/apps/docs/content/docs/${page.path}

${page.data.description ?? ''}
        
${processed}`;
}
