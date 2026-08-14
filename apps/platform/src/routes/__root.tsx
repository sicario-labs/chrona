import { createRootRoute, Outlet } from '@tanstack/react-router'
import { RootProvider } from '@chrona/base-ui/provider/tanstack'

export const Route = createRootRoute({
  component: () => (
    <RootProvider>
      <Outlet />
    </RootProvider>
  ),
})
