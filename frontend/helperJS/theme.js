/**
 * Global theme system — single source of truth for night / paper modes.
 * CSS: :root = night, body.paper = paper (all colors via CSS variables).
 */

const STORAGE_KEY = 'echo-theme';

/** Read theme colors from computed CSS custom properties on <body>. */
export function getThemeColors(el = document.body) {
  const s = getComputedStyle(el);
  const v = (name) => s.getPropertyValue(name).trim();

  return {
    bg: v('--bg'),
    text: v('--text'),
    muted: v('--muted'),
    border: v('--border'),
    panel: v('--panel'),
    vizLink: v('--viz-link'),
    vizLinkActive: v('--viz-link-active'),
    vizNodeStroke: v('--viz-node-stroke'),
    vizNodeStrokeActive: v('--viz-node-stroke-active'),
    vizCore: v('--viz-core'),
    vizRelated: v('--viz-related'),
    vizTrail: v('--viz-trail')
  };
}

export function getTheme() {
  return document.body.classList.contains('paper') ? 'paper' : 'night';
}

export function isPaperTheme() {
  return document.body.classList.contains('paper');
}

/**
 * Apply theme globally by toggling body.paper.
 * Night → removes .paper; Paper → adds .paper.
 */
export function applyTheme(theme) {
  if (theme === 'paper') {
    document.body.classList.add('paper');
  } else {
    document.body.classList.remove('paper');
  }

  try {
    localStorage.setItem(STORAGE_KEY, theme === 'paper' ? 'paper' : 'night');
  } catch {
    // ignore storage errors (private browsing, etc.)
  }

  document.body.dataset.theme = theme;
  return theme;
}

/** Restore saved theme or default to night. */
export function initTheme() {
  let theme = 'night';
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'paper' || saved === 'night') theme = saved;
  } catch {
    // use default
  }
  return applyTheme(theme);
}

/** Sync toggle button active states and compose footer label. */
export function syncThemeUI(theme, { nightBtn, paperBtn, composeLabel } = {}) {
  if (nightBtn) {
    const active = theme === 'night';
    nightBtn.classList.toggle('is-active', active);
    nightBtn.setAttribute('aria-pressed', String(active));
  }

  if (paperBtn) {
    const active = theme === 'paper';
    paperBtn.classList.toggle('is-active', active);
    paperBtn.setAttribute('aria-pressed', String(active));
  }

  if (composeLabel) {
    composeLabel.textContent = theme === 'night' ? 'NIGHT · 24 FPS' : 'PAPER · 24 FPS';
  }
}

/** Apply alpha to an rgb/rgba/hex color string. */
export function withAlpha(color, alpha) {
  const rgb = color.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/);
  if (rgb) {
    return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`;
  }
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const full = hex.length === 3
      ? hex.split('').map((c) => c + c).join('')
      : hex;
    const n = parseInt(full, 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}
