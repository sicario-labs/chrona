import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import { db } from '../auth'
import { projects } from '../db/schema'

export const projectsRouter = new Hono()

// Get all projects for an org
projectsRouter.get('/:orgId/projects', async (c) => {
  const orgId = c.req.param('orgId')

  const orgProjects = await db.select().from(projects).where(eq(projects.orgId, orgId))
  
  return c.json({ data: orgProjects })
})

// Create a new project
projectsRouter.post('/:orgId/projects', async (c) => {
  const orgId = c.req.param('orgId')
  const body = await c.req.json()

  const newProject = await db.insert(projects).values({
    orgId,
    name: body.name,
    slug: body.slug,
    githubRepo: body.githubRepo,
    theme: body.theme || 'neutral',
    layout: body.layout || 'docs',
  }).returning()

  return c.json({ data: newProject[0] }, 201)
})

// Get a single project
projectsRouter.get('/:orgId/projects/:projectId', async (c) => {
  const orgId = c.req.param('orgId')
  const projectId = c.req.param('projectId')

  const project = await db.select().from(projects).where(
    and(eq(projects.orgId, orgId), eq(projects.id, projectId))
  )

  if (project.length === 0) return c.json({ error: 'Not found' }, 404)

  return c.json({ data: project[0] })
})
