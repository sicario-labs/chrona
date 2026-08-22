import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

export type Bindings = {
  CHRONA_REGISTRY: KVNamespace;
};

const app = new Hono<{ Bindings: Bindings }>();

// Middleware
app.use('*', logger());
app.use('*', cors());

app.get('/', (c) => c.json({ service: 'Chrona Truth Registry API', status: 'ok' }));

// --------------------------------------------------------
// WRITE ENDPOINTS (Used by CLI `chrona publish`)
// --------------------------------------------------------

app.put('/registry/:org/:pkg/:version', async (c) => {
  const { org, pkg, version } = c.req.param();
  const packageName = `${org}/${pkg}`;
  
  const authHeader = c.req.header('Authorization');
  if (!authHeader) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const model = await c.req.json();
  if (!model.name || !model.version || !model.symbols || !model.provenance) {
    return c.json({ error: 'Invalid RegistryPackageModel format (missing provenance/symbols)' }, 400);
  }

  // 1. Save specific version
  const key = `${packageName}@${version}`;
  await c.env.CHRONA_REGISTRY.put(key, JSON.stringify(model));

  // 2. Save latest
  const latestKey = `${packageName}@latest`;
  await c.env.CHRONA_REGISTRY.put(latestKey, JSON.stringify(model));

  // 3. Update Version Index Array
  const versionsKey = `${packageName}@versions`;
  let versions = [];
  const existingVersionsStr = await c.env.CHRONA_REGISTRY.get(versionsKey);
  if (existingVersionsStr) {
    try {
      versions = JSON.parse(existingVersionsStr);
    } catch {}
  }
  
  // Filter out the current version if it exists, then append to end
  versions = versions.filter((v: any) => v.version !== version);
  versions.push({
    version,
    publishedAt: model.publishedAt,
    checksum: model.checksum,
    symbolCount: model.symbols.length
  });
  
  await c.env.CHRONA_REGISTRY.put(versionsKey, JSON.stringify(versions));

  return c.json({ 
    ok: true,
    url: `https://registry.chronadocs.xyz/packages/${org}/${pkg}`
  });
});


// --------------------------------------------------------
// READ ENDPOINTS (Used by UI and AI Agents)
// --------------------------------------------------------

// Backward compatible fetch for agents
app.get('/registry/:org/:pkg/:version', async (c) => {
  const { org, pkg, version } = c.req.param();
  const packageName = `${org}/${pkg}`;
  const key = `${packageName}@${version}`;

  const modelString = await c.env.CHRONA_REGISTRY.get(key);
  if (!modelString) return c.json({ error: 'Not found' }, 404);

  // Agents typically want the whole fat payload
  return c.json(JSON.parse(modelString));
});

// UI Package Overview (Latest + Versions)
app.get('/packages/:org/:pkg', async (c) => {
  const { org, pkg } = c.req.param();
  const packageName = `${org}/${pkg}`;
  
  const latestString = await c.env.CHRONA_REGISTRY.get(`${packageName}@latest`);
  if (!latestString) return c.json({ error: 'Not found' }, 404);
  
  const latestModel = JSON.parse(latestString);
  const versionsString = await c.env.CHRONA_REGISTRY.get(`${packageName}@versions`) || '[]';
  
  // Strip heavy symbols payload for overview
  const { symbols, ...lightModel } = latestModel;
  
  c.header('Cache-Control', 'public, max-age=60');
  return c.json({
    latest: lightModel,
    versions: JSON.parse(versionsString)
  });
});

// UI Version Detail
app.get('/packages/:org/:pkg/:version', async (c) => {
  const { org, pkg, version } = c.req.param();
  const packageName = `${org}/${pkg}`;
  const key = `${packageName}@${version}`;

  const modelString = await c.env.CHRONA_REGISTRY.get(key);
  if (!modelString) return c.json({ error: 'Not found' }, 404);

  const model = JSON.parse(modelString);
  const { symbols, ...lightModel } = model;
  
  c.header('Cache-Control', 'public, max-age=3600');
  return c.json(lightModel);
});

// UI Symbols Explorer
app.get('/packages/:org/:pkg/:version/symbols', async (c) => {
  const { org, pkg, version } = c.req.param();
  const packageName = `${org}/${pkg}`;
  const key = `${packageName}@${version}`;

  const modelString = await c.env.CHRONA_REGISTRY.get(key);
  if (!modelString) return c.json({ error: 'Not found' }, 404);

  const model = JSON.parse(modelString);
  
  c.header('Cache-Control', 'public, max-age=3600');
  return c.json({ symbols: model.symbols });
});

// Search API
app.get('/registry/search', async (c) => {
  const query = c.req.query('q');
  if (!query) return c.json([]);

  const list = await c.env.CHRONA_REGISTRY.list({ prefix: '' });
  const results = [];

  for (const key of list.keys) {
    if (key.name.endsWith('@latest') && key.name.toLowerCase().includes(query.toLowerCase())) {
      const modelString = await c.env.CHRONA_REGISTRY.get(key.name);
      if (modelString) {
        const model = JSON.parse(modelString);
        results.push({
          name: model.name,
          version: model.version,
          symbols: model.symbols?.length || 0,
          provenance: model.provenance,
          integrity: model.integrity
        });
      }
    }
  }
  
  c.header('Cache-Control', 'public, max-age=15');
  return c.json(results);
});

// Global Stats
app.get('/stats', async (c) => {
  const list = await c.env.CHRONA_REGISTRY.list({ prefix: '' });
  let packageCount = 0;
  for (const key of list.keys) {
    if (key.name.endsWith('@latest')) packageCount++;
  }
  return c.json({ packages: packageCount });
});

// Featured
app.get('/featured', async (c) => {
  // Hardcoded featured for MVP
  const featuredNames = ['@chrona-engine/engine', '@chrona-engine/api', '@chrona-engine/cli'];
  const results = [];
  for (const name of featuredNames) {
    const modelStr = await c.env.CHRONA_REGISTRY.get(`${name}@latest`);
    if (modelStr) {
      const m = JSON.parse(modelStr);
      results.push({ name: m.name, version: m.version, symbols: m.symbols?.length || 0, integrity: m.integrity });
    }
  }
  return c.json(results);
});

export default app;
