import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { buttonVariants } from '@chrona/base-ui/components/ui/button'
import { useSession, signIn } from '../lib/auth-client'
import { Flame, Github, ArrowRight } from 'lucide-react'
import { useEffect } from 'react'

export const Route = createFileRoute('/')({
  component: Index,
})

function Index() {
  const { data: session, isPending } = useSession()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isPending && session) {
      navigate({ to: '/dashboard' })
    }
  }, [session, isPending, navigate])

  if (isPending) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-950 text-amber-500 font-medium">
        Loading...
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 px-4 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Login Card */}
      <div className="w-full max-w-md p-8 rounded-2xl bg-zinc-950/80 border border-zinc-800/80 backdrop-blur-xl shadow-2xl shadow-black/80 text-center relative z-10">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-amber-500/20">
          <Flame className="w-6 h-6 text-zinc-950 stroke-[2.5]" />
        </div>

        <h1 className="text-2xl font-bold text-zinc-100 tracking-tight mb-2">
          Welcome to Chrona Platform
        </h1>
        <p className="text-xs text-zinc-400 max-w-xs mx-auto mb-8 leading-relaxed">
          Sign in with your GitHub account to manage your docs, edge builds, and AI assistants.
        </p>

        <button
          className={buttonVariants({
            className:
              'w-full bg-zinc-100 hover:bg-white text-zinc-950 font-semibold py-2.5 h-11 justify-center gap-2.5 shadow-lg shadow-white/10 border-0 text-sm cursor-pointer',
          })}
          onClick={async () => {
            await signIn.social({
              provider: 'github',
              callbackURL: 'http://localhost:3000/dashboard',
            })
          }}
        >
          <Github className="w-4 h-4" />
          Continue with GitHub
          <ArrowRight className="w-3.5 h-3.5 ml-auto opacity-60" />
        </button>

        <p className="text-[11px] text-zinc-500 mt-6">
          By signing in, you agree to our Terms of Service & Privacy Policy.
        </p>
      </div>
    </div>
  )
}
