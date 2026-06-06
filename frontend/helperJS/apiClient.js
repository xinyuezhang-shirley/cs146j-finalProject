// handles talking to my Express backend
// all frontend requests go through this file

import { analyzeTextLocally } from './textProcessing.js';
import { buildLocalModeArt } from './artFallback.js';


// decide which backend URL to use
// when running locally, use localhost
// when deployed, use the Render backend
//
// Live Server sometimes serves from 127.0.0.1 instead of localhost,
// so both need to be handled
function getBackendOrigin() {
  const host = window.location.hostname;

  if (host === 'localhost' || host === '127.0.0.1') {
    return 'http://localhost:3000';
  }

  return 'https://cs146j-finalproject.onrender.com';
}


// determine where API requests should go
//
// if Express is serving both frontend and backend on port 3000,
// we can use relative URLs like /api/works
//
// otherwise (Live Server, file://, etc.) we need the full backend URL
function getApiBase() {
  if (typeof window === 'undefined') {
    return getBackendOrigin();
  }

  const { protocol, hostname, port } = window.location;

  // opening the file directly in the browser
  if (protocol === 'file:') {
    return getBackendOrigin();
  }

  // Express serves frontend and backend together on port 3000
  const onExpress =
    (hostname === 'localhost' || hostname === '127.0.0.1') &&
    port === '3000';

  return onExpress ? '' : getBackendOrigin();
}


// base URL used by every fetch request below
const API_URL = getApiBase();


// backend route for each visualization mode
// mode names in the frontend map directly to Express routes
const ART_ROUTES = {
  network: '/api/art/network',
  soup: '/api/art/soup',
  ascii: '/api/art/ascii',
  vortex: '/api/art/vortex',
  orbit: '/api/art/orbit'
};


// keep slider values between 0 and 1
// protects against invalid values being sent to the backend
function clamp01(value, fallback) {
  const number = Number(value);

  if (Number.isNaN(number)) {
    return fallback;
  }

  return Math.min(1, Math.max(0, number));
}


// makes sure API and fallback payloads have the same shape
// this lets the frontend use either source without caring where it came from
function normalizeArtPayload(payload, source) {
  const normalized = {
    ...payload,
    _source: source
  };

  // older gallery objects may only contain cooccurrenceLinks
  // keep them available for compatibility
  if (!normalized.links && normalized.cooccurrenceLinks) {
    normalized.cooccurrenceLinks = normalized.cooccurrenceLinks;
  }

  return normalized;
}


// build the request body sent to art routes
// all visualization routes use the same settings
function artRequestBody(text, settings = {}) {
  return {
    text,

    // sliders are normalized before sending
    density: clamp01(settings.density, 0.6),
    motion: clamp01(settings.motion, 0.4),
    intensity: clamp01(settings.intensity, 0.4)
  };
}


// request art data from the backend
// example:
// POST /api/art/network
// POST /api/art/vortex
export async function fetchModeArt(mode, text, settings = {}) {
  const route = ART_ROUTES[mode];

  if (!route) {
    throw new Error('Unknown mode: ' + mode);
  }

  const response = await fetch(`${API_URL}${route}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(
      artRequestBody(text, settings)
    )
  });

  if (!response.ok) {
    throw new Error('Echo art API failed: ' + response.status);
  }

  return normalizeArtPayload(
    await response.json(),
    'api'
  );
}


// main frontend function used by the visualizations
//
// try the backend first
// if the backend is unavailable, fall back to local generation
export async function generateModeArt(mode, text, settings = {}) {
  try {
    return await fetchModeArt(mode, text, settings);
  } catch (error) {
    console.log('could not load mode art from API, using local fallback');
    console.log(error);

    return buildLocalModeArt(mode, text, settings);
  }
}


// full text analysis route
// returns words, links, related words, particles, etc.
//
// unlike generateModeArt(), this returns the full analysis object
export async function analyzeText(text, settings = {}) {
  const density = clamp01(settings.density, 1);

  try {
    const response = await fetch(`${API_URL}/api/analyze-text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text,
        density
      })
    });

    if (!response.ok) {
      throw new Error('Echo API failed: ' + response.status);
    }

    const data = await response.json();

    return normalizeArtPayload(data, 'api');
  } catch (error) {
    console.log('could not analyze text, using local fallback');
    console.log(error);

    // local analysis is less sophisticated,
    // but keeps the app working without the backend
    return analyzeTextLocally(text, density);
  }
}


// safely read JSON from a response
//
// if the backend sends invalid JSON,
// return an empty object instead of crashing
async function parseJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}


// save a gallery work to SQLite
//
// POST /api/works
export async function saveWork(work) {
  const response = await fetch(`${API_URL}/api/works`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(work)
  });

  const data = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(
      data.error ||
      data.message ||
      `Failed to save work (HTTP ${response.status})`
    );
  }

  return data;
}


// load every saved gallery work
//
// GET /api/works
export async function fetchWorks() {
  const response = await fetch(`${API_URL}/api/works`);
  const data = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(
      data.error ||
      data.message ||
      `Failed to load gallery (HTTP ${response.status})`
    );
  }

  return Array.isArray(data) ? data : [];
}


// load one saved work by id
//
// GET /api/works/:id
export async function fetchWork(id) {
  const response = await fetch(`${API_URL}/api/works/${id}`);
  const data = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(
      data.error ||
      data.message ||
      `Failed to load work (HTTP ${response.status})`
    );
  }

  return data;
}


// update settings on an existing work
//
// currently used for sliders and options
//
// PUT /api/works/:id
export async function updateWork(id, patch) {
  try {
    const response = await fetch(`${API_URL}/api/works/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(patch)
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));

      throw new Error(
        body.error ||
        `Failed to update work (HTTP ${response.status})`
      );
    }

    return await response.json();
  } catch (error) {
    // fetch can fail entirely if the backend is offline
    if (error.message) {
      throw error;
    }

    throw new Error(
      'Could not update work — is the backend running?'
    );
  }
}


// delete a saved gallery work
//
// DELETE /api/works/:id
export async function deleteWork(id) {
  try {
    const response = await fetch(`${API_URL}/api/works/${id}`, {
      method: 'DELETE'
    });

    return await response.json();
  } catch (error) {
    console.log('could not delete work');
    console.log(error);
  }
}