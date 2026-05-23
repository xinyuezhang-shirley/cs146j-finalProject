/**
 * Shared renderer dispatch for Studio and Gallery preview.
 */

import { renderNetwork, destroyNetwork } from './network.js';
import { renderSoup, destroySoup } from './soup.js';
import { renderAscii, destroyAscii } from './ascii.js';
import { renderVortex, renderOrbit, destroyVortex } from './vortex.js';
import {
  waitForContainerLayout,
  bindStudioWheelGuard,
  unbindStudioWheelGuard
} from './canvasSize.js';

const VALID_MODES = new Set(['network', 'soup', 'ascii', 'vortex', 'orbit']);

/**
 * Reconstruct analysis-shaped data from a saved work row.
 */
export function normalizeWorkData(work) {
  const analysis = work?.analysisData && typeof work.analysisData === 'object'
    ? work.analysisData
    : {};

  return {
    text: work?.originalText || analysis.text || '',
    words: (work?.coreWords?.length ? work.coreWords : analysis.words) || [],
    relatedWords: (work?.relatedWords?.length ? work.relatedWords : analysis.relatedWords) || [],
    particles: (work?.particles?.length ? work.particles : analysis.particles) || [],
    links: analysis.links || [],
    nodes: analysis.nodes || [],
    frequency: analysis.frequency || {},
    meta: analysis.meta || {}
  };
}

/**
 * Build renderer options from a saved work.
 */
export function workToRenderOptions(work) {
  const opts = work?.options && typeof work.options === 'object' ? work.options : {};
  return {
    density: clampUnit(work?.density ?? opts.density, 0.6),
    motion: clampUnit(work?.motion ?? opts.motion, 0.4),
    intensity: clampUnit(work?.intensity ?? opts.intensity, 0.4),
    paused: Boolean(opts.paused ?? false)
  };
}

function clampUnit(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

export function destroyEchoMode({ container, asciiEl, renderer }) {
  try {
    renderer?.destroy?.();
  } catch (error) {
    console.warn('Renderer destroy failed:', error);
  }

  if (container) {
    destroyNetwork(container);
    destroySoup(container);
    destroyVortex(container);
  }

  if (asciiEl && container) {
    destroyAscii(container, asciiEl);
  }

  if (asciiEl) {
    asciiEl.hidden = true;
  }

  unbindStudioWheelGuard(container);
}

/**
 * Render a visualization mode into the given container.
 * Returns the renderer handle (same as individual render* functions).
 */
export async function renderEchoMode({ container, asciiEl, mode, data, options, renderer }) {
  destroyEchoMode({ container, asciiEl, renderer });

  if (!container) {
    throw new Error('renderEchoMode: missing container');
  }

  await waitForContainerLayout(container);

  const normalizedMode = VALID_MODES.has(mode) ? mode : 'network';

  if (asciiEl) {
    asciiEl.hidden = normalizedMode !== 'ascii';
  }

  let handle;

  switch (normalizedMode) {
    case 'network':
      handle = renderNetwork(container, data, options);
      break;
    case 'soup':
      handle = renderSoup(container, data, options);
      break;
    case 'ascii':
      if (!asciiEl) throw new Error('renderEchoMode: ASCII mode requires asciiEl');
      handle = renderAscii(container, asciiEl, data, options);
      break;
    case 'vortex':
      handle = renderVortex(container, data, options);
      break;
    case 'orbit':
      handle = renderOrbit(container, data, options);
      break;
    default:
      handle = renderNetwork(container, data, options);
  }

  bindStudioWheelGuard(container, { enabled: normalizedMode !== 'ascii' });
  return handle;
}
