// slider helpers + simple canvas sizing + pick a visualization mode

import { renderNetwork, destroyNetwork } from './network.js';
import { renderSoup, destroySoup } from './soup.js';
import { renderAscii, destroyAscii } from './ascii.js';
import { renderVortex, renderOrbit, destroyVortex } from './vortex.js';

export function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

export function densityToCount(density, min, max) {
  if (min === undefined) min = 8;
  if (max === undefined) max = 40;
  const d = clamp01(density);
  return Math.round(min + d * (max - min));
}

// read the container's width and height from the page layout
export function getContainerSize(container) {
  const rect = container.getBoundingClientRect();
  const width = rect.width || container.clientWidth;
  const height = rect.height || container.clientHeight;
  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height))
  };
}

// size the canvas to match its container (handles retina screens)
export function fitCanvas(canvas, ctx, container) {
  const size = getContainerSize(container);
  const dpr = window.devicePixelRatio || 1;

  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  canvas.width = Math.max(1, Math.round(size.width * dpr));
  canvas.height = Math.max(1, Math.round(size.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  return size;
}

// tear down whatever mode was showing before
export function destroyEchoMode(params) {
  const container = params.container;
  const asciiEl = params.asciiEl;
  const renderer = params.renderer;

  if (renderer && renderer.destroy) {
    renderer.destroy();
  }

  destroyNetwork(container);
  destroySoup(container);
  destroyVortex(container);

  if (asciiEl) {
    destroyAscii(container, asciiEl);
    asciiEl.hidden = true;
  }
}

// studio + gallery both call this to draw the right visualization
export function renderEchoMode(params) {
  destroyEchoMode({
    container: params.container,
    asciiEl: params.asciiEl,
    renderer: params.renderer
  });

  const container = params.container;
  const asciiEl = params.asciiEl;
  const mode = params.mode;
  const data = params.data;
  const options = params.options;

  if (mode === 'ascii') {
    asciiEl.hidden = false;
    return renderAscii(container, asciiEl, data, options);
  }

  asciiEl.hidden = true;

  if (mode === 'soup') {
    return renderSoup(container, data, options);
  }
  if (mode === 'vortex') {
    return renderVortex(container, data, options);
  }
  if (mode === 'orbit') {
    return renderOrbit(container, data, options);
  }

  return renderNetwork(container, data, options);
}
