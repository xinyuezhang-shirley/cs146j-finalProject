import { applyTheme, initTheme } from './helperJS/theme.js';
import { initSound } from './helperJS/sound.js';

applyTheme(initTheme());
initSound();

const nav = document.querySelector('.about-nav');

// added a scroll event listener so the nav bar changes color
if (nav) {
  window.addEventListener('scroll', function () {
    nav.classList.toggle('is-scrolled', window.scrollY > 24);
  });
}
