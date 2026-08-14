import { useState, useEffect } from 'react'
import { Activity, Search, MousePointerClick } from 'lucide-react'

export function AnalyticsDashboard({ projectId }: { projectId: string }) {
  const [data, setData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        const res = await fetch(`/api/analytics/dashboard/${projectId}`)
        if (res.ok) {
          setData(await res.json())
        }
      } catch (e) {
        console.error(e)
      } finally {
        setIsLoading(false)
      }
    }
    fetchAnalytics()
  }, [projectId])

  if (isLoading) {
    return <div className="h-48 flex items-center justify-center text-fd-muted-foreground border rounded-xl bg-fd-card">Loading analytics...</div>
  }

  if (!data) return null

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-fd-border bg-fd-card p-6 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-medium text-fd-muted-foreground mb-2">
            <Activity className="w-4 h-4" /> Total Views
          </div>
          <div className="text-3xl font-bold">{data.totalViews || 0}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-xl border border-fd-border bg-fd-card shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-fd-muted/30">
            <h3 className="font-semibold flex items-center gap-2"><MousePointerClick className="w-4 h-4" /> Top Pages</h3>
          </div>
          <div className="p-0">
            {data.topPages?.length === 0 ? (
              <div className="p-6 text-center text-sm text-fd-muted-foreground">No page views yet</div>
            ) : (
              <ul className="divide-y">
                {data.topPages?.map((page: any, i: number) => (
                  <li key={i} className="flex items-center justify-between p-4 text-sm">
                    <span className="font-mono text-fd-muted-foreground">{page.path}</span>
                    <span className="font-medium">{page.views} views</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-fd-border bg-fd-card shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-fd-muted/30">
            <h3 className="font-semibold flex items-center gap-2"><Search className="w-4 h-4" /> Top Searches</h3>
          </div>
          <div className="p-0">
            {data.topSearches?.length === 0 ? (
              <div className="p-6 text-center text-sm text-fd-muted-foreground">No searches yet</div>
            ) : (
              <ul className="divide-y">
                {data.topSearches?.map((search: any, i: number) => (
                  <li key={i} className="flex items-center justify-between p-4 text-sm">
                    <span>"{search.query}"</span>
                    <span className="font-medium text-fd-muted-foreground">{search.count} times</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
