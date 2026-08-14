import { Hono } from 'hono'
import { db } from '../auth'
import { projects } from '../db/schema'
import { eq } from 'drizzle-orm'
import crypto from 'crypto'

export const githubRouter = new Hono()

// Basic webhook signature verification
const verifySignature = (req: Request, payload: string, signature: string | null) => {
  if (!signature) return false
  const secret = process.env.GITHUB_WEBHOOK_SECRET
  if (!secret) return true // Bypass in dev if not set

  const hmac = crypto.createHmac('sha256', secret)
  const digest = `sha256=${hmac.update(payload).digest('hex')}`
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))
}

githubRouter.post('/webhook', async (c) => {
  const signature = c.req.header('x-hub-signature-256') || null
  const event = c.req.header('x-github-event')
  
  const payloadStr = await c.req.text()
  if (!verifySignature(c.req.raw, payloadStr, signature)) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const payload = JSON.parse(payloadStr)

  // Handle push events
  if (event === 'push') {
    const repoFullName = payload.repository.full_name
    const branch = payload.ref.replace('refs/heads/', '')
    
    // Find projects tracking this repo and branch
    const trackingProjects = await db.select().from(projects)
      .where(eq(projects.githubRepo, repoFullName))

    const targetProjects = trackingProjects.filter(p => p.githubBranch === branch)

    // In a real implementation, we would push a message to Cloudflare Queues here
    // for each targetProject to trigger a build.
    for (const project of targetProjects) {
      console.log(`[Queue] Scheduling build for project ${project.id} (${project.name})`)
      // await env.BUILD_QUEUE.send({ projectId: project.id, commit: payload.after })
    }

    return c.json({ received: true, triggered: targetProjects.length })
  }

  // Handle app installation events
  if (event === 'installation') {
    const action = payload.action
    console.log(`GitHub App installation ${action}`)
    // We would link the installation_id to the organization here
    return c.json({ received: true })
  }

  return c.json({ received: true, ignored: true })
})
