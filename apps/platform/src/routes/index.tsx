import { createFileRoute, Link } from '@tanstack/react-router'
import { HomeLayout } from '@chrona/base-ui/layouts/home'
import { buttonVariants } from '@chrona/base-ui/components/ui/button'
import { useSession, signIn } from '../lib/auth-client'

export const Route = createFileRoute('/')({
  component: Index,
})

function Index() {
  const { data: session, isPending } = useSession()

  return (
    <HomeLayout>
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <h1 className="text-5xl font-bold mb-6">Chrona Platform</h1>
        <p className="text-xl text-fd-muted-foreground max-w-2xl mb-8">
          The next-generation documentation platform with true codebase intelligence.
        </p>
        <div className="flex gap-4">
          {isPending ? (
            <button className={buttonVariants({ variant: 'primary' })} disabled>Loading...</button>
          ) : session ? (
            <Link to="/dashboard" className={buttonVariants({ variant: 'primary' })}>
              Go to Dashboard
            </Link>
          ) : (
            <button 
              className={buttonVariants({ variant: 'primary' })} 
              onClick={() => signIn.social({ provider: 'github' })}
            >
              Login with GitHub
            </button>
          )}
          <button className={buttonVariants({ variant: 'outline' })}>View Documentation</button>
        </div>
      </div>
    </HomeLayout>
  )
}

