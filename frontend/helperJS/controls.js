// controls.js
// small helper functions for sliders, canvas sizing, and switching modes

import { renderNetwork, destroyNetwork } from './network.js';
import { renderSoup, destroySoup } from './soup.js';
import { renderAscii, destroyAscii } from './ascii.js';
import { renderVortex, renderOrbit, destroyVortex } from './vortex.js';


// turns a density slider value into a real number
export function densityToCount(density, min = 8, max = 40) {
  let d = density;
  if (d < 0) d = 0;
  if (d > 1) d = 1;
  return Math.round(min + d * (max - min));
}


// makes the canvas match the size of its parent
export function fitCanvas(canvas, context, container) {
  const width = container.clientWidth;
  const height = container.clientHeight;

  canvas.width = width;
  canvas.height = height;

  canvas.style.width = '100%';
  canvas.style.height = '100%';

  return { width, height };
}


// removes the old visualization before drawing a new one
export function clearMode(container, asciiBox) {
  destroyNetwork(container);
  destroySoup(container);
  destroyVortex(container);

  if (asciiBox) {
    destroyAscii(container, asciiBox);
    asciiBox.hidden = true;
  }
}


// chooses which visualization to show -> this basically calls the correct function to render the mode
export function renderMode({ container, asciiEl, mode, data, options }) {
  clearMode(container, asciiEl);

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