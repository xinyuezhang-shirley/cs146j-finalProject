// Echo API — Express server for text analysis, art data, and gallery saves.

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { analyzeText, fetchDatamuseRelatedWords } = require('./lib/analyzeText');
const {
  generateNetworkData,
  generateSoupData,
  generateVortexData,
  generateOrbitData,
  generateAsciiData
} = require('./lib/artData');

const PORT = Number(process.env.PORT) || 3000;
const USE_DATAMUSE = process.env.USE_DATAMUSE === 'true' || process.env.USE_DATAMUSE === '1';
const NETWORK_DATAMUSE = process.env.NETWORK_DATAMUSE === 'false' || process.env.NETWORK_DATAMUSE === '0'
  ? false
  : true;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

const VALID_MODES = new Set(['network', 'soup', 'ascii', 'vortex', 'orbit']);
const frontendPath = path.join(__dirname, '..', 'frontend');

const app = express();
app.use(express.json({ limit: '2mb' }));

// Live Server on another port still needs CORS for /api calls.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

function isSupabaseConfigured() {
  return Boolean(supabase);
}

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

function clampUnit(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

function toCamel(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    originalText: row.original_text,
    coreWords: row.core_words ?? [],
    relatedWords: row.related_words ?? [],
    particles: row.particles ?? [],
    mode: row.mode,
    density: Number(row.density),
    motion: Number(row.motion),
    intensity: Number(row.intensity),
    options: row.options ?? {},
    analysisData: row.analysis_data ?? {},
    createdAt: row.created_at
  };
}

function generateTitle({ title, coreWords, originalText }) {
  if (title && String(title).trim()) {
    return String(title).trim().slice(0, 120);
  }

  const fromCore = (coreWords || [])
    .slice(0, 5)
    .map((w) => (typeof w === 'string' ? w : w?.text))
    .filter(Boolean);

  if (fromCore.length >= 3) {
    return fromCore.slice(0, Math.min(5, fromCore.length)).join(' · ').slice(0, 120);
  }

  if (fromCore.length > 0) {
    return fromCore.join(' · ').slice(0, 120);
  }

  const words = String(originalText || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5);

  if (words.length) return words.join(' ').slice(0, 120);
  return 'untitled echo';
}

function validateWorkPayload(body) {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body is required');
  }

  const originalText = String(body.originalText || '').trim();
  if (!originalText) throw new ValidationError('originalText is required');

  const mode = String(body.mode || '').toLowerCase();
  if (!VALID_MODES.has(mode)) {
    throw new ValidationError(`mode must be one of: ${[...VALID_MODES].join(', ')}`);
  }

  const coreWords = Array.isArray(body.coreWords) ? body.coreWords : [];
  const relatedWords = Array.isArray(body.relatedWords) ? body.relatedWords : [];
  const particles = Array.isArray(body.particles) ? body.particles : [];

  return {
    title: generateTitle({ title: body.title, coreWords, originalText }),
    original_text: originalText,
    core_words: coreWords,
    related_words: relatedWords,
    particles,
    mode,
    density: clampUnit(body.density, 0.6),
    motion: clampUnit(body.motion, 0.4),
    intensity: clampUnit(body.intensity, 0.4),
    options: body.options && typeof body.options === 'object' ? body.options : {},
    analysis_data: body.analysisData && typeof body.analysisData === 'object' ? body.analysisData : {}
  };
}

function requireSupabase(res) {
  if (!isSupabaseConfigured()) {
    res.status(503).json({
      error: 'Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env.'
    });
    return false;
  }
  return true;
}

async function runAnalysis(text, body = {}) {
  const density = body.density ?? 1;
  const useDatamuse = USE_DATAMUSE || NETWORK_DATAMUSE;
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

app.post('/api/analyze-text', async (req, res) => {
  const text = requireText(req, res);
  if (!text) return;

  try {
    res.json(await runAnalysis(text, req.body));
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

app.post('/api/works', async (req, res) => {
  if (!requireSupabase(res)) return;

  try {
    const record = validateWorkPayload(req.body);
    const { data, error } = await supabase.from('echo_works').insert(record).select().single();
    if (error) throw error;
    res.status(201).json(toCamel(data));
  } catch (err) {
    if (err instanceof ValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    const message = String(err.message || '');
    if (message.includes('row-level security')) {
      res.status(500).json({
        error: 'Use SUPABASE_SERVICE_ROLE_KEY (service_role), not the anon key.',
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
    const { data, error } = await supabase
      .from('echo_works')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json((data || []).map(toCamel));
  } catch (err) {
    res.status(500).json({ error: 'Failed to load gallery', message: err.message });
  }
});

app.get('/api/works/:id', async (req, res) => {
  if (!requireSupabase(res)) return;

  try {
    const { data, error } = await supabase
      .from('echo_works')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      res.status(404).json({ error: 'Work not found' });
      return;
    }
    res.json(toCamel(data));
  } catch (err) {
    res.status(500).json({ error: 'Failed to load work', message: err.message });
  }
});

app.put('/api/works/:id', async (req, res) => {
  if (!requireSupabase(res)) return;

  try {
    const body = req.body || {};
    const update = {};

    if (body.density !== undefined) update.density = clampUnit(body.density, 0.6);
    if (body.motion !== undefined) update.motion = clampUnit(body.motion, 0.4);
    if (body.intensity !== undefined) update.intensity = clampUnit(body.intensity, 0.4);
    if (body.options && typeof body.options === 'object') update.options = body.options;

    if (!Object.keys(update).length) {
      res.status(400).json({ error: 'No updatable fields provided' });
      return;
    }

    const { data, error } = await supabase
      .from('echo_works')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      res.status(404).json({ error: 'Work not found' });
      return;
    }
    res.json(toCamel(data));
  } catch (err) {
    res.status(500).json({ error: 'Failed to update work', message: err.message });
  }
});

app.delete('/api/works/:id', async (req, res) => {
  if (!requireSupabase(res)) return;

  try {
    const { data, error } = await supabase
      .from('echo_works')
      .select('id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      res.status(404).json({ error: 'Work not found' });
      return;
    }

    const { error: deleteError } = await supabase.from('echo_works').delete().eq('id', req.params.id);
    if (deleteError) throw deleteError;
    res.json({ id: req.params.id, deleted: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete work', message: err.message });
  }
});

app.use(express.static(frontendPath));

app.listen(PORT, () => {
  console.log(`Echo running at http://localhost:${PORT}`);
  if (!isSupabaseConfigured()) {
    console.log('Gallery disabled — add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to backend/.env');
  }
});
