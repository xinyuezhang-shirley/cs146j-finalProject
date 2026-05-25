// Calls my Express API at /api/* (falls back to local textProcessing when offline).

import { analyzeTextLocally } from './textProcessing.js';
import { clamp01 } from './controls.js';

export function getApiBase() {
  const { protocol, hostname, port } = window.location;

  if (protocol === 'file:' || (hostname !== 'localhost' && hostname !== '127.0.0.1')) {
    return 'http://localhost:3000';
  }

  if (port === '3000' || port === '') return '';
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

    if (!response.ok) throw new Error(`Echo API failed: ${response.status}`);

    const data = await response.json();
    return { ...data, meta: { ...data.meta, source: 'echo-api' } };
  } catch {
    return analyzeTextLocally(text, density);
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
  } catch {
    throw new Error('Open http://localhost:3000 and run npm run dev — not Live Server.');
  }

  if (!response.ok) throw await parseApiError(response, 'Failed to save work');
  return response.json();
}

export async function fetchWorks() {
  let response;

  try {
    response = await fetch(apiUrl('/api/works'));
  } catch {
    throw new Error('Open http://localhost:3000 and run npm run dev.');
  }

  if (!response.ok) throw await parseApiError(response, 'Failed to load gallery');
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
