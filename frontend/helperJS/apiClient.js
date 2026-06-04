// api.js
// handles talking to my Express backend

import { analyzeTextLocally } from './textProcessing.js';
import { buildLocalModeArt } from './artFallback.js';

// Match Live Server host (127.0.0.1 vs localhost) so CORS Allow-Origin aligns with the page origin.
function getBackendOrigin() {
  if (typeof window !== 'undefined' && window.location.hostname === '127.0.0.1') {
    return 'http://127.0.0.1:3000';
  }
  return 'http://localhost:3000';
}

// Same-origin only when Express serves the app (port 3000). Live Server, file://, etc. use the backend origin above.
function getApiBase() {
  if (typeof window === 'undefined') {
    return getBackendOrigin();
  }

  const { protocol, hostname, port } = window.location;

  if (protocol === 'file:') {
    return getBackendOrigin();
  }

  const onExpress =
    (hostname === 'localhost' || hostname === '127.0.0.1') && port === '3000';

  return onExpress ? '' : getBackendOrigin();
}

const API_URL = getApiBase();

const ART_ROUTES = {
  network: '/api/art/network',
  soup: '/api/art/soup',
  ascii: '/api/art/ascii',
  vortex: '/api/art/vortex',
  orbit: '/api/art/orbit'
};

function clamp01(value, fallback) {
  const number = Number(value);
  if (Number.isNaN(number)) {
    return fallback;
  }
  return Math.min(1, Math.max(0, number));
}

function normalizeArtPayload(payload, source) {
  const normalized = { ...payload, _source: source };

  if (!normalized.links && normalized.cooccurrenceLinks) {
    // Gallery / legacy analysis objects store co-occurrence links only.
    normalized.cooccurrenceLinks = normalized.cooccurrenceLinks;
  }

  return normalized;
}

function artRequestBody(text, settings = {}) {
  return {
    text,
    density: clamp01(settings.density, 0.6),
    motion: clamp01(settings.motion, 0.4),
    intensity: clamp01(settings.intensity, 0.4)
  };
}

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
    body: JSON.stringify(artRequestBody(text, settings))
  });

  if (!response.ok) {
    throw new Error('Echo art API failed: ' + response.status);
  }

  return normalizeArtPayload(await response.json(), 'api');
}

export async function generateModeArt(mode, text, settings = {}) {
  try {
    return await fetchModeArt(mode, text, settings);
  } catch (error) {
    console.log('could not load mode art from API, using local fallback');
    console.log(error);
    return buildLocalModeArt(mode, text, settings);
  }
}

// General analysis — still used where full analysis is needed; local fallback only.
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
    return analyzeTextLocally(text, density);
  }
}

async function parseJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

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
    throw new Error(data.error || data.message || `Failed to save work (HTTP ${response.status})`);
  }

  return data;
}

export async function fetchWorks() {
  const response = await fetch(`${API_URL}/api/works`);
  const data = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(data.error || data.message || `Failed to load gallery (HTTP ${response.status})`);
  }

  return Array.isArray(data) ? data : [];
}

export async function fetchWork(id) {
  const response = await fetch(`${API_URL}/api/works/${id}`);
  const data = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(data.error || data.message || `Failed to load work (HTTP ${response.status})`);
  }

  return data;
}

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
      throw new Error(body.error || `Failed to update work (HTTP ${response.status})`);
    }

    return await response.json();
  } catch (error) {
    if (error.message) throw error;
    throw new Error('Could not update work — is the backend running?');
  }
}

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
