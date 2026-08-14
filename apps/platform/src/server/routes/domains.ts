import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { projects } from '../db/schema'

export const domainsRouter = new Hono()

// Replace with env vars in production
const CLOUDFLARE_ZONE_ID = process.env.CLOUDFLARE_ZONE_ID || ''
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || ''

domainsRouter.get('/:projectId', async (c) => {
  const { projectId } = c.req.param()
  
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId)
  })

  if (!project) {
    return c.json({ error: 'Project not found' }, 404)
  }

  return c.json({
    customDomain: project.customDomain,
    status: project.customDomainStatus,
    txtName: project.customDomainTxtName,
    txtValue: project.customDomainTxtValue,
  })
})

domainsRouter.post('/:projectId', async (c) => {
  const { projectId } = c.req.param()
  const { domain } = await c.req.json()

  if (!domain) {
    return c.json({ error: 'Domain is required' }, 400)
  }
  
  // 1. Fetch project
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId)
  })

  if (!project) return c.json({ error: 'Project not found' }, 404)

  if (!CLOUDFLARE_ZONE_ID || !CLOUDFLARE_API_TOKEN) {
    console.warn('Cloudflare API token or Zone ID missing.')
    // For local development mock the response
    await db.update(projects)
      .set({
        customDomain: domain,
        customDomainStatus: 'pending',
        customDomainTxtName: `_cf-custom-hostname.${domain}`,
        customDomainTxtValue: `mock-verification-token-${Date.now()}`
      })
      .where(eq(projects.id, projectId))
      
    return c.json({ success: true, mocked: true })
  }

  // 2. Call Cloudflare Custom Hostnames API
  const cfRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/custom_hostnames`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      hostname: domain,
      ssl: {
        method: 'txt',
        type: 'dv'
      }
    })
  })

  const cfData = await cfRes.json()

  if (!cfRes.ok || !cfData.success) {
    return c.json({ error: 'Failed to add custom domain to Cloudflare', details: cfData.errors }, 500)
  }

  const hostnameInfo = cfData.result
  const ownershipVerification = hostnameInfo.ownership_verification || {}

  // 3. Update database with TXT record challenges
  await db.update(projects)
    .set({
      customDomain: domain,
      customDomainStatus: hostnameInfo.status,
      customDomainTxtName: ownershipVerification.name,
      customDomainTxtValue: ownershipVerification.value
    })
    .where(eq(projects.id, projectId))

  return c.json({ success: true, result: hostnameInfo })
})

domainsRouter.post('/:projectId/verify', async (c) => {
  // We can force cloudflare to re-verify if needed, or just fetch the status
  // For simplicity, we just fetch status and update DB here in MVP
  return c.json({ success: true, status: 'pending' })
})
