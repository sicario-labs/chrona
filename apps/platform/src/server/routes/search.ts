import { Hono } from 'hono'

export const searchRouter = new Hono()

searchRouter.get('/', async (c) => {
  const host = c.req.header('host') || ''
  
  let projectSlug = 'demo'
  if (host.includes('.chrona.dev')) {
    projectSlug = host.replace('.chrona.dev', '')
  } else if (host.endsWith('.localhost')) {
    projectSlug = host.replace('.localhost', '')
  } else if (host === 'localhost' || host.startsWith('localhost:')) {
    projectSlug = 'demo'
  }

  const projectId = projectSlug === 'demo' ? 'demo-project-id' : `proj-${projectSlug}`
  const query = c.req.query('query')

  if (!query) {
    return c.json([])
  }

  const env = c.env as any
  
  if (!env.AI || !env.VECTOR_INDEX) {
    console.warn("AI or VECTOR_INDEX bindings are missing. Returning empty search results.")
    return c.json({ results: [] })
  }

  try {
    // 1. Convert the search query into an embedding
    const embeddingResponse = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
      text: [query]
    })
    const queryVector = embeddingResponse.data[0]

    // 2. Search the vector database for matching chunks
    const searchResults = await env.VECTOR_INDEX.query(queryVector, {
      topK: 10,
      returnValues: false,
      returnMetadata: true
    })

    // 3. Filter and format the results
    const results = searchResults.matches
      .filter((match: any) => match.metadata?.projectId === projectId)
      .map((match: any) => ({
        type: 'page',
        id: match.id,
        content: match.metadata.content || '',
        url: `/${match.metadata.path}`,
        // We can add page title later, but SortedResult usually groups by page
      }))

    return c.json(results)
  } catch (error) {
    console.error('Vector search error:', error)
    return c.json({ error: 'Search failed' }, 500)
  }
})
