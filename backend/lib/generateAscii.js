/**
 * Echo ASCII art-data generator — structured text-art layout lines.
 */

const { clamp01 } = require('./generateParticles');

function buildAsciiLayout(analysis, options = {}) {
  const density = clamp01(options.density ?? 0.6);
  const intensity = clamp01(options.intensity ?? 0.4);

  const words = [...(analysis.words || [])]
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, Math.round(4 + density * 16));

  const maxRepeat = Math.round(2 + density * 6 + intensity * 2);
  const padSpread = Math.round(intensity * 3);

  const header = [
    '· · · · · · · · · · · · · · · · · · · · · · · · · · · · · · ·',
    '',
    '                         e c h o',
    '',
    '· · · · · · · · · · · · · · · · · · · · · · · · · · · · · · ·',
    ''
  ];

  const body = words.map((w, i) => {
    const repeat = Math.min(w.frequency || 1, maxRepeat);
    const pad = '  '.repeat(i % (padSpread + 1));
    return `${pad}${w.text.repeat(Math.max(1, repeat))}`;
  });

  body.push('');
  body.push('— — — — — — — — — — — — — — — — — — — — — — — — — —');

  const fragmentLen = Math.round(8 + density * 14);
  const fragment = (analysis.text || '')
    .split(/\s+/)
    .slice(0, fragmentLen)
    .join(' ')
    .toLowerCase();

  if (fragment) {
    body.push('');
    body.push(`  "${fragment}…"`);
  }

  body.push('');
  body.push('  [ ' + words.map((w) => w.text).join(' · ') + ' ]');

  return [...header, ...body];
}

function generateAsciiData(analysis, options = {}) {
  const lines = buildAsciiLayout(analysis, options);
  return {
    mode: 'ascii',
    lines,
    words: analysis.words,
    particles: analysis.particles,
    meta: analysis.meta
  };
}

module.exports = { buildAsciiLayout, generateAsciiData };
