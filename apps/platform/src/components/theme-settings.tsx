import { useState, useEffect } from 'react'
import { Palette, Loader2, Save } from 'lucide-react'
import { buttonVariants } from '@chrona/base-ui/components/ui/button'

export function ThemeSettings({ projectId }: { projectId: string }) {
  const [config, setConfig] = useState<any>({
    primaryColor: '#3b82f6',
    logoUrl: '',
    darkMode: 'system'
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    async function fetchConfig() {
      try {
        const res = await fetch(`/api/projects/${projectId}`)
        if (res.ok) {
          const data = await res.json()
          if (data.themeConfig) {
            setConfig({ ...config, ...data.themeConfig })
          }
        }
      } catch (e) {
        console.error(e)
      } finally {
        setIsLoading(false)
      }
    }
    fetchConfig()
  }, [projectId])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/theme`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      })
      if (res.ok) {
        alert('Theme settings saved!')
      } else {
        alert('Failed to save theme settings')
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) return null

  return (
    <div className="rounded-xl border border-fd-border bg-fd-card text-fd-card-foreground shadow-sm overflow-hidden">
      <div className="p-6 border-b border-fd-border bg-fd-muted/30">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Palette className="w-5 h-5" />
          Theme & Branding
        </h2>
        <p className="text-sm text-fd-muted-foreground mt-1">
          Customize the look and feel of your documentation.
        </p>
      </div>

      <div className="p-6">
        <form onSubmit={handleSave} className="space-y-6 max-w-lg">
          <div className="space-y-2">
            <label className="text-sm font-medium">Primary Brand Color</label>
            <div className="flex items-center gap-3">
              <input 
                type="color" 
                value={config.primaryColor}
                onChange={e => setConfig({ ...config, primaryColor: e.target.value })}
                className="h-10 w-20 rounded-md border border-fd-input cursor-pointer"
              />
              <input 
                type="text" 
                value={config.primaryColor}
                onChange={e => setConfig({ ...config, primaryColor: e.target.value })}
                className="flex h-10 w-full rounded-md border border-fd-input bg-transparent px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Logo URL</label>
            <input 
              type="text" 
              value={config.logoUrl}
              onChange={e => setConfig({ ...config, logoUrl: e.target.value })}
              placeholder="https://example.com/logo.png"
              className="flex h-10 w-full rounded-md border border-fd-input bg-transparent px-3 py-2 text-sm"
            />
            {config.logoUrl && (
              <div className="mt-2 p-4 border rounded-md bg-fd-muted/50 flex items-center justify-center">
                <img src={config.logoUrl} alt="Logo preview" className="max-h-12" />
              </div>
            )}
          </div>

          <button 
            type="submit"
            disabled={isSaving}
            className={buttonVariants({ variant: 'primary' })}
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Save Changes
          </button>
        </form>
      </div>
    </div>
  )
}
