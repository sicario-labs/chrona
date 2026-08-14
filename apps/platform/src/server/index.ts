import { Hono } from 'hono'
import { auth } from './auth'

import { orgsRouter } from './routes/orgs'
import { projectsRouter } from './routes/projects'

import { githubRouter } from './routes/github'

const app = new Hono()

// Mount Better Auth endpoints
app.on(['POST', 'GET'], '/api/auth/*', (c) => {
  return auth.handler(c.req.raw)
})

app.get('/api/health', (c) => {
  return c.json({ status: 'ok', service: 'chrona-platform-api' })
})

// Mount CRUD routers
app.route('/api/orgs', orgsRouter)
app.route('/api/orgs', projectsRouter)

// Mount Integrations
app.route('/api/github', githubRouter)

export default app
