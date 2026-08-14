import { Hono } from 'hono'
import { auth } from './auth'

import { orgsRouter } from './routes/orgs'
import { projectsRouter, directProjectRouter } from './routes/projects'

import { githubRouter } from './routes/github'
import { buildsRouter } from './routes/builds'
import { domainsRouter } from './routes/domains'
import { searchRouter } from './routes/search'
import { analyticsRouter } from './routes/analytics'

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
app.route('/api/projects', directProjectRouter)

// Mount Integrations & Internal
app.route('/api/github', githubRouter)
app.route('/api/builds', buildsRouter)
app.route('/api/domains', domainsRouter)
app.route('/api/search', searchRouter)
app.route('/api/analytics', analyticsRouter)

export default app
