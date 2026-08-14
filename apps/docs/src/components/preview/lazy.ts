'use client';
import React from 'react';

export const DynamicCodeBlock = React.lazy(() => import('./dynamic-codeblock'));
export const Banner = React.lazy(() =>
  import('chrona-ui/components/banner').then((res) => ({ default: res.Banner })),
);
export const InlineTOC = React.lazy(() =>
  import('chrona-ui/components/inline-toc').then((res) => ({ default: res.InlineTOC })),
);

export const File = React.lazy(() => import('chrona-ui/components/files').then((res) => ({ default: res.File })));
export const Files = React.lazy(() => import('chrona-ui/components/files').then((res) => ({ default: res.Files })));
export const Folder = React.lazy(() =>
  import('chrona-ui/components/files').then((res) => ({ default: res.Folder })),
);

export const ImageZoom = React.lazy(() =>
  import('chrona-ui/components/image-zoom').then((res) => ({ default: res.ImageZoom })),
);

export const GraphView = React.lazy(() =>
  import('@/components/graph-view').then((res) => ({ default: res.GraphView })),
);
