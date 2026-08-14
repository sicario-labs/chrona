import { Hono } from 'hono'
import { db } from '../auth'
import { pageViews, searchQueries, projects } from '../db/schema'
import { eq, and, sql, desc, count } from 'drizzle-orm'

export const analyticsRouter = new Hono()

// POST /api/analytics/view
// Called by the frontend to track a page view
analyticsRouter.post('/view', async (c) => {
  const body = await c.req.json()
  const { path, projectId, userAgent } = body
  const referer = c.req.header('referer') || ''
  
  // Basic IP hashing for unique visitors
  const ip = c.req.header('cf-connecting-ip') || 'unknown'
  const visitorId = btoa(`${ip}-${userAgent}`).substring(0, 32)

  try {
    await db.insert(pageViews).values({
      projectId,
      path,
      userAgent,
      referer,
      visitorId
    })
    return c.json({ success: true })
  } catch (error) {
    console.error('Error logging page view:', error)
    return c.json({ success: false }, 500)
  }
})

// POST /api/analytics/search
// Called by the frontend to track a search query
analyticsRouter.post('/search', async (c) => {
  const body = await c.req.json()
  const { query, resultsCount, projectId, userAgent } = body
  
  const ip = c.req.header('cf-connecting-ip') || 'unknown'
  const visitorId = btoa(`${ip}-${userAgent}`).substring(0, 32)

  try {
    await db.insert(searchQueries).values({
      projectId,
      query,
      resultsCount,
      visitorId
    })
    return c.json({ success: true })
  } catch (error) {
    console.error('Error logging search query:', error)
    return c.json({ success: false }, 500)
  }
})

// GET /api/analytics/dashboard/:projectId
// Called by the Dashboard UI to render charts
analyticsRouter.get('/dashboard/:projectId', async (c) => {
  const projectId = c.req.param('projectId')

  try {
    // Top Pages
    const topPages = await db.select({
      path: pageViews.path,
      views: count()
    })
    .from(pageViews)
    .where(eq(pageViews.projectId, projectId))
    .groupBy(pageViews.path)
    .orderBy(desc(count()))
    .limit(10)

    // Top Searches
    const topSearches = await db.select({
      query: searchQueries.query,
      count: count()
    })
    .from(searchQueries)
    .where(eq(searchQueries.projectId, projectId))
    .groupBy(searchQueries.query)
    .orderBy(desc(count()))
    .limit(10)

    // Total Views
    const totalViewsRes = await db.select({ count: count() }).from(pageViews).where(eq(pageViews.projectId, projectId))
    const totalViews = totalViewsRes[0].count

    return c.json({
      topPages,
      topSearches,
      totalViews
    })
  } catch (error) {
    console.error('Error fetching analytics:', error)
    return c.json({ error: 'Failed to fetch analytics' }, 500)
  }
})
