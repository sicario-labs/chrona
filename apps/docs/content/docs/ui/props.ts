import type { Accordion, Accordions } from 'chrona-ui/components/accordion';
import type { Callout } from 'chrona-ui/components/callout';
import type { File, Folder } from 'chrona-ui/components/files';
import type { InlineTOC } from 'chrona-ui/components/inline-toc';
import type { TypeTable } from 'chrona-ui/components/type-table';
import type { Card } from 'chrona-ui/components/card';
import type { DocsLayoutProps } from 'chrona-ui/layouts/docs';
import type { ComponentProps, ComponentPropsWithoutRef } from 'react';
import type { AutoTypeTable } from 'chrona-typescript/ui';
import type { RootProviderProps } from 'chrona-ui/provider/base';

export type AccordionsProps = Omit<
  ComponentPropsWithoutRef<typeof Accordions>,
  keyof ComponentPropsWithoutRef<'div'> | 'value' | 'onValueChange'
>;

export type AccordionProps = Omit<
  ComponentPropsWithoutRef<typeof Accordion>,
  keyof ComponentPropsWithoutRef<'div'>
>;

export type CalloutProps = Omit<
  ComponentPropsWithoutRef<typeof Callout>,
  keyof ComponentPropsWithoutRef<'div'>
>;

export type FileProps = Omit<
  ComponentPropsWithoutRef<typeof File>,
  keyof ComponentPropsWithoutRef<'div'>
>;

export type FolderProps = Omit<
  ComponentPropsWithoutRef<typeof Folder>,
  keyof ComponentPropsWithoutRef<'div'>
>;

export type InlineTOCProps = Omit<
  ComponentPropsWithoutRef<typeof InlineTOC>,
  keyof ComponentPropsWithoutRef<'div'>
>;

export type CardProps = Omit<
  ComponentPropsWithoutRef<typeof Card>,
  keyof Omit<ComponentProps<'a'>, 'href'>
>;

export type TypeTableProps = Omit<
  ComponentPropsWithoutRef<typeof TypeTable>,
  keyof ComponentProps<'div'>
>;

export type ObjectTypeProps = ComponentPropsWithoutRef<typeof TypeTable>['type'][string];

export type { DocsLayoutProps };

export type NavbarProps = NonNullable<DocsLayoutProps['nav']>;

export type SidebarProps = Omit<
  NonNullable<DocsLayoutProps['sidebar']>,
  keyof ComponentProps<'aside'>
>;

export type AutoTypeTableProps = Omit<
  ComponentPropsWithoutRef<typeof AutoTypeTable>,
  keyof ComponentProps<'div'>
>;

export type SearchProps = Required<RootProviderProps>['search'];

export type { BaseLayoutProps } from 'chrona-ui/layouts/shared';
