import { applyTheme, initTheme } from './helperJS/theme.js';

applyTheme(initTheme());

const nav = document.querySelector('.about-nav');

if (nav) {
  window.addEventListener('scroll', function () {
    nav.classList.toggle('is-scrolled', window.scrollY > 24);
  });
}
