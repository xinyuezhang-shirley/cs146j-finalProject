/**
 * Echo particle generation — sized word objects for canvas visualizations.
 */

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function densityToCount(density, min = 8, max = 40) {
  const d = clamp01(density);
  return Math.round(min + d * (max - min));
}

function buildParticles(words, relatedWords = [], density = 1) {
  const maxFreq = Math.max(...words.map((w) => w.frequency), 1);
  const limit = Math.max(8, Math.round(words.length * density));

  const coreParticles = words.slice(0, limit).map((word) => ({
    text: word.text,
    type: 'core',
    source: 'input',
    frequency: word.frequency,
    size: 0.7 + (word.frequency / maxFreq) * 1.3,
    opacity: 0.55 + (word.frequency / maxFreq) * 0.45,
    semanticScore: word.frequency / maxFreq
  }));

  const relatedLimit = Math.max(4, Math.round(relatedWords.length * density));
  const relatedParticles = relatedWords.slice(0, relatedLimit).map((word, i) => ({
    text: word.text,
    type: 'related',
    source: word.source || 'echo',
    frequency: 1,
    size: 0.5 + (1 - i * 0.05) * 0.4,
    opacity: 0.15 + (1 - i * 0.08) * 0.25,
    semanticScore: word.score || 0.3
  }));

  return [...coreParticles, ...relatedParticles];
}

function sliceParticles(particles, density) {
  const count = densityToCount(density, 6, Math.max(6, particles.length));
  return particles.slice(0, count);
}

function generateSoupData(analysis, options = {}) {
  const density = clamp01(options.density ?? 0.6);
  return {
    mode: 'soup',
    particles: sliceParticles(analysis.particles || [], density),
    meta: analysis.meta
  };
}

function generateVortexData(analysis, options = {}) {
  const density = clamp01(options.density ?? 0.6);
  return {
    mode: 'vortex',
    particles: sliceParticles(analysis.particles || [], density),
    meta: analysis.meta
  };
}

function generateOrbitData(analysis, options = {}) {
  const density = clamp01(options.density ?? 0.6);
  return {
    mode: 'orbit',
    particles: sliceParticles(analysis.particles || [], density),
    meta: analysis.meta
  };
}

module.exports = {
  clamp01,
  densityToCount,
  buildParticles,
  sliceParticles,
  generateSoupData,
  generateVortexData,
  generateOrbitData
};
