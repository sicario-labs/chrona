import { createFileRoute, Link } from '@tanstack/react-router'
import { Plus, Settings, Github, CheckCircle2, Clock, ExternalLink, PenSquare, Layout, Globe, Activity, Layers, Bot, Zap, Search } from 'lucide-react'
import { buttonVariants } from '@chrona/base-ui/components/ui/button'

export const Route = createFileRoute('/_dashboard/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  const metrics = [
    { title: 'Active Projects', value: '2 Projects', change: '+1 this month', icon: Layers },
    { title: 'Global CDN Traffic', value: '14.2k requests', change: 'Sub-20ms latency', icon: Globe },
    { title: 'AI Assistant Queries', value: '382 queries', change: '99.4% resolution', icon: Bot },
    { title: 'Avg Edge Response', value: '18ms', change: '300+ Edge locations', icon: Zap },
  ]

  const projects = [
    {
      id: 'proj-1',
      name: 'Acme Documentation',
      repo: 'acme-corp/docs',
      branch: 'main',
      status: 'Live',
      url: 'docs.acme.com',
      lastDeploy: 'Deployed 2 hours ago',
      theme: 'Glass Layout',
      analytics: '1.2k views this week',
    },
    {
      id: 'proj-2',
      name: 'Acme API Reference',
      repo: 'acme-corp/api-spec',
      branch: 'production',
      status: 'Building',
      url: 'api.acme.com',
      lastDeploy: 'Building...',
      theme: 'Flux Layout',
      analytics: 'New project',
    }
  ]

  return (
    <div className="flex flex-col gap-8">
      {/* KPI Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((stat) => {
          const Icon = stat.icon
          return (
            <div
              key={stat.title}
              className="flex flex-col justify-between p-5 rounded-xl bg-zinc-950/80 border border-zinc-800/80 hover:border-amber-500/30 transition-all shadow-lg shadow-black/40 group"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-zinc-400">{stat.title}</span>
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform">
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-zinc-100 tracking-tight">{stat.value}</div>
                <div className="text-[11px] font-medium text-amber-400/80 mt-1">{stat.change}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Header & New Project CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-zinc-900">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Projects</h1>
          <p className="text-sm text-zinc-400 mt-0.5">Manage your active documentation sites, repos, and edge deployments.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Filter projects..."
              className="bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 placeholder:text-zinc-500 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:border-amber-500/50 transition-colors w-48"
            />
          </div>
          <button className={buttonVariants({ className: 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-zinc-950 font-semibold shadow-lg shadow-amber-500/20 gap-2 border-0' })}>
            <Plus className="w-4 h-4 stroke-[2.5]" />
            New Project
          </button>
        </div>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {projects.map((project) => (
          <div
            key={project.id}
            className="relative group flex flex-col justify-between p-6 rounded-2xl border border-zinc-800/80 bg-zinc-950/80 text-zinc-100 shadow-xl shadow-black/50 hover:border-amber-500/50 transition-all duration-200"
          >
            {/* Header: Name, Status, URL */}
            <div className="flex justify-between items-start mb-5">
              <div className="flex flex-col gap-1">
                <Link to="/dashboard" className="text-lg font-bold hover:text-amber-400 transition-colors">
                  {project.name}
                </Link>
                <a
                  href={`https://${project.url}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-amber-400 transition-colors"
                >
                  <Globe className="w-3.5 h-3.5 text-amber-500/80" />
                  {project.url}
                </a>
              </div>

              <div>
                {project.status === 'Live' ? (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20 shadow-sm shadow-emerald-500/10">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    {project.status}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20 shadow-sm shadow-amber-500/10">
                    <Clock className="w-3.5 h-3.5 animate-spin text-amber-400" />
                    {project.status}
                  </span>
                )}
              </div>
            </div>

            {/* Middle Details: Repo, Branch, Theme, Analytics */}
            <div className="grid grid-cols-2 gap-y-3 gap-x-4 p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800/50 mb-6 text-xs text-zinc-400">
              <div className="flex items-center gap-2">
                <Github className="w-4 h-4 text-zinc-400" />
                <span className="truncate">{project.repo} <span className="text-zinc-600">on</span> <code className="text-amber-400/90">{project.branch}</code></span>
              </div>
              <div className="flex items-center gap-2">
                <Layout className="w-4 h-4 text-amber-500/80" />
                <span>{project.theme}</span>
              </div>
              <div className="flex items-center gap-2 col-span-2">
                <Activity className="w-4 h-4 text-amber-500/80" />
                <span>{project.analytics}</span>
              </div>
            </div>

            {/* Footer: Last Deploy & Quick Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-zinc-800/50">
              <div className="text-xs font-medium text-zinc-500">
                {project.lastDeploy}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  className={buttonVariants({ variant: 'ghost', size: 'icon', className: 'h-8 w-8 text-zinc-400 hover:text-amber-400 hover:bg-amber-500/10' })}
                  title="Open Web Editor"
                >
                  <PenSquare className="w-4 h-4" />
                </button>
                <a
                  href={`https://${project.url}`}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonVariants({ variant: 'ghost', size: 'icon', className: 'h-8 w-8 text-zinc-400 hover:text-amber-400 hover:bg-amber-500/10' })}
                  title="View Live Site"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
                <Link
                  to="/dashboard/projects/$projectId"
                  params={{ projectId: project.id }}
                  className={buttonVariants({ variant: 'ghost', size: 'icon', className: 'h-8 w-8 text-zinc-400 hover:text-amber-400 hover:bg-amber-500/10' })}
                  title="Settings"
                >
                  <Settings className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
