/**
 * Echo API client — frontend HTTP layer for calling my backend API.
 *
 * This file only sends fetch requests to /api/* routes exposed by backend/server.js.
 * It is NOT the API itself. When the Echo server is offline, it falls back to
 * optional local text processing in textProcessing.js (no external APIs).
 */

import { analyzeTextLocally } from './textProcessing.js';
import { clamp01 } from './controls.js';

export async function analyzeText(text, options = {}) {
  const density = clamp01(options.density ?? 1);

  try {
    const response = await fetch('/api/analyze-text', {
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
    const response = await fetch(endpoint, {
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
