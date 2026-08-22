import { DocsPage, DocsBody } from 'fumadocs-ui/page';
import { docs } from '../../../source.config';
export default async function Page({ params }: { params: { slug?: string[] } }) {
  const page = docs.getPage(params.slug);
  if (!page) return null;
  const MDX = page.data.body;
  return (<DocsPage toc={page.data.toc}><DocsBody><MDX /></DocsBody></DocsPage>);
}
