import { createFileRoute, Outlet } from '@tanstack/react-router';
import { HomeLayout } from 'chrona-ui/layouts/home';
import { baseOptions, linkItems } from '@/components/layouts/shared';
import {
  NavbarMenu,
  NavbarMenuContent,
  NavbarMenuLink,
  NavbarMenuTrigger,
} from 'chrona-ui/layouts/home/navbar';
import Link from 'chrona-core/link';
import { Book, ComponentIcon, Pencil, PlusIcon, Server } from 'lucide-react';

export const Route = createFileRoute('/_home')({
  component: HomeLayoutComponent,
});

function HomeLayoutComponent() {
  return (
    <HomeLayout
      {...baseOptions()}
      links={[
        {
          type: 'menu',
          on: 'menu',
          text: 'Documentation',
          items: [
            {
              text: 'Getting Started',
              url: '/docs',
              icon: <Book />,
            },
            {
              text: 'Components',
              url: '/docs/ui/components',
              icon: <ComponentIcon />,
            },
          ],
        },
        {
          type: 'custom',
          on: 'nav',
          children: (
            <NavbarMenu>
              <NavbarMenuTrigger>
                <a href="/docs">Documentation</a>
              </NavbarMenuTrigger>
              <NavbarMenuContent>
                <NavbarMenuLink href="/docs" className="md:row-span-2">
                  <div className="-mx-3 -mt-3">
                    <img
                      src="/banner.png"
                      alt="Preview"
                      className="rounded-t-lg object-cover"
                      style={{
                        maskImage: 'linear-gradient(to bottom,white 60%,transparent)',
                      }}
                    />
                  </div>
                  <p className="font-medium">Getting Started</p>
                  <p className="text-fd-muted-foreground text-sm">
                    Learn to use Chrona on your docs site.
                  </p>
                </NavbarMenuLink>

                <NavbarMenuLink href="/docs/ui/components" className="lg:col-start-2">
                  <ComponentIcon className="bg-fd-primary text-fd-primary-foreground p-1 mb-2 rounded-md" />
                  <p className="font-medium">Components</p>
                  <p className="text-fd-muted-foreground text-sm">
                    Add interactive experience to your docs.
                  </p>
                </NavbarMenuLink>

                <NavbarMenuLink href="/docs/openapi" className="lg:col-start-2">
                  <Server className="bg-fd-primary text-fd-primary-foreground p-1 mb-2 rounded-md" />
                  <p className="font-medium">OpenAPI</p>
                  <p className="text-fd-muted-foreground text-sm">
                    Generate interactive playgrounds and docs for your OpenAPI schema.
                  </p>
                </NavbarMenuLink>

                <NavbarMenuLink href="/docs/markdown" className="lg:col-start-3 lg:row-start-1">
                  <Pencil className="bg-fd-primary text-fd-primary-foreground p-1 mb-2 rounded-md" />
                  <p className="font-medium">Markdown</p>
                  <p className="text-fd-muted-foreground text-sm">
                    Learn the writing format/syntax of Chrona.
                  </p>
                </NavbarMenuLink>

                <NavbarMenuLink
                  href="/docs/manual-installation"
                  className="lg:col-start-3 lg:row-start-2"
                >
                  <PlusIcon className="bg-fd-primary text-fd-primary-foreground p-1 mb-2 rounded-md" />
                  <p className="font-medium">Manual Installation</p>
                  <p className="text-fd-muted-foreground text-sm">
                    Setup Chrona for your existing React.js app.
                  </p>
                </NavbarMenuLink>
              </NavbarMenuContent>
            </NavbarMenu>
          ),
        },
        ...linkItems,
      ]}
      className="dark:bg-neutral-950 dark:[--color-fd-background:var(--color-neutral-950)] [--color-fd-primary:var(--color-brand)]"
    >
      <Outlet />
    </HomeLayout>
  );
}
