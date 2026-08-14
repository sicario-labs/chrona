import { createRootRoute, Outlet } from '@tanstack/react-router';
import { TreeContextProvider } from 'chrona-ui/contexts/tree';
import { source } from '@/lib/source';

import { RootProvider } from 'chrona-ui/provider/tanstack';

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <div className="min-h-screen bg-background text-foreground antialiased font-sans">
      <RootProvider>
        <TreeContextProvider tree={source.getPageTree()}>
          <Outlet />
        </TreeContextProvider>
      </RootProvider>
    </div>
  );
}
