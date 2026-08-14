import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { Globe, ShieldCheck, ShieldAlert, Loader2, RefreshCw } from 'lucide-react'
import { buttonVariants } from '@chrona/base-ui/components/ui/button'
import { AnalyticsDashboard } from '../../components/analytics'
import { ThemeSettings } from '../../components/theme-settings'

export const Route = createFileRoute('/_dashboard/dashboard/projects/$projectId')({
  component: ProjectSettingsPage,
})

function ProjectSettingsPage() {
  const { projectId } = Route.useParams()
  const [domain, setDomain] = useState('')
  const [status, setStatus] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const fetchStatus = async () => {
    setIsRefreshing(true)
    try {
      const res = await fetch(`/api/domains/${projectId}`)
      if (res.ok) {
        const data = await res.json()
        setStatus(data)
        if (data.customDomain) setDomain(data.customDomain)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    fetchStatus()
  }, [projectId])

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    try {
      const res = await fetch(`/api/domains/${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain })
      })
      if (res.ok) {
        await fetchStatus()
      } else {
        const err = await res.json()
        alert('Failed: ' + (err.error || 'Unknown error'))
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }

  const handleVerify = async () => {
    setIsRefreshing(true)
    try {
      await fetch(`/api/domains/${projectId}/verify`, { method: 'POST' })
      await fetchStatus()
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <div className="flex flex-col gap-8 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Project Overview</h1>
        <p className="text-fd-muted-foreground mt-1">Analytics, configuration, and custom domains.</p>
      </div>

      <AnalyticsDashboard projectId={projectId} />

      <ThemeSettings projectId={projectId} />

      <div className="rounded-xl border border-fd-border bg-fd-card text-fd-card-foreground shadow-sm overflow-hidden">
        <div className="p-6 border-b border-fd-border bg-fd-muted/30 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Globe className="w-5 h-5" />
              Custom Domain
            </h2>
            <p className="text-sm text-fd-muted-foreground mt-1">
              Serve your documentation from your own custom domain name.
            </p>
          </div>
          <button 
            onClick={fetchStatus}
            disabled={isRefreshing}
            className={buttonVariants({ variant: 'outline', size: 'icon' })}
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="p-6">
          <form onSubmit={handleAddDomain} className="flex gap-4 items-end max-w-lg">
            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium">Domain Name</label>
              <input 
                type="text" 
                value={domain}
                onChange={e => setDomain(e.target.value)}
                placeholder="docs.acme.com"
                className="flex h-10 w-full rounded-md border border-fd-input bg-transparent px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <button 
              type="submit"
              disabled={isLoading || !domain}
              className={buttonVariants({ variant: 'primary' })}
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {status?.customDomain ? 'Update Domain' : 'Add Domain'}
            </button>
          </form>

          {status?.customDomain && (
            <div className="mt-8 border rounded-lg p-5 bg-fd-background">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium text-lg flex items-center gap-2">
                    {status.customDomain}
                    {status.status === 'active' ? (
                      <span className="flex items-center gap-1 text-xs text-fd-success bg-fd-success/10 px-2 py-0.5 rounded-full border border-fd-success/20">
                        <ShieldCheck className="w-3.5 h-3.5" /> Active
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-fd-warning bg-fd-warning/10 px-2 py-0.5 rounded-full border border-fd-warning/20">
                        <ShieldAlert className="w-3.5 h-3.5" /> {status.status || 'Pending Verification'}
                      </span>
                    )}
                  </h3>
                  <p className="text-sm text-fd-muted-foreground mt-1">
                    CNAME to <strong>chrona-platform.pages.dev</strong>
                  </p>
                </div>
              </div>

              {status.status !== 'active' && status.txtName && (
                <div className="mt-6 space-y-4">
                  <div className="p-4 bg-fd-warning/10 border border-fd-warning/20 rounded-md text-sm">
                    <p className="font-medium text-fd-warning mb-2">Verify Domain Ownership</p>
                    <p className="text-fd-muted-foreground mb-4">
                      Please add the following TXT record to your DNS provider to verify you own this domain and issue an SSL certificate.
                    </p>
                    
                    <div className="space-y-3">
                      <div>
                        <span className="text-xs font-semibold text-fd-muted-foreground uppercase tracking-wider">Type</span>
                        <div className="mt-1 font-mono bg-fd-muted p-2 rounded text-sm">TXT</div>
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-fd-muted-foreground uppercase tracking-wider">Name</span>
                        <div className="mt-1 font-mono bg-fd-muted p-2 rounded text-sm break-all">{status.txtName}</div>
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-fd-muted-foreground uppercase tracking-wider">Value</span>
                        <div className="mt-1 font-mono bg-fd-muted p-2 rounded text-sm break-all">{status.txtValue}</div>
                      </div>
                    </div>

                    <div className="mt-5">
                      <button onClick={handleVerify} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                        <RefreshCw className={`w-3.5 h-3.5 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                        Check Verification
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
