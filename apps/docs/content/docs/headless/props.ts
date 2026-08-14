import type * as Breadcrumb from 'chrona-core/breadcrumb';
import type * as TOC from 'chrona-core/toc';
import type * as Search from 'chrona-core/search';
import type * as PageTree from 'chrona-core/page-tree';
import type * as MDX from 'chrona-core/mdx-plugins';

export type SortedResult = Search.SortedResult;

export type StructureOptions = MDX.StructureOptions;

export type BreadcrumbItem = Breadcrumb.BreadcrumbItem;

export type ScrollProviderProps = TOC.ScrollProviderProps;
export type AnchorProviderProps = TOC.AnchorProviderProps;

export type TOCItemType = TOC.TOCItemType;

export type PageTreeItem = PageTree.Item;
export type PageTreeFolder = PageTree.Folder;
export type PageTreeRoot = PageTree.Root;
export type PageTreeSeparator = PageTree.Separator;

export type RemarkImageOptions = MDX.RemarkImageOptions;
