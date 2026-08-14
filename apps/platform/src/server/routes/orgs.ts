import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../auth'
import { organizations, members } from '../db/schema'

export const orgsRouter = new Hono()

// Get all orgs for the current user
orgsRouter.get('/', async (c) => {
  // TODO: Add auth middleware to get current user ID
  // TODO: Add auth middleware to get current user ID

  // In a real app we would join with members table
  const userOrgs = await db.select().from(organizations)
  
  return c.json({ data: userOrgs })
})

// Create a new organization
orgsRouter.post('/', async (c) => {
  const userId = 'placeholder-user-id'
  const body = await c.req.json()

  // Insert org
  const newOrg = await db.insert(organizations).values({
    name: body.name,
    slug: body.slug,
  }).returning()

  // Add user as admin member
  await db.insert(members).values({
    orgId: newOrg[0].id,
    userId: userId,
    role: 'admin',
    acceptedAt: new Date()
  })

  return c.json({ data: newOrg[0] }, 201)
})

// Get a single organization
orgsRouter.get('/:id', async (c) => {
  const id = c.req.param('id')
  
  const org = await db.select().from(organizations).where(eq(organizations.id, id))
  if (org.length === 0) return c.json({ error: 'Not found' }, 404)

  return c.json({ data: org[0] })
})
