/**
 * Shared init for secondary pages (Gallery, About).
 */

import { initTheme, applyTheme } from './theme.js';

export function initPageTheme() {
  applyTheme(initTheme());
}
