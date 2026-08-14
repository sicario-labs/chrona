import { createFileRoute, Outlet, Link, useNavigate } from '@tanstack/react-router'
import { GlassLayout } from '@chrona/base-ui/layouts/glass'
import { buttonVariants } from '@chrona/base-ui/components/ui/button'
import { LayoutDashboard, Settings, Layers, Code, Users, CreditCard, LogOut, Search, Command, Flame } from 'lucide-react'
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
      <div className="flex items-center justify-center min-h-screen text-amber-500/80 bg-zinc-950 font-medium">
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
        title: (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Flame className="w-4 h-4 text-zinc-950 stroke-[2.5]" />
            </div>
            <span className="font-bold text-base tracking-tight bg-gradient-to-r from-amber-400 via-amber-200 to-orange-400 bg-clip-text text-transparent">
              Chrona
            </span>
          </div>
        ),
        children: (
          <div className="flex items-center justify-between w-full gap-6">
            {/* Nav Tabs */}
            <div className="flex items-center gap-1 bg-zinc-900/60 p-1 rounded-xl border border-zinc-800/80">
              {sidebarItems.map((item) => (
                <Link
                  key={item.href}
                  to={item.href}
                  className="text-xs font-medium text-zinc-400 hover:text-amber-400 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5"
                  activeProps={{ className: 'text-amber-400 bg-amber-500/10 font-semibold border border-amber-500/20 shadow-sm shadow-amber-500/10' }}
                >
                  {item.icon}
                  {item.name}
                </Link>
              ))}
            </div>

            {/* Right Header Controls */}
            <div className="flex items-center gap-3">
              {/* Search Bar */}
              <button className="hidden md:flex items-center gap-2 bg-zinc-900/80 hover:bg-zinc-900 border border-zinc-800 text-xs text-zinc-400 px-3 py-1.5 rounded-lg transition-colors">
                <Search className="w-3.5 h-3.5 text-amber-500" />
                <span>Search projects & docs...</span>
                <kbd className="ml-2 inline-flex items-center gap-0.5 rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono text-zinc-300">
                  <Command className="w-2.5 h-2.5" />K
                </kbd>
              </button>

              {/* User Profile Pill */}
              <div className="flex items-center gap-2.5 pl-2 border-l border-zinc-800">
                <div className="relative">
                  {session?.user?.image ? (
                    <img
                      src={session.user.image}
                      alt={session.user.name ?? 'User'}
                      className="w-7 h-7 rounded-full border border-amber-500/30 object-cover"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-xs font-bold text-amber-400">
                      {session?.user?.name?.charAt(0) || session?.user?.email?.charAt(0) || 'U'}
                    </div>
                  )}
                  <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-zinc-950" />
                </div>
                <span className="hidden sm:inline-block text-xs font-medium text-zinc-300 truncate max-w-[120px]">
                  {session?.user?.name || session?.user?.email || 'Developer'}
                </span>
                <button
                  onClick={async () => {
                    await signOut()
                    navigate({ to: '/' })
                  }}
                  className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'h-8 w-8 p-0 text-zinc-400 hover:text-amber-400 hover:bg-amber-500/10' })}
                  title="Sign Out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )
      }}
    >
      <div className="container mx-auto py-8 px-4">
        <Outlet />
      </div>
    </GlassLayout>
  )
}
