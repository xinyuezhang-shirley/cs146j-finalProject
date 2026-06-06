// local mode art payloads when /api/art/* is unavailable

import { analyzeTextLocally } from './textProcessing.js';
import { buildLocalNetworkArt } from './network.js';
import { clamp01, densityToCount } from './controls.js';

function sliceParticles(particles, density) {
  const d = clamp01(density ?? 0.6);
  const count = densityToCount(d, 6, Math.max(6, particles.length));
  return particles.slice(0, count);
}

// base fields are the same for all modes -> given analysis as input, return the same shape for all modes
function baseFields(analysis) {
  return {
    text: analysis.text,
    words: analysis.words,
    relatedWords: analysis.relatedWords,
    frequency: analysis.frequency,
    cooccurrenceLinks: analysis.links,
    meta: { ...analysis.meta, source: 'local' },
    _source: 'local'
  };
}

// main function for backend when the server is offline — same shape as the API, but no related words
export function buildLocalModeArt(mode, text, settings = {}) {
  const density = settings.density ?? 0.6; // default density
  const analysis = analyzeTextLocally(text, density);

  if (mode === 'network') {
    return buildLocalNetworkArt(analysis, settings);
  }

  if (mode === 'soup' || mode === 'vortex' || mode === 'orbit') {
    return {
      mode,
      particles: sliceParticles(analysis.particles || [], density),
      ...baseFields(analysis)
    };
  }

  if (mode === 'ascii') {
    return {
      mode: 'ascii',
      particles: analysis.particles,
      ...baseFields(analysis)
    };
  }

  throw new Error('Unknown mode: ' + mode);
}
