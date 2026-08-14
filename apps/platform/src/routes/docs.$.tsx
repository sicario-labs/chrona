import { createFileRoute } from '@tanstack/react-router'
import { DocsLayout } from '@chrona/base-ui/layouts/docs'


export const Route = createFileRoute('/docs/$')({
  component: DynamicDocViewer,
  loader: async ({ params }) => {
    const splat = (params as any)['_splat'] || 'index'
    
    // Extract project slug from subdomain (e.g. acme.chrona.dev -> acme)
    // If we are on localhost, default to a demo project for development
    let projectSlug = 'demo'
    if (typeof window !== 'undefined') {
      const host = window.location.hostname
      if (host.includes('.chrona.dev')) {
        projectSlug = host.replace('.chrona.dev', '')
      } else if (host.endsWith('.localhost')) {
        projectSlug = host.replace('.localhost', '')
      } else if (host === 'localhost' || host === '127.0.0.1') {
        projectSlug = 'demo'
      } else {
        // Custom domain (e.g. docs.acme.com)
        // In reality, we'd lookup the project by custom domain
        projectSlug = 'demo'
      }
    }
    
    // In a real app we'd fetch from our API using the slug to find the projectId.
    // For now, we mock the ID mapping:
    const projectId = projectSlug === 'demo' ? 'demo-project-id' : `proj-${projectSlug}`
    
    const [treeRes, pageRes, projectRes] = await Promise.all([
      fetch(`/api/builds/${projectId}/tree.json`),
      fetch(`/api/builds/${projectId}/${splat}.json`),
      fetch(`/api/projects/${projectId}`)
    ])
    
    if (!treeRes.ok) throw new Error('Failed to fetch sidebar tree')
    if (!pageRes.ok) throw new Error('Page not found')
    
    return {
      tree: await treeRes.json(),
      page: await pageRes.json(),
      project: projectRes.ok ? await projectRes.json() : null,
      projectSlug
    }
  },
  pendingComponent: () => <div className="flex h-screen items-center justify-center">Loading Docs...</div>,
  errorComponent: () => (
    <div className="flex h-screen flex-col items-center justify-center">
      <h1 className="text-2xl font-bold">404 - Page Not Found</h1>
      <p className="text-gray-500">The requested documentation page could not be found.</p>
    </div>
  )
})

import * as React from 'react'
import * as _jsx_runtime from 'react/jsx-runtime'

function useMDXComponent(code: string) {
  return React.useMemo(() => {
    // Inject the necessary React runtimes into the function's scope
    // The compiled MDX expects `_jsx_runtime` or `react` depending on config.
    const fn = new Function('React', '_jsx_runtime', `${code}; return MDXContent;`)
    return fn(React, _jsx_runtime)
  }, [code])
}

function hexToHsl(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return null
  
  let r = parseInt(result[1], 16) / 255
  let g = parseInt(result[2], 16) / 255
  let b = parseInt(result[3], 16) / 255
  
  let max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0, l = (max + min) / 2
  
  if (max !== min) {
    let d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch(max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      case b: h = (r - g) / d + 4; break
    }
    h /= 6
  }
  
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

function DynamicDocViewer() {
  const { tree, page, projectSlug, project } = Route.useLoaderData() as any
  const MDXContent = useMDXComponent(page.compiled)

  const themeConfig = project?.themeConfig || {}
  const primaryHsl = themeConfig.primaryColor ? hexToHsl(themeConfig.primaryColor) : null

  return (
    <>
      {primaryHsl && (
        <style dangerouslySetInnerHTML={{__html: `
          :root {
            --primary: ${primaryHsl};
            --primary-foreground: 0 0% 100%;
          }
          .dark {
            --primary: ${primaryHsl};
            --primary-foreground: 0 0% 100%;
          }
        `}} />
      )}
      <DocsLayout
        tree={tree}
        nav={{ 
          title: projectSlug,
          // If we had a custom logo component in nav, we could pass it here!
        }}
      >
      <div className="prose prose-slate dark:prose-invert max-w-none">
        <h1>{page.frontmatter?.title || 'Untitled'}</h1>
        
        <div className="mt-8">
          <MDXContent />
        </div>
      </div>
    </DocsLayout>
    </>
  )
}
