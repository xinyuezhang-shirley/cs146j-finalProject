// theme settings

const STORAGE_KEY = 'echo-theme';

// get current colors from CSS
export function getThemeColors() {
  const styles = getComputedStyle(document.body);

  return {
    bg: styles.getPropertyValue('--bg').trim(),
    text: styles.getPropertyValue('--text').trim(),
    muted: styles.getPropertyValue('--muted').trim(),
    line: styles.getPropertyValue('--line').trim(),
    panel: styles.getPropertyValue('--panel').trim()
  };
}

// turn a hex color into rgba with transparency (for canvas fades)
export function withAlpha(color, alpha) {
  const hex = color.replace('#', '');
  let r;
  let g;
  let b;

  if (hex.length === 3) {
    r = parseInt(hex.charAt(0) + hex.charAt(0), 16);
    g = parseInt(hex.charAt(1) + hex.charAt(1), 16);
    b = parseInt(hex.charAt(2) + hex.charAt(2), 16);
  } else {
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
  }

  return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
}

// switch between night and paper mode
export function applyTheme(theme) {
  if (theme === 'paper') {
    document.body.classList.add('paper');
  } else {
    document.body.classList.remove('paper');
    theme = 'night';
  }

  localStorage.setItem(STORAGE_KEY, theme);

  return theme;
}

// load saved theme when page starts
export function initTheme() {
  const savedTheme = localStorage.getItem(STORAGE_KEY);

  if (savedTheme === 'paper') {
    return applyTheme('paper');
  }

  return applyTheme('night');
}

// update active theme buttons
export function syncThemeUI(theme, nightBtn, paperBtn) {
  if (theme === 'night') {
    nightBtn.classList.add('is-active');
    paperBtn.classList.remove('is-active');
  } else {
    paperBtn.classList.add('is-active');
    nightBtn.classList.remove('is-active');
  }
}