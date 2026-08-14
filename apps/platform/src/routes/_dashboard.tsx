import { createFileRoute, Outlet, Link } from '@tanstack/react-router'
import { GlassLayout } from '@chrona/base-ui/layouts/glass'
import { LayoutDashboard, Settings, Layers, Code, Users, CreditCard } from 'lucide-react'

export const Route = createFileRoute('/_dashboard')({
  component: DashboardLayout,
})

function DashboardLayout() {
  const sidebarItems = [
    { name: 'Overview', icon: <LayoutDashboard className="w-4 h-4" />, href: '/dashboard' },
    { name: 'Projects', icon: <Layers className="w-4 h-4" />, href: '/dashboard/projects' },
    { name: 'API Keys', icon: <Code className="w-4 h-4" />, href: '/org/api-keys' },
    { name: 'Members', icon: <Users className="w-4 h-4" />, href: '/org/members' },
    { name: 'Billing', icon: <CreditCard className="w-4 h-4" />, href: '/org/billing' },
    { name: 'Settings', icon: <Settings className="w-4 h-4" />, href: '/org/settings' },
  ]

  return (
    <GlassLayout
      tree={{ name: 'Dashboard', children: [] }}
      nav={{
        title: 'Chrona Platform',
        children: (
          <div className="flex gap-4">
            {sidebarItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className="text-sm text-fd-muted-foreground hover:text-fd-foreground"
                activeProps={{ className: 'font-medium text-fd-foreground' }}
              >
                {item.name}
              </Link>
            ))}
          </div>
        )
      }}
    >
      <div className="container mx-auto py-8">
        <Outlet />
      </div>
    </GlassLayout>
  )
}
