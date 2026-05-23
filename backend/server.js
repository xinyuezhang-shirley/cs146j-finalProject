/**
 * Echo API — my custom Express server.
 *
 * This server is the source of truth for text analysis and art-data generation.
 * It imports backend/lib modules and exposes REST routes under /api/*.
 *
 * Datamuse enrichment runs server-side only (NETWORK_DATAMUSE=true by default).
 * Set USE_DATAMUSE=true for global enrichment, or NETWORK_DATAMUSE=false for fully local graphs.
 */

const express = require('express');
const path = require('path');
const config = require('./lib/config');
const { analyzeText } = require('./lib/analyzeText');
const { fetchDatamuseRelatedWords } = require('./lib/enrichment');
const { generateNetworkData } = require('./lib/generateNetwork');
const { generateSoupData, generateVortexData, generateOrbitData } = require('./lib/generateParticles');
const { generateAsciiData } = require('./lib/generateAscii');

const app = express();
const frontendPath = path.join(__dirname, '..', 'frontend');

app.use(express.json({ limit: '16kb' }));

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

// Serve frontend static files
app.use(express.static(frontendPath));

app.listen(config.PORT, () => {
  console.log(`Echo API running at http://localhost:${config.PORT}`);
  console.log(`Enrichment: ${config.USE_DATAMUSE ? 'Datamuse (all modes)' : config.NETWORK_DATAMUSE ? 'Datamuse (network echoes)' : 'Echo local only'}`);
});
