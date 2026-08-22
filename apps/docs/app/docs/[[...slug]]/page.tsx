import { DocsPage, DocsBody } from 'fumadocs-ui/page';
import { source } from '../../../lib/source';

export default async function Page(props: { params: Promise<{ slug?: string[] }> }) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) return null;
  const MDX = page.data.body;
  return (<DocsPage toc={page.data.toc}><DocsBody><MDX /></DocsBody></DocsPage>);
}

export async function generateStaticParams() {
  return source.generateParams();
}