/**
 * Echo API client — frontend HTTP layer for calling my backend API.
 *
 * This file only sends fetch requests to /api/* routes exposed by backend/server.js.
 * It is NOT the API itself. When the Echo server is offline, it falls back to
 * optional local text processing in textProcessing.js (no external APIs).
 */

import { analyzeTextLocally } from './textProcessing.js';
import { clamp01 } from './controls.js';

/** Echo API origin — same host when served by Express; fallback for Live Server. */
export function getApiBase() {
  const { protocol, hostname, port } = window.location;

  if (
    protocol === 'file:'
    || (hostname !== 'localhost' && hostname !== '127.0.0.1')
  ) {
    return 'http://localhost:3000';
  }

  if (port === '3000' || port === '') {
    return '';
  }

  return 'http://localhost:3000';
}

function apiUrl(path) {
  return `${getApiBase()}${path}`;
}

export async function analyzeText(text, options = {}) {
  const density = clamp01(options.density ?? 1);

  try {
    const response = await fetch(apiUrl('/api/analyze-text'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, density })
    });

    if (!response.ok) {
      throw new Error(`Echo API failed: ${response.status}`);
    }

    const data = await response.json();
    return { ...data, meta: { ...data.meta, source: 'echo-api' } };
  } catch (error) {
    console.warn('Echo API unavailable, using local fallback:', error);
    return analyzeTextLocally(text, density);
  }
}

export async function fetchArtData(text, mode, options = {}) {
  const density = clamp01(options.density ?? 1);
  const endpoint = `/api/art/${mode}`;

  try {
    const response = await fetch(apiUrl(endpoint), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, ...options })
    });
    if (!response.ok) throw new Error(`Echo API failed: ${response.status}`);
    return response.json();
  } catch (error) {
    console.warn('Echo art API unavailable, using local fallback:', error);
    const analysis = analyzeTextLocally(text, density);
    return { mode, ...analysis };
  }
}

async function parseApiError(response, fallback) {
  const body = await response.json().catch(() => ({}));
  const detail = body.message ? `: ${body.message}` : '';
  return new Error(body.error ? `${body.error}${detail}` : `${fallback} (HTTP ${response.status})`);
}

export async function saveWork(work) {
  let response;

  try {
    response = await fetch(apiUrl('/api/works'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(work)
    });
  } catch (error) {
    throw new Error(
      'Cannot reach the Echo API. Open http://localhost:3000 (run npm run dev) — do not use Live Server or file://.'
    );
  }

  if (!response.ok) {
    throw await parseApiError(response, 'Failed to save work');
  }

  return response.json();
}

export async function fetchWorks() {
  let response;

  try {
    response = await fetch(apiUrl('/api/works'));
  } catch {
    throw new Error('Cannot reach the Echo API. Open http://localhost:3000 and run npm run dev.');
  }

  if (!response.ok) {
    throw await parseApiError(response, 'Failed to load gallery');
  }

  return response.json();
}

export async function fetchWork(id) {
  const response = await fetch(apiUrl(`/api/works/${encodeURIComponent(id)}`));

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to load work');
  }

  return response.json();
}

export async function deleteWork(id) {
  const response = await fetch(apiUrl(`/api/works/${encodeURIComponent(id)}`), {
    method: 'DELETE'
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to delete work');
  }

  return response.json();
}
