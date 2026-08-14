import { createFileRoute, Outlet, Link, useNavigate } from '@tanstack/react-router'
import { GlassLayout } from '@chrona/base-ui/layouts/glass'
import { buttonVariants } from '@chrona/base-ui/components/ui/button'
import { LayoutDashboard, Settings, Layers, Code, Users, CreditCard, LogOut } from 'lucide-react'
import { useSession, signOut } from '../lib/auth-client'
import { useEffect } from 'react'

export const Route = createFileRoute('/_dashboard')({
  component: DashboardLayout,
})

function DashboardLayout() {
  const { data: session, isPending } = useSession()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isPending && !session) {
      navigate({ to: '/' })
    }
  }, [session, isPending, navigate])

  const sidebarItems = [
    { name: 'Overview', icon: <LayoutDashboard className="w-4 h-4" />, href: '/dashboard' },
    { name: 'Projects', icon: <Layers className="w-4 h-4" />, href: '/dashboard/projects' },
    { name: 'API Keys', icon: <Code className="w-4 h-4" />, href: '/org/api-keys' },
    { name: 'Members', icon: <Users className="w-4 h-4" />, href: '/org/members' },
    { name: 'Billing', icon: <CreditCard className="w-4 h-4" />, href: '/org/billing' },
    { name: 'Settings', icon: <Settings className="w-4 h-4" />, href: '/org/settings' },
  ]

  if (isPending) {
    return (
      <div className="flex items-center justify-center min-h-screen text-fd-muted-foreground">
        Loading session...
      </div>
    )
  }

  if (!session) {
    return null
  }

  return (
    <GlassLayout
      tree={{ name: 'Dashboard', children: [] }}
      nav={{
        title: 'Chrona Platform',
        children: (
          <div className="flex items-center justify-between w-full">
            <div className="flex gap-4">
              {sidebarItems.map((item) => (
                <Link
                  key={item.href}
                  to={item.href}
                  className="text-sm text-fd-muted-foreground hover:text-fd-foreground flex items-center gap-1.5"
                  activeProps={{ className: 'font-medium text-fd-foreground' }}
                >
                  {item.icon}
                  {item.name}
                </Link>
              ))}
            </div>

            <div className="flex items-center gap-3">
              {session.user.image && (
                <img
                  src={session.user.image}
                  alt={session.user.name || 'User'}
                  className="w-7 h-7 rounded-full border border-fd-border"
                />
              )}
              <span className="text-xs font-medium text-fd-muted-foreground">
                {session.user.name || session.user.email}
              </span>
              <button
                onClick={async () => {
                  await signOut()
                  navigate({ to: '/' })
                }}
                className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'h-8 px-2 text-fd-muted-foreground hover:text-fd-destructive' })}
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
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

