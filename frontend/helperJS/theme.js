// theme settings
// this file handles switching between Night mode and Paper mode
// the selected theme is saved so it stays the same when the user reloads

const STORAGE_KEY = 'echo-theme';

// read the current theme colors from CSS variables
// visualizations use this so they automatically match the active theme
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

// convert a hex color like "#ffffff" into an rgba string
// this is useful for canvas drawing where we want transparency
// example: withAlpha('#ffffff', 0.2) -> rgba(255, 255, 255, 0.2)
export function withAlpha(color, alpha) {
  // remove the # so we only have the hex digits
  const hex = color.replace('#', '');

  let r;
  let g;
  let b;

  // support short hex colors like #fff
  if (hex.length === 3) {
    r = parseInt(hex.charAt(0) + hex.charAt(0), 16);
    g = parseInt(hex.charAt(1) + hex.charAt(1), 16);
    b = parseInt(hex.charAt(2) + hex.charAt(2), 16);
  }
  // support normal hex colors like #ffffff
  else {
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
  }

  return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
}

// switch between Night and Paper themes
// Paper mode adds a CSS class to the body
// Night mode is the default and removes that class
export function applyTheme(theme) {
  if (theme === 'paper') {
    document.body.classList.add('paper');
  } else {
    // anything other than paper becomes night mode
    document.body.classList.remove('paper');
    theme = 'night';
  }

  // remember the user's choice for future page loads
  localStorage.setItem(STORAGE_KEY, theme);

  return theme;
}

// run once when the page starts
// load the user's saved theme from localStorage
export function initTheme() {
  const savedTheme = localStorage.getItem(STORAGE_KEY);

  // restore paper mode if it was previously selected
  if (savedTheme === 'paper') {
    return applyTheme('paper');
  }

  // otherwise default to night mode
  return applyTheme('night');
}

// update the theme buttons so the active one is highlighted
// only one button should be active at a time
export function syncThemeUI(theme, nightBtn, paperBtn) {
  if (theme === 'night') {
    nightBtn.classList.add('is-active');
    paperBtn.classList.remove('is-active');
  } else {
    paperBtn.classList.add('is-active');
    nightBtn.classList.remove('is-active');
  }
}