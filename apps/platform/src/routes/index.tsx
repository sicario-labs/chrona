import { createFileRoute } from '@tanstack/react-router'
import { HomeLayout } from '@chrona/base-ui/layouts/home'
import { NavbarMenu, NavbarMenuTrigger } from '@chrona/base-ui/layouts/home/navbar'
import { Button } from '@chrona/base-ui/components/ui/button'

export const Route = createFileRoute('/')({
  component: Index,
})

function Index() {
  return (
    <HomeLayout>
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <h1 className="text-5xl font-bold mb-6">Chrona Platform</h1>
        <p className="text-xl text-fd-muted-foreground max-w-2xl mb-8">
          The next-generation documentation platform with true codebase intelligence.
        </p>
        <div className="flex gap-4">
          <Button>Get Started</Button>
          <Button variant="outline">View Documentation</Button>
        </div>
      </div>
    </HomeLayout>
  )
}
