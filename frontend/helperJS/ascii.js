/**
 * ASCII — animated minimalist text-art.
 *
 * density   → word count, repetition, scatter rows
 * intensity → indentation spread, fragmentation, glitch spacing
 * motion    → reflow / flicker speed
 * paused    → freeze current frame
 */

import { clamp01 } from './controls.js';

function clearVisualization(container) {
  if (!container) return;
  container.querySelectorAll('canvas, svg').forEach((el) => el.remove());
}

function getWords(data, count) {
  const pool = (data.words || data.particles?.filter((p) => p.type === 'core') || [])
    .sort((a, b) => (b.frequency || 1) - (a.frequency || 1));

  if (!pool.length) return [{ text: 'silence', frequency: 1 }];

  const words = [];
  for (let i = 0; i < count; i++) {
    words.push(pool[i % pool.length]);
  }
  return words;
}

function getAsciiParams(options) {
  const density = clamp01(options.density ?? 0.6);
  const motion = clamp01(options.motion ?? 0.4);
  const intensity = clamp01(options.intensity ?? 0.4);

  return {
    density,
    motion,
    intensity,
    wordCount: Math.round(3 + density * 28),
    maxRepeat: Math.round(1 + density * 12 + intensity * 4),
    scatterRows: Math.round(2 + density * 20),
    padSpread: Math.round(1 + intensity * 12),
    fragmentLen: Math.round(6 + density * 22),
    regenEvery: Math.max(3, Math.round(22 - motion * 16)),
    jitter: intensity * 0.9
  };
}

function fragmentWord(str, intensity, tick, index) {
  if (intensity < 0.25) return str;

  const gapEvery = Math.max(3, Math.floor(10 - intensity * 6));
  return str
    .split('')
    .map((char, i) => {
      if (i > 0 && (i + tick + index) % gapEvery === 0) {
        return intensity > 0.55 ? `${char} · ` : `${char} `;
      }
      return char;
    })
    .join('');
}

function buildAsciiFrame(data, params, tick) {
  const words = getWords(data, params.wordCount);
  const pulse = Math.sin(tick * 0.08) * 0.5 + 0.5;

  const header = [
    '· · · · · · · · · · · · · · · · · · · · · · · · · · · · · · ·',
    '',
    `${' '.repeat(Math.round(pulse * params.padSpread))}e c h o`,
    '',
    '· · · · · · · · · · · · · · · · · · · · · · · · · · · · · · ·',
    ''
  ];

  const body = [];

  words.forEach((w, i) => {
    const word = w.text || w;
    const repeat = Math.max(1, Math.min(w.frequency || 1, params.maxRepeat));
    const wave = Math.sin(tick * 0.12 + i * 0.65) * 0.5 + 0.5;
    const indent = ' '.repeat(Math.round(wave * params.padSpread * 2));
    let line = `${indent}${word.repeat(repeat)}`;
    line = fragmentWord(line, params.intensity, tick, i);
    body.push(line);
  });

  if (params.scatterRows > 0) {
    body.push('');
    for (let r = 0; r < params.scatterRows; r++) {
      const w = words[(r + tick) % words.length];
      const word = w.text || w;
      const drift = Math.sin(tick * 0.1 + r * 0.9) * 0.5 + 0.5;
      const pad = ' '.repeat(Math.round(drift * params.padSpread * 3));
      const repeats = Math.max(1, Math.round(1 + params.density * 4 * (drift + 0.2)));
      body.push(fragmentWord(`${pad}${word.repeat(repeats)}`, params.jitter, tick + r, r));
    }
  }

  body.push('');
  body.push('— — — — — — — — — — — — — — — — — — — — — — — — — —');

  const tokens = (data.text || '').split(/\s+/).filter(Boolean);
  const start = Math.floor((Math.sin(tick * 0.05) * 0.5 + 0.5) * Math.max(0, tokens.length - params.fragmentLen));
  const fragment = tokens
    .slice(start, start + params.fragmentLen)
    .join(' ')
    .toLowerCase();

  if (fragment) {
    body.push('');
    const quotePad = ' '.repeat(Math.round(params.intensity * params.padSpread));
    body.push(`${quotePad}"${fragment}${params.intensity > 0.6 ? ' …' : '…'}"`);
  }

  body.push('');
  const indexWords = words.slice(0, Math.min(words.length, Math.round(4 + params.density * 10)));
  const separator = params.intensity > 0.45 ? '  ·  ' : ' · ';
  body.push(`  [ ${indexWords.map((w) => w.text || w).join(separator)} ]`);

  if (params.intensity > 0.7 && tick % 2 === 0) {
    body.push('');
    body.push('  ' + indexWords.map((w) => (w.text || w)[0] || '').join(' '.repeat(Math.round(params.padSpread / 2))));
  }

  return [...header, ...body];
}

export function renderAscii(container, asciiEl, data, options = {}) {
  destroyAscii(container, asciiEl);

  if (!asciiEl) {
    throw new Error('ASCII render failed: missing #ascii-output element.');
  }

  clearVisualization(container);
  container.style.display = 'none';
  asciiEl.hidden = false;

  let simOptions = {
    density: clamp01(options.density ?? 0.6),
    motion: clamp01(options.motion ?? 0.4),
    intensity: clamp01(options.intensity ?? 0.4),
    paused: options.paused ?? false
  };

  let params = getAsciiParams(simOptions);
  let tick = 0;
  let frame = 0;
  let animationId = null;

  function renderFrame() {
    params = getAsciiParams(simOptions);
    asciiEl.textContent = buildAsciiFrame(data, params, tick).join('\n');
  }

  function loop() {
    frame += 1;
    if (!simOptions.paused && frame % params.regenEvery === 0) {
      tick += 1;
      renderFrame();
    }
    animationId = requestAnimationFrame(loop);
  }

  renderFrame();
  loop();

  const api = {
    updateOptions(newOptions = {}) {
      if (newOptions.density !== undefined) simOptions.density = clamp01(newOptions.density);
      if (newOptions.motion !== undefined) simOptions.motion = clamp01(newOptions.motion);
      if (newOptions.intensity !== undefined) simOptions.intensity = clamp01(newOptions.intensity);
      if (newOptions.paused !== undefined) simOptions.paused = newOptions.paused;
      params = getAsciiParams(simOptions);
      renderFrame();
    },
    pause: () => {
      simOptions.paused = true;
    },
    resume: () => {
      simOptions.paused = false;
    },
    destroy: () => destroyAscii(container, asciiEl)
  };

  if (container) container._asciiInstance = { cleanup: () => {
    if (animationId) cancelAnimationFrame(animationId);
    animationId = null;
  }};

  return api;
}

export function destroyAscii(container, asciiEl) {
  if (container?._asciiInstance) {
    container._asciiInstance.cleanup();
    container._asciiInstance = null;
  }

  clearVisualization(container);

  if (container) container.style.display = '';

  if (asciiEl) {
    asciiEl.hidden = true;
    asciiEl.textContent = '';
  }
}
