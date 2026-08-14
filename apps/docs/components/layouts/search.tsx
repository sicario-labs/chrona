'use client';

import {
  SearchDialog,
  SearchDialogClose,
  SearchDialogContent,
  SearchDialogFooter,
  SearchDialogHeader,
  SearchDialogIcon,
  SearchDialogInput,
  SearchDialogList,
  SearchDialogOverlay,
  type SearchItemType,
  type SharedProps,
} from 'chrona-ui/components/dialog/search';
import { useDocsSearch } from 'chrona-core/search/client';
import { fetchClient } from 'chrona-core/search/client/fetch';
import { useMemo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from 'chrona-ui/components/ui/popover';
import { ArrowRight, ChevronDown, FileCode2 } from 'lucide-react';
import { buttonVariants } from 'chrona-ui/components/ui/button';
import { cn } from '@/lib/cn';
import { useTreeContext } from 'chrona-ui/contexts/tree';
import type { Item, Node } from 'chrona-core/page-tree';
import { useRouter } from 'next/navigation';
import type { SortedResult } from 'chrona-core/search';
import type { ChronaSymbolData } from '@chrona/intelligence';

type Evidence = ChronaSymbolData['_chrona'];
type EvidenceResult = SortedResult & { _chrona: Evidence };

const items = [
  {
    name: 'All',
    value: undefined,
  },
  {
    name: 'Framework',
    description: 'Only results about framework guides',
    value: 'framework',
  },
  {
    name: 'UI',
    description: 'Only results about Chrona UI',
    value: 'ui',
  },
  {
    name: 'Core',
    description: 'Only results about Chrona Core',
    value: 'headless',
  },
  {
    name: 'MDX',
    description: 'Only results about Chrona MDX',
    value: 'mdx',
  },
  {
    name: 'CLI',
    description: 'Only results about Chrona CLI',
    value: 'cli',
  },
];

export default function CustomSearchDialog(props: SharedProps) {
  const [open, setOpen] = useState(false);
  const [tag, setTag] = useState<string | undefined>();
  const { search, setSearch, query } = useDocsSearch({
    client: fetchClient({
      tag,
    }),
  });
  const { full } = useTreeContext();
  const router = useRouter();
  const searchMap = useMemo(() => {
    const map = new Map<string, Item>();

    function onNode(node: Node) {
      if (node.type === 'page' && typeof node.name === 'string') {
        map.set(node.name.toLowerCase(), node);
      } else if (node.type === 'folder') {
        if (node.index) onNode(node.index);
        for (const item of node.children) onNode(item);
      }
    }

    for (const item of full.children) onNode(item);
    return map;
  }, [full]);
  const pageTreeAction = useMemo<SearchItemType | undefined>(() => {
    if (search.length === 0) return;

    const normalized = search.toLowerCase();
    for (const [k, page] of searchMap) {
      if (!k.startsWith(normalized)) continue;

      return {
        id: 'quick-action',
        type: 'action',
        node: (
          <div className="inline-flex items-center gap-2 text-fd-muted-foreground">
            <ArrowRight className="size-4" />
            <p>
              Jump to <span className="font-medium text-fd-foreground">{page.name}</span>
            </p>
          </div>
        ),
        onSelect: () => router.push(page.url),
      };
    }
  }, [router, search, searchMap]);

  const searchItems = useMemo<SearchItemType[] | null>(() => {
    if (query.data === 'empty' && !pageTreeAction) return null;

    const data = Array.isArray(query.data) ? (query.data as EvidenceResult[]) : [];

    const items: SearchItemType[] = [
      ...(pageTreeAction ? [pageTreeAction] : []),
      ...data.map((result) => {
        if (!result._chrona) return result as SearchItemType;

        return {
          id: result.id,
          type: 'action',
          node: <SymbolEvidence evidence={result._chrona} onOpen={() => router.push(result.url)} />,
          onSelect: () => router.push(result.url),
        } as SearchItemType;
      }),
    ];

    return items;
  }, [query.data, pageTreeAction, router]);

  return (
    <SearchDialog search={search} onSearchChange={setSearch} isLoading={query.isLoading} {...props}>
      <SearchDialogOverlay />
      <SearchDialogContent>
        <SearchDialogHeader>
          <SearchDialogIcon />
          <SearchDialogInput />
          <SearchDialogClose />
        </SearchDialogHeader>
        <SearchDialogList items={searchItems} />
        <SearchDialogFooter className="flex flex-row flex-wrap gap-2 items-center">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
              className={buttonVariants({
                size: 'sm',
                color: 'ghost',
                className: '-m-1.5 me-auto',
              })}
            >
              <span className="text-fd-muted-foreground/80 me-2">Filter</span>
              {items.find((item) => item.value === tag)?.name}
              <ChevronDown className="size-3.5 text-fd-muted-foreground" />
            </PopoverTrigger>
            <PopoverContent className="flex flex-col p-1 gap-1" align="start">
              {items.map((item, i) => {
                const isSelected = item.value === tag;

                return (
                  <button
                    key={i}
                    onClick={() => {
                      setTag(item.value);
                      setOpen(false);
                    }}
                    className={cn(
                      'rounded-lg text-start px-2 py-1.5',
                      isSelected
                        ? 'text-fd-primary bg-fd-primary/10'
                        : 'hover:text-fd-accent-foreground hover:bg-fd-accent',
                    )}
                  >
                    <p className="font-medium mb-0.5">{item.name}</p>
                    <p className="text-xs opacity-70">{item.description}</p>
                  </button>
                );
              })}
            </PopoverContent>
          </Popover>
        </SearchDialogFooter>
      </SearchDialogContent>
    </SearchDialog>
  );
}

function SymbolEvidence({
  evidence,
  onOpen,
}: {
  evidence: Evidence;
  onOpen: () => void;
}) {
  const refPath = evidence.filePath.replace(/^.*\/fumadocs-dev\//, '');
  const neighbors = (evidence.graph ?? []).slice(0, 4);

  return (
    <div className="flex flex-col gap-1.5 py-1">
      <div className="flex items-center gap-2 min-w-0">
        <span className="rounded-md border px-1.5 py-0.5 text-xs font-medium text-fd-primary bg-fd-primary/10">
          {evidence.kind}
        </span>
        <code className="truncate font-medium text-fd-foreground">{evidence.name}</code>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="ms-auto shrink-0 inline-flex items-center gap-1 text-xs text-fd-muted-foreground hover:text-fd-accent-foreground"
        >
          <FileCode2 className="size-3.5" />
          {refPath}
        </button>
      </div>

      {evidence.aliases.length > 0 && (
        <p className="text-xs text-fd-muted-foreground truncate">
          aliases: {evidence.aliases.join(', ')}
        </p>
      )}

      {neighbors.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-xs text-fd-muted-foreground">neighbors:</span>
          {neighbors.map((neighbor) => (
            <span
              key={neighbor.id}
              className="rounded-md bg-fd-secondary px-1.5 py-0.5 text-xs text-fd-secondary-foreground"
            >
              {neighbor.name}
            </span>
          ))}
        </div>
      )}

      {evidence.references.length > 0 && (
        <p className="text-xs text-fd-muted-foreground">
          {evidence.references.length} reference{evidence.references.length === 1 ? '' : 's'} in
          repository
        </p>
      )}
    </div>
  );
}
