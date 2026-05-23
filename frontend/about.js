/**
 * Echo About page — restrained scroll reveal and image parallax.
 */

import { initPageTheme } from './helperJS/pageInit.js';

initPageTheme();

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

initScrollReveal();
initNavScroll();

if (!prefersReducedMotion) {
  initParallax();
}

function initScrollReveal() {
  const targets = document.querySelectorAll('[data-reveal]');
  if (!targets.length) return;

  if (prefersReducedMotion) {
    targets.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { root: null, rootMargin: '0px 0px 8% 0px', threshold: 0.02 }
  );

  targets.forEach((el) => observer.observe(el));
}

function initNavScroll() {
  const nav = document.querySelector('.about-nav');
  if (!nav) return;

  const onScroll = () => {
    nav.classList.toggle('is-scrolled', window.scrollY > 24);
  };

  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

function initParallax() {
  const layer = document.querySelector('[data-parallax]');
  if (!layer) return;

  let ticking = false;

  const update = () => {
    layer.style.transform = `translate3d(0, ${window.scrollY * 0.06}px, 0)`;
    ticking = false;
  };

  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    },
    { passive: true }
  );

  update();
}
