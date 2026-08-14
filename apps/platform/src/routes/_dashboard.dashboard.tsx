import { createFileRoute, Link } from '@tanstack/react-router'
import { Plus, Settings, Github, CheckCircle2, Clock, ExternalLink, PenSquare, Layout, Globe, Activity } from 'lucide-react'
export const Route = createFileRoute('/_dashboard/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="text-fd-muted-foreground mt-1">Manage your documentation projects and deployments.</p>
        </div>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          New Project
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {projects.map((project) => (
          <div key={project.id} className="relative group flex flex-col justify-between p-6 rounded-xl border border-fd-border bg-fd-card text-fd-card-foreground shadow-sm hover:border-fd-primary/50 transition-colors">
            
            {/* Header: Name, Status, URL */}
            <div className="flex justify-between items-start mb-4">
              <div className="flex flex-col gap-1">
                <Link to={`/dashboard/${project.id}`} className="text-xl font-semibold hover:underline">
                  {project.name}
                </Link>
                <a href={`https://${project.url}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm text-fd-muted-foreground hover:text-fd-primary transition-colors">
                  <Globe className="w-3.5 h-3.5" />
                  {project.url}
                </a>
              </div>
              <div>
                {project.status === 'Live' ? (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-fd-success bg-fd-success/10 px-2.5 py-1 rounded-full border border-fd-success/20">
                    <CheckCircle2 className="w-3.5 h-3.5" /> {project.status}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-fd-warning bg-fd-warning/10 px-2.5 py-1 rounded-full border border-fd-warning/20">
                    <Clock className="w-3.5 h-3.5 animate-spin" /> {project.status}
                  </span>
                )}
              </div>
            </div>

            {/* Middle Details: Repo, Branch, Theme, Analytics */}
            <div className="grid grid-cols-2 gap-y-3 gap-x-4 mb-6">
              <div className="flex items-center gap-2 text-sm text-fd-muted-foreground">
                <Github className="w-4 h-4" />
                <span className="truncate">{project.repo} <span className="opacity-50">on</span> {project.branch}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-fd-muted-foreground">
                <Layout className="w-4 h-4" />
                <span>{project.theme}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-fd-muted-foreground">
                <Activity className="w-4 h-4" />
                <span>{project.analytics}</span>
              </div>
            </div>

            {/* Footer: Last Deploy & Quick Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-fd-border/50">
              <div className="text-xs text-fd-muted-foreground">
                {project.lastDeploy}
              </div>
              
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-fd-muted-foreground hover:text-fd-foreground" title="Open Web Editor">
                  <PenSquare className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-fd-muted-foreground hover:text-fd-foreground" title="View Live Site">
                  <ExternalLink className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-fd-muted-foreground hover:text-fd-foreground" title="Settings">
                  <Settings className="w-4 h-4" />
                </Button>
              </div>
            </div>

          </div>
        ))}
      </div>
    </div>
  )
}
