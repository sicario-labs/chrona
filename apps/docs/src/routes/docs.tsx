import { createFileRoute, Outlet } from '@tanstack/react-router';
import { DefaultLayout } from '@/components/layouts/default';

export const Route = createFileRoute('/docs')({
  component: DocsLayoutComponent,
});

function DocsLayoutComponent() {
  return (
    <DefaultLayout>
      <Outlet />
    </DefaultLayout>
  );
}
