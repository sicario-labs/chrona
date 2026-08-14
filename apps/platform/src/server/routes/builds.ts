import { Hono } from 'hono'

export const buildsRouter = new Hono<{ Bindings: { CHRONA_BUILDS: any } }>()

// Fetch a specific file from a project's build artifact
buildsRouter.get('/:projectId/:path{.+}', async (c) => {
  const projectId = c.req.param('projectId')
  const path = c.req.param('path')
  
  const bucket = c.env.CHRONA_BUILDS
  if (!bucket) {
    return c.json({ error: 'R2 bucket not bound' }, 500)
  }

  const objectName = `${projectId}/${path}`
  const object = await bucket.get(objectName)

  if (object === null) {
    return c.json({ error: 'Artifact not found' }, 404)
  }

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)

  return new Response(object.body, {
    headers,
  })
})
