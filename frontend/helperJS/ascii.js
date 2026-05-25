// ASCII text-art mode — animated monospace layout.

import { clamp01 } from './controls.js';

// remove any canvas/svg left in the studio container
function clearVisualization(container) {
  if (!container) {
    return;
  }
  const extras = container.querySelectorAll('canvas, svg');
  for (let i = 0; i < extras.length; i++) {
    extras[i].remove();
  }
}

// pick the most important words and repeat them to fill the frame
function getWords(data, count) {
  let pool = data.words || [];

  if (!pool.length && data.particles) {
    pool = [];
    for (let i = 0; i < data.particles.length; i++) {
      if (data.particles[i].type === 'core') {
        pool.push(data.particles[i]);
      }
    }
  }

  pool.sort(function (a, b) {
    return (b.frequency || 1) - (a.frequency || 1);
  });

  if (!pool.length) {
    return [{ text: 'silence', frequency: 1 }];
  }

  const words = [];
  for (let i = 0; i < count; i++) {
    words.push(pool[i % pool.length]);
  }
  return words;
}

// turn slider values into layout settings for this mode
function getAsciiParams(options) {
  let density = options.density;
  if (density === undefined) {
    density = 0.6;
  }
  density = clamp01(density);

  let motion = options.motion;
  if (motion === undefined) {
    motion = 0.4;
  }
  motion = clamp01(motion);

  let intensity = options.intensity;
  if (intensity === undefined) {
    intensity = 0.4;
  }
  intensity = clamp01(intensity);

  return {
    density: density,
    motion: motion,
    intensity: intensity,
    wordCount: Math.round(3 + density * 28),
    maxRepeat: Math.round(1 + density * 12 + intensity * 4),
    scatterRows: Math.round(2 + density * 20),
    padSpread: Math.round(1 + intensity * 12),
    fragmentLen: Math.round(6 + density * 22),
    regenEvery: Math.max(3, Math.round(22 - motion * 16)),
    jitter: intensity * 0.9
  };
}

// break up a word with spaces when intensity is high
function fragmentWord(str, intensity, tick, index) {
  if (intensity < 0.25) {
    return str;
  }

  const gapEvery = Math.max(3, Math.floor(10 - intensity * 6));
  const chars = str.split('');
  let result = '';

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    if (i > 0 && (i + tick + index) % gapEvery === 0) {
      if (intensity > 0.55) {
        result = result + char + ' · ';
      } else {
        result = result + char + ' ';
      }
    } else {
      result = result + char;
    }
  }

  return result;
}

// build one frame of ASCII art as an array of text lines
function buildAsciiFrame(data, params, tick) {
  const words = getWords(data, params.wordCount);
  const pulse = Math.sin(tick * 0.08) * 0.5 + 0.5;

  const header = [
    '· · · · · · · · · · · · · · · · · · · · · · · · · · · · · · ·',
    '',
    ' '.repeat(Math.round(pulse * params.padSpread)) + 'e c h o',
    '',
    '· · · · · · · · · · · · · · · · · · · · · · · · · · · · · · ·',
    ''
  ];

  const body = [];

  // main word block
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const word = w.text || w;
    const repeat = Math.max(1, Math.min(w.frequency || 1, params.maxRepeat));
    const wave = Math.sin(tick * 0.12 + i * 0.65) * 0.5 + 0.5;
    const indent = ' '.repeat(Math.round(wave * params.padSpread * 2));
    let line = indent + word.repeat(repeat);
    line = fragmentWord(line, params.intensity, tick, i);
    body.push(line);
  }

  // extra scattered lines below
  if (params.scatterRows > 0) {
    body.push('');
    for (let r = 0; r < params.scatterRows; r++) {
      const w = words[(r + tick) % words.length];
      const word = w.text || w;
      const drift = Math.sin(tick * 0.1 + r * 0.9) * 0.5 + 0.5;
      const pad = ' '.repeat(Math.round(drift * params.padSpread * 3));
      const repeats = Math.max(1, Math.round(1 + params.density * 4 * (drift + 0.2)));
      body.push(fragmentWord(pad + word.repeat(repeats), params.jitter, tick + r, r));
    }
  }

  body.push('');
  body.push('— — — — — — — — — — — — — — — — — — — — — — — — — —');

  // pull a moving quote from the original passage
  const tokens = (data.text || '').split(/\s+/).filter(Boolean);
  const start = Math.floor(
    (Math.sin(tick * 0.05) * 0.5 + 0.5) * Math.max(0, tokens.length - params.fragmentLen)
  );
  const fragment = tokens.slice(start, start + params.fragmentLen).join(' ').toLowerCase();

  if (fragment) {
    body.push('');
    const quotePad = ' '.repeat(Math.round(params.intensity * params.padSpread));
    if (params.intensity > 0.6) {
      body.push(quotePad + '"' + fragment + ' …"');
    } else {
      body.push(quotePad + '"' + fragment + '…"');
    }
  }

  body.push('');
  const indexWords = words.slice(0, Math.min(words.length, Math.round(4 + params.density * 10)));
  const separator = params.intensity > 0.45 ? '  ·  ' : ' · ';
  const indexLine = indexWords.map(function (w) {
    return w.text || w;
  }).join(separator);
  body.push('  [ ' + indexLine + ' ]');

  if (params.intensity > 0.7 && tick % 2 === 0) {
    body.push('');
    const initials = indexWords.map(function (w) {
      const text = w.text || w;
      return text[0] || '';
    }).join(' '.repeat(Math.round(params.padSpread / 2)));
    body.push('  ' + initials);
  }

  return header.concat(body);
}

export function renderAscii(container, asciiEl, data, options) {
  if (!options) {
    options = {};
  }

  destroyAscii(container, asciiEl);

  if (!asciiEl) {
    throw new Error('ASCII render failed: missing #ascii-output element.');
  }

  // setup
  clearVisualization(container);
  container.style.display = 'none';
  asciiEl.hidden = false;

  let simOptions = {
    density: clamp01(options.density !== undefined ? options.density : 0.6),
    motion: clamp01(options.motion !== undefined ? options.motion : 0.4),
    intensity: clamp01(options.intensity !== undefined ? options.intensity : 0.4),
    paused: options.paused ? options.paused : false
  };

  let params = getAsciiParams(simOptions);
  let tick = 0;
  let frame = 0;
  let animationId = null;

  // drawing
  function renderFrame() {
    params = getAsciiParams(simOptions);
    const lines = buildAsciiFrame(data, params, tick);
    asciiEl.textContent = lines.join('\n');
  }

  // animation loop
  function loop() {
    frame = frame + 1;
    if (!simOptions.paused && frame % params.regenEvery === 0) {
      tick = tick + 1;
      renderFrame();
    }
    animationId = requestAnimationFrame(loop);
  }

  renderFrame();
  loop();

  const api = {
    updateOptions: function (newOptions) {
      if (!newOptions) {
        newOptions = {};
      }
      if (newOptions.density !== undefined) {
        simOptions.density = clamp01(newOptions.density);
      }
      if (newOptions.motion !== undefined) {
        simOptions.motion = clamp01(newOptions.motion);
      }
      if (newOptions.intensity !== undefined) {
        simOptions.intensity = clamp01(newOptions.intensity);
      }
      if (newOptions.paused !== undefined) {
        simOptions.paused = newOptions.paused;
      }
      params = getAsciiParams(simOptions);
      renderFrame();
    },
    pause: function () {
      simOptions.paused = true;
    },
    resume: function () {
      simOptions.paused = false;
    },
    destroy: function () {
      destroyAscii(container, asciiEl);
    }
  };

  // cleanup
  if (container) {
    container._asciiInstance = {
      cleanup: function () {
        if (animationId) {
          cancelAnimationFrame(animationId);
        }
        animationId = null;
      }
    };
  }

  return api;
}

export function destroyAscii(container, asciiEl) {
  if (container && container._asciiInstance) {
    container._asciiInstance.cleanup();
    container._asciiInstance = null;
  }

  clearVisualization(container);

  if (container) {
    container.style.display = '';
  }

  if (asciiEl) {
    asciiEl.hidden = true;
    asciiEl.textContent = '';
  }
}
