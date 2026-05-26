// server.js
// backend for the echo project
// serves the frontend, analyzes text, and saves gallery works to Supabase

const path = require('path');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

// load environment variables
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { analyzeText, fetchDatamuseRelatedWords } = require('./lib/analyzeText');

const {
  generateNetworkData,
  generateSoupData,
  generateVortexData,
  generateOrbitData,
  generateAsciiData
} = require('./lib/artData');

const app = express();
const PORT = process.env.PORT || 3000;

// Lets Express read JSON request bodies from fetch()
app.use(express.json({ limit: '2mb' }));

// Where my frontend files live
const frontendPath = path.join(__dirname, '..', 'frontend');

// Supabase setup
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

// Allowed gallery modes
const validModes = ['network', 'soup', 'ascii', 'vortex', 'orbit'];

// Simple localhost CORS.
// This helps if I open the frontend from a different local dev port.
app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && origin.includes('localhost')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});


// checks whether Supabase is ready before using gallery routes
function checkSupabase(res) {
  if (!supabase) {
    res.status(503).json({
      error: 'Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to backend/.env.'
    });
    return false;
  }

  return true;
}


// keeps slider values between 0 and 1
function clampSlider(value, fallback) {
  const number = Number(value);

  if (Number.isNaN(number)) {
    return fallback;
  }

  if (number < 0) {
    return 0;
  }

  if (number > 1) {
    return 1;
  }

  return number;
}


// Supabase uses snake_case column names.
// My frontend uses camelCase.
// This converts database rows back into frontend-friendly objects.
function formatWork(row) {
  return {
    id: row.id,
    title: row.title,
    originalText: row.original_text,
    coreWords: row.core_words || [],
    relatedWords: row.related_words || [],
    particles: row.particles || [],
    mode: row.mode,
    density: Number(row.density),
    motion: Number(row.motion),
    intensity: Number(row.intensity),
    options: row.options || {},
    analysisData: row.analysis_data || {},
    createdAt: row.created_at
  };
}


// creates a title if the user did not enter one
function makeTitle(body) {
  if (body.title && body.title.trim()) {
    return body.title.trim().slice(0, 120);
  }

  const coreWords = body.coreWords || [];
  const titleWords = coreWords
    .slice(0, 5)
    .map((word) => typeof word === 'string' ? word : word.text)
    .filter(Boolean);

  if (titleWords.length > 0) {
    return titleWords.join(' · ').slice(0, 120);
  }

  const textWords = String(body.originalText || '')
    .trim()
    .split(/\s+/)
    .slice(0, 5);

  if (textWords.length > 0) {
    return textWords.join(' ').slice(0, 120);
  }

  return 'untitled echo';
}


// cleans and validates the work before saving it
function prepareWorkForDatabase(body) {
  const originalText = String(body.originalText || '').trim();
  const mode = String(body.mode || '').toLowerCase();

  if (!originalText) {
    throw new Error('originalText is required');
  }

  if (!validModes.includes(mode)) {
    throw new Error('Invalid mode');
  }

  return {
    title: makeTitle(body),
    original_text: originalText,
    core_words: Array.isArray(body.coreWords) ? body.coreWords : [],
    related_words: Array.isArray(body.relatedWords) ? body.relatedWords : [],
    particles: Array.isArray(body.particles) ? body.particles : [],
    mode: mode,
    density: clampSlider(body.density, 0.6),
    motion: clampSlider(body.motion, 0.4),
    intensity: clampSlider(body.intensity, 0.4),
    options: body.options || {},
    analysis_data: body.analysisData || {}
  };
}


// makes sure a request has text
function getTextFromRequest(req, res) {
  const text = req.body && req.body.text;

  if (!text || typeof text !== 'string') {
    res.status(400).json({ error: 'text is required' });
    return null;
  }

  return text;
}


// runs the text analysis pipeline
async function analyzeEchoText(text, body) {
  const useDatamuse =
    process.env.USE_DATAMUSE === 'true' ||
    process.env.NETWORK_DATAMUSE !== 'false';

  return analyzeText(text, {
    density: body.density || 1,
    useDatamuse: useDatamuse,
    fetchExternal: useDatamuse ? fetchDatamuseRelatedWords : null
  });
}


// analyze text route
app.post('/api/analyze-text', async (req, res) => {
  const text = getTextFromRequest(req, res);
  if (!text) return;

  try {
    const result = await analyzeEchoText(text, req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: 'Analysis failed',
      message: error.message
    });
  }
});


// art routes
// These all analyze the text first, then format the result for one visual mode.

app.post('/api/art/network', async (req, res) => {
  const text = getTextFromRequest(req, res);
  if (!text) return;

  try {
    const analysis = await analyzeEchoText(text, req.body);
    res.json(generateNetworkData(analysis, req.body));
  } catch (error) {
    res.status(500).json({ error: 'Network art generation failed', message: error.message });
  }
});

app.post('/api/art/soup', async (req, res) => {
  const text = getTextFromRequest(req, res);
  if (!text) return;

  try {
    const analysis = await analyzeEchoText(text, req.body);
    res.json(generateSoupData(analysis, req.body));
  } catch (error) {
    res.status(500).json({ error: 'Soup art generation failed', message: error.message });
  }
});

app.post('/api/art/ascii', async (req, res) => {
  const text = getTextFromRequest(req, res);
  if (!text) return;

  try {
    const analysis = await analyzeEchoText(text, req.body);
    res.json(generateAsciiData(analysis, req.body));
  } catch (error) {
    res.status(500).json({ error: 'ASCII art generation failed', message: error.message });
  }
});

app.post('/api/art/vortex', async (req, res) => {
  const text = getTextFromRequest(req, res);
  if (!text) return;

  try {
    const analysis = await analyzeEchoText(text, req.body);
    res.json(generateVortexData(analysis, req.body));
  } catch (error) {
    res.status(500).json({ error: 'Vortex art generation failed', message: error.message });
  }
});

app.post('/api/art/orbit', async (req, res) => {
  const text = getTextFromRequest(req, res);
  if (!text) return;

  try {
    const analysis = await analyzeEchoText(text, req.body);
    res.json(generateOrbitData(analysis, req.body));
  } catch (error) {
    res.status(500).json({ error: 'Orbit art generation failed', message: error.message });
  }
});


// save one work to Supabase
app.post('/api/works', async (req, res) => {
  if (!checkSupabase(res)) return;

  try {
    const newWork = prepareWorkForDatabase(req.body);

    const { data, error } = await supabase
      .from('echo_works')
      .insert(newWork)
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.status(201).json(formatWork(data));
  } catch (error) {
    res.status(400).json({
      error: 'Failed to save work',
      message: error.message
    });
  }
});


// load all gallery works
app.get('/api/works', async (req, res) => {
  if (!checkSupabase(res)) return;

  try {
    const { data, error } = await supabase
      .from('echo_works')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    res.json((data || []).map(formatWork));
  } catch (error) {
    res.status(500).json({
      error: 'Failed to load gallery',
      message: error.message
    });
  }
});


// load one work by id
app.get('/api/works/:id', async (req, res) => {
  if (!checkSupabase(res)) return;

  try {
    const { data, error } = await supabase
      .from('echo_works')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      res.status(404).json({ error: 'Work not found' });
      return;
    }

    res.json(formatWork(data));
  } catch (error) {
    res.status(500).json({
      error: 'Failed to load work',
      message: error.message
    });
  }
});


// update sliders/options for one saved work
app.put('/api/works/:id', async (req, res) => {
  if (!checkSupabase(res)) return;

  const update = {};

  if (req.body.density !== undefined) {
    update.density = clampSlider(req.body.density, 0.6);
  }

  if (req.body.motion !== undefined) {
    update.motion = clampSlider(req.body.motion, 0.4);
  }

  if (req.body.intensity !== undefined) {
    update.intensity = clampSlider(req.body.intensity, 0.4);
  }

  if (req.body.options) {
    update.options = req.body.options;
  }

  if (Object.keys(update).length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  try {
    const { data, error } = await supabase
      .from('echo_works')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      res.status(404).json({ error: 'Work not found' });
      return;
    }

    res.json(formatWork(data));
  } catch (error) {
    res.status(500).json({
      error: 'Failed to update work',
      message: error.message
    });
  }
});


// delete one work
app.delete('/api/works/:id', async (req, res) => {
  if (!checkSupabase(res)) return;

  try {
    const { error } = await supabase
      .from('echo_works')
      .delete()
      .eq('id', req.params.id);

    if (error) {
      throw error;
    }

    res.json({
      id: req.params.id,
      deleted: true
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to delete work',
      message: error.message
    });
  }
});


// serve the frontend files after the API routes
app.use(express.static(frontendPath));


// start the server
app.listen(PORT, () => {
  console.log(`Echo running at http://localhost:${PORT}`);

  if (!supabase) {
    console.log('Gallery is disabled because Supabase is not configured.');
  }
});