/**
 * Echo API — my custom Express server.
 *
 * This server is the source of truth for text analysis and art-data generation.
 * It imports backend/lib modules and exposes REST routes under /api/*.
 *
 * Datamuse enrichment runs server-side only (NETWORK_DATAMUSE=true by default).
 * Set USE_DATAMUSE=true for global enrichment, or NETWORK_DATAMUSE=false for fully local graphs.
 */

const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const config = require('./lib/config');
const { isSupabaseConfigured } = require('./supabaseClient');
const { analyzeText } = require('./lib/analyzeText');
const { fetchDatamuseRelatedWords } = require('./lib/enrichment');
const { generateNetworkData } = require('./lib/generateNetwork');
const { generateSoupData, generateVortexData, generateOrbitData } = require('./lib/generateParticles');
const { generateAsciiData } = require('./lib/generateAscii');
const {
  ValidationError,
  createWork,
  listWorks,
  getWorkById,
  deleteWorkById,
  requireSupabase
} = require('./lib/worksApi');

const app = express();
const frontendPath = path.join(__dirname, '..', 'frontend');

app.use(express.json({ limit: '2mb' }));

// Allow gallery/save API calls when the HTML is opened via Live Server on another port.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

async function runAnalysis(text, body = {}) {
  const density = body.density ?? 1;
  const useDatamuse = config.USE_DATAMUSE || config.NETWORK_DATAMUSE;
  return analyzeText(text, {
    density,
    useDatamuse,
    fetchExternal: useDatamuse ? fetchDatamuseRelatedWords : null
  });
}

function requireText(req, res) {
  const { text } = req.body || {};
  if (!text || typeof text !== 'string') {
    res.status(400).json({ error: 'text is required' });
    return null;
  }
  return text;
}

// --- Echo API routes (frontend calls these via apiClient.js) ---

app.post('/api/analyze-text', async (req, res) => {
  const text = requireText(req, res);
  if (!text) return;

  try {
    const result = await runAnalysis(text, req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Analysis failed', message: err.message });
  }
});

app.post('/api/art/network', async (req, res) => {
  const text = requireText(req, res);
  if (!text) return;

  try {
    const analysis = await runAnalysis(text, req.body);
    res.json(generateNetworkData(analysis, req.body));
  } catch (err) {
    res.status(500).json({ error: 'Network art generation failed', message: err.message });
  }
});

app.post('/api/art/soup', async (req, res) => {
  const text = requireText(req, res);
  if (!text) return;

  try {
    const analysis = await runAnalysis(text, req.body);
    res.json(generateSoupData(analysis, req.body));
  } catch (err) {
    res.status(500).json({ error: 'Soup art generation failed', message: err.message });
  }
});

app.post('/api/art/ascii', async (req, res) => {
  const text = requireText(req, res);
  if (!text) return;

  try {
    const analysis = await runAnalysis(text, req.body);
    res.json(generateAsciiData(analysis, req.body));
  } catch (err) {
    res.status(500).json({ error: 'ASCII art generation failed', message: err.message });
  }
});

app.post('/api/art/vortex', async (req, res) => {
  const text = requireText(req, res);
  if (!text) return;

  try {
    const analysis = await runAnalysis(text, req.body);
    res.json(generateVortexData(analysis, req.body));
  } catch (err) {
    res.status(500).json({ error: 'Vortex art generation failed', message: err.message });
  }
});

app.post('/api/art/orbit', async (req, res) => {
  const text = requireText(req, res);
  if (!text) return;

  try {
    const analysis = await runAnalysis(text, req.body);
    res.json(generateOrbitData(analysis, req.body));
  } catch (err) {
    res.status(500).json({ error: 'Orbit art generation failed', message: err.message });
  }
});

// --- Gallery: saved Echo works (Supabase via service role) ---

app.post('/api/works', async (req, res) => {
  if (!requireSupabase(res)) return;

  try {
    const saved = await createWork(req.body);
    res.status(201).json(saved);
  } catch (err) {
    if (err instanceof ValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    console.error('Save work failed:', err);
    const message = String(err.message || '');
    if (message.includes('row-level security')) {
      res.status(500).json({
        error: 'Supabase rejected the save. Use SUPABASE_SERVICE_ROLE_KEY (service_role secret), not the publishable/anon key, then restart the server.',
        message
      });
      return;
    }
    res.status(500).json({ error: 'Failed to save work', message });
  }
});

app.get('/api/works', async (req, res) => {
  if (!requireSupabase(res)) return;

  try {
    const works = await listWorks();
    res.json(works);
  } catch (err) {
    console.error('List works failed:', err);
    res.status(500).json({ error: 'Failed to load gallery', message: err.message });
  }
});

app.get('/api/works/:id', async (req, res) => {
  if (!requireSupabase(res)) return;

  try {
    const work = await getWorkById(req.params.id);
    if (!work) {
      res.status(404).json({ error: 'Work not found' });
      return;
    }
    res.json(work);
  } catch (err) {
    console.error('Get work failed:', err);
    res.status(500).json({ error: 'Failed to load work', message: err.message });
  }
});

app.delete('/api/works/:id', async (req, res) => {
  if (!requireSupabase(res)) return;

  try {
    const existing = await getWorkById(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Work not found' });
      return;
    }
    const result = await deleteWorkById(req.params.id);
    res.json(result);
  } catch (err) {
    console.error('Delete work failed:', err);
    res.status(500).json({ error: 'Failed to delete work', message: err.message });
  }
});

// Serve frontend static files
app.use(express.static(frontendPath));

app.listen(config.PORT, () => {
  console.log(`Echo API running at http://localhost:${config.PORT}`);
  console.log(`Enrichment: ${config.USE_DATAMUSE ? 'Datamuse (all modes)' : config.NETWORK_DATAMUSE ? 'Datamuse (network echoes)' : 'Echo local only'}`);
  console.log(
    isSupabaseConfigured()
      ? 'Gallery: Supabase connected (save/load enabled)'
      : 'Gallery: DISABLED — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env, then restart'
  );
});
