import { createFileRoute } from '@tanstack/react-router';
import { useEffect, type ComponentProps, type FC, type ReactNode } from 'react';
import * as Twoslash from 'chrona-twoslash/ui';
import { Callout } from 'chrona-ui/components/callout';
import { TypeTable } from 'chrona-ui/components/type-table';
import * as Preview from '@/components/preview';
import { source } from '@/lib/source';
import { Wrapper } from '@/components/preview/wrapper';
import { Mermaid } from '@/components/mdx/mermaid';
import { Feedback, FeedbackText } from '@/components/feedback/client';
import { onBlockFeedbackAction, onPageFeedbackAction, owner, repo } from '@/lib/github';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import Link from 'chrona-core/link';
import { findSiblings } from 'chrona-core/page-tree';
import { Card, Cards } from 'chrona-ui/components/card';
import { getMDXComponents } from '@/components/mdx';
import { Banner } from 'chrona-ui/components/banner';
import { Installation } from '@/components/preview/installation';
import { Customization } from '@/components/preview/customization';
import {
  DocsBody,
  DocsPage,
  PageLastUpdate,
  MarkdownCopyButton,
  ViewOptionsPopover,
} from 'chrona-ui/layouts/docs/page';
import { NotFound } from '@/components/layouts/not-found';
// Stubs for lazy OpenAPI/AsyncAPI/GraphQL pages
const OpenAPIPageLazy = (props: any) => <div>OpenAPI Page</div>;
const AsyncAPIPageLazy = (props: any) => <div>AsyncAPI Page</div>;
const GraphQLPageLazy = (props: any) => <div>GraphQL Page</div>;
const RepositoryPage = (props: any) => <div>Repository Page</div>;
const PathUtils = { dirname: (path: string) => path.split('/').slice(0, -1).join('/') };
const getSuggestions = async (_slug: string): Promise<any[]> => [];

export const Route = createFileRoute('/docs/$')({
  loader: async ({ params }) => {
    const slug = (params as any)._splat?.split('/') ?? [];
    const page = source.getPage(slug);
    if (!page) return { page: null, loadedData: null };

    if (!(page.type as string) || (page.type as string) === 'page' || (page.type as string) === 'mdx') {
      const loadedData = 'load' in page.data ? await page.data.load() : page.data;
      return { page, loadedData };
    }

    return { page, loadedData: null };
  },
  component: DocsPageContainer,
});

function PreviewRenderer({ preview }: { preview: string }): ReactNode {
  if (preview && preview in Preview) {
    const Comp = Preview[preview as keyof typeof Preview];
    return <Comp />;
  }
  return null;
}

function DocsPageContainer() {
  const { page, loadedData } = Route.useLoaderData();
  const params = Route.useParams();

  useEffect(() => {
    if (page?.data?.title) {
      document.title = `${page.data.title} - Chrona`;
    }
  }, [page]);

  if (!page) {
    return (
      <NotFound
        getSuggestions={async () => (params._splat ? getSuggestions(params._splat) : [])}
      />
    );
  }

  if (page.type === 'openapi') {
    return (
      <DocsPage full>
        <h1 className="text-[1.75em] font-semibold">{page.data.title}</h1>
        <DocsBody>
          <OpenAPIPageLazy {...page.data.getOpenAPIPageProps()} />
        </DocsBody>
      </DocsPage>
    );
  }

  if (page.type === 'asyncapi') {
    return (
      <DocsPage full>
        <h1 className="text-[1.75em] font-semibold">{page.data.title}</h1>
        <DocsBody>
          <AsyncAPIPageLazy {...page.data.getAsyncAPIPageProps()} />
        </DocsBody>
      </DocsPage>
    );
  }

  if (page.type === 'graphql') {
    return (
      <DocsPage full>
        <h1 className="text-[1.75em] font-semibold">{page.data.title}</h1>
        <DocsBody>
          <GraphQLPageLazy {...page.data.getGraphQLPageProps()} />
        </DocsBody>
      </DocsPage>
    );
  }

  if (page.type === 'repository') {
    return (
      <DocsPage full>
        <h1 className="text-[1.75em] font-semibold">{page.data.title}</h1>
        <DocsBody>
          <RepositoryPage data={page.data} />
        </DocsBody>
      </DocsPage>
    );
  }

  if (loadedData) {
    const { body: Mdx, toc, lastModified } = loadedData as any;
    return (
      <DocsPage toc={toc}>
        <h1 className="text-[1.75em] font-semibold">{page.data.title}</h1>
        <p className="text-lg text-fd-muted-foreground mb-2">{page.data.description}</p>
        <div className="flex flex-row flex-wrap gap-2 items-center border-b pb-6 mb-4">
          <MarkdownCopyButton markdownUrl={`${page.url}.mdx`} />
          <ViewOptionsPopover
            markdownUrl={`${page.url}.mdx`}
            githubUrl={`https://github.com/${owner}/${repo}/blob/dev/apps/docs/content/docs/${page.path}`}
          />
        </div>
        <div className="prose flex-1 text-fd-foreground/90">
          {page.data.preview && <PreviewRenderer preview={page.data.preview} />}
          <FeedbackText onSendAction={onBlockFeedbackAction}>
            <Mdx
              components={getMDXComponents({
                ...Twoslash,
                a({ href, ...props }) {
                  const found = source.getPageByHref(href ?? '', {
                    dir: PathUtils.dirname(page.path),
                  });

                  if (!found) return <Link href={href} {...props} />;

                  return (
                    <HoverCard>
                      <HoverCardTrigger
                        href={found.hash ? `${found.page.url}#${found.hash}` : found.page.url}
                        {...props}
                      >
                        {props.children}
                      </HoverCardTrigger>
                      <HoverCardContent className="text-sm">
                        <p className="font-medium">{found.page.data.title}</p>
                        <p className="text-fd-muted-foreground">{found.page.data.description}</p>
                      </HoverCardContent>
                    </HoverCard>
                  );
                },
                Banner,
                Mermaid,
                TypeTable,
                Wrapper,
                blockquote: Callout as unknown as FC<ComponentProps<'blockquote'>>,
                DocsCategory: ({ url }) => {
                  return <DocsCategory url={url ?? page.url} />;
                },
                Installation,
                Customization,
              })}
            />
          </FeedbackText>
          {page.data.index ? <DocsCategory url={page.url} /> : null}
        </div>
        <Feedback onSendAction={onPageFeedbackAction} />
        {lastModified && <PageLastUpdate date={lastModified} />}
      </DocsPage>
    );
  }

  return null;
}

function DocsCategory({ url }: { url: string }) {
  return (
    <Cards>
      {findSiblings(source.getPageTree(), url).map((item) => {
        if (item.type === 'separator') return;
        if (item.type === 'folder') {
          if (!item.index) return;
          item = item.index;
        }

        return (
          <Card key={item.url} title={item.name} href={item.url}>
            {item.description}
          </Card>
        );
      })}
    </Cards>
  );
}
