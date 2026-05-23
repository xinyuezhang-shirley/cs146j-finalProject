/**
 * Echo — main application orchestration.
 */

import { analyzeText } from './helperJS/apiClient.js';
import { SAMPLE_PASSAGE } from './helperJS/textProcessing.js';
import { renderNetwork, destroyNetwork, setNetworkPaused } from './helperJS/network.js';
import { renderSoup, destroySoup } from './helperJS/soup.js';
import { renderAscii, destroyAscii } from './helperJS/ascii.js';
import { renderVortex, renderOrbit, destroyVortex } from './helperJS/vortex.js';
import { applyTheme, initTheme, syncThemeUI } from './helperJS/theme.js';

console.log('main.js loaded');

// --- State ---

const state = {
  theme: 'night',
  mode: 'network',
  intensity: 40,
  density: 60,
  motion: 40,
  paused: false,
  analysis: null,
  renderer: null
};

// --- DOM refs ---

const siteNav = document.querySelector('.site-nav');
const navLinks = document.querySelectorAll('.site-nav__link');
const passageInput = document.getElementById('passage-input');
const charCounter = document.getElementById('char-counter');
const sampleBtn = document.getElementById('sample-btn');
const themeNightBtn = document.getElementById('theme-night');
const themePaperBtn = document.getElementById('theme-paper');
const modeSelect = document.getElementById('mode-select');

const intensitySlider = document.getElementById('intensity-slider');
const densitySlider = document.getElementById('density-slider');
const motionSlider = document.getElementById('motion-slider');

const intensityValue = document.getElementById('intensity-value');
const densityValue = document.getElementById('density-value');
const motionValue = document.getElementById('motion-value');

const transformBtn = document.getElementById('transform-btn');
const composeThemeLabel = document.getElementById('compose-theme-label');
const newTextBtn = document.getElementById('new-text-btn');
const studioBackBtn = document.getElementById('studio-back-btn');
const studioModeBtns = document.querySelectorAll('.studio-mode-btn');
const studioCanvas = document.getElementById('studio-canvas');

const asciiOutput = document.getElementById('ascii-output');
const studioHint = document.getElementById('studio-hint');
const enterBtn = document.getElementById('enter-btn');

console.log({
  passageInput,
  transformBtn,
  studioCanvas,
  modeSelect
});

function requireElement(value, name) {
  if (!value) {
    throw new Error(`Echo init failed: missing required element #${name}`);
  }
  return value;
}

requireElement(passageInput, 'passage-input');
requireElement(transformBtn, 'transform-btn');
requireElement(studioCanvas, 'studio-canvas');
requireElement(modeSelect, 'mode-select');
requireElement(charCounter, 'char-counter');

// --- Init ---

function init() {
  try {
    updateCharCounter();
    updateControlLabels();
    bindEvents();
    setTheme(initTheme());
    observeSections();
    updateNavOnScroll();
    console.log('Echo init complete');
  } catch (error) {
    console.error('Echo init failed:', error);
    alert('Echo failed to initialize. Open the browser console for details.');
  }
}

function bindEvents() {
  passageInput.addEventListener('input', updateCharCounter);

  sampleBtn?.addEventListener('click', () => {
    passageInput.value = SAMPLE_PASSAGE;
    updateCharCounter();
  });

  themeNightBtn?.addEventListener('click', () => setTheme('night'));
  themePaperBtn?.addEventListener('click', () => setTheme('paper'));

  modeSelect.addEventListener('change', (e) => {
    state.mode = e.target.value;
    syncStudioModeButtons();
    if (state.analysis) renderCurrentMode();
  });

  intensitySlider?.addEventListener('input', (e) => {
    state.intensity = Number(e.target.value);
    applyLiveControls();
  });

  densitySlider?.addEventListener('input', (e) => {
    state.density = Number(e.target.value);
    applyLiveControls();
  });

  motionSlider?.addEventListener('input', (e) => {
    state.motion = Number(e.target.value);
    applyLiveControls();
  });


  transformBtn.addEventListener('click', handleTransform);

  newTextBtn?.addEventListener('click', () => scrollToSection('compose'));
  studioBackBtn?.addEventListener('click', () => scrollToSection('compose'));
  enterBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    scrollToSection('compose');
  });

  studioModeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      state.mode = btn.dataset.mode;
      modeSelect.value = state.mode;
      syncStudioModeButtons();
      if (state.analysis) renderCurrentMode();
    });
  });

  navLinks.forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      scrollToSection(link.dataset.section);
    });
  });

  window.addEventListener('scroll', updateNavOnScroll);
  window.addEventListener('resize', debounce(() => {
    if (state.analysis) renderCurrentMode();
  }, 250));
}

// --- Theme ---

function setTheme(theme) {
  if (theme !== 'night' && theme !== 'paper') return;

  state.theme = applyTheme(theme);

  syncThemeUI(state.theme, {
    nightBtn: themeNightBtn,
    paperBtn: themePaperBtn,
    composeLabel: composeThemeLabel
  });

  if (state.analysis) renderCurrentMode();
}

// --- Navigation ---

function scrollToSection(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth' });
}

function observeSections() {
  const sections = ['hero', 'compose', 'studio'];
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          navLinks.forEach((link) => {
            link.classList.toggle('is-active', link.dataset.section === id);
          });
          document.body.classList.toggle('in-studio', id === 'studio');
        }
      });
    },
    { threshold: 0.4 }
  );

  sections.forEach((id) => {
    const el = document.getElementById(id);
    if (el) observer.observe(el);
  });
}

function updateNavOnScroll() {
  siteNav?.classList.toggle('is-scrolled', window.scrollY > 40);
}

// --- Character counter ---

function updateControlLabels() {
  if (intensityValue) intensityValue.textContent = String(state.intensity);
  if (densityValue) densityValue.textContent = String(state.density);
  if (motionValue) motionValue.textContent = String(state.motion);
}

function getRenderOptions() {
  return {
    intensity: state.intensity / 100,
    density: state.density / 100,
    motion: state.motion / 100,
    paused: state.paused
  };
}

/** Push slider changes into the active renderer when supported (Soup live controls). */
function applyLiveControls() {
  updateControlLabels();
  if (!state.analysis) return;

  const opts = getRenderOptions();

  if (state.mode === 'soup' && state.renderer?.updateOptions) {
    state.renderer.updateOptions(opts);
    return;
  }

  if (state.mode === 'vortex' && state.renderer?.updateOptions) {
    state.renderer.updateOptions(opts);
    return;
  }

  if (state.mode === 'ascii' && state.renderer?.updateOptions) {
    state.renderer.updateOptions(opts);
    return;
  }

  renderCurrentMode();
}

function updateCharCounter() {
  const len = passageInput.value.length;
  charCounter.textContent = `${String(len).padStart(4, '0')} / 1200`;
}

// --- Transform & render ---

async function handleTransform() {
  console.log('TRANSFORM CLICKED');

  const text = passageInput.value.trim();
  console.log('input text:', text);

  if (!text) {
    alert('Please enter some text first.');
    passageInput.focus();
    return;
  }

  try {
    studioCanvas.classList.add('is-loading');
    destroyCurrentRenderer();

    const analysis = await analyzeText(text, {
      density: state.density / 100
    });

    console.log('analysis result:', analysis);

    state.analysis = analysis;

    document.getElementById('studio')?.scrollIntoView({
      behavior: 'smooth'
    });

    renderCurrentMode();
  } catch (error) {
    console.error('Transform failed:', error);
    alert('Something went wrong while transforming the text. Check the console.');
  } finally {
    studioCanvas.classList.remove('is-loading');
  }
}

function renderCurrentMode() {
  if (!state.analysis) {
    console.warn('No analysis yet.');
    return;
  }

  if (!studioCanvas) {
    console.error('Missing #studio-canvas');
    return;
  }

  console.log('Rendering mode:', state.mode);

  try {
    destroyCurrentRenderer();
    if (asciiOutput) asciiOutput.hidden = true;

    const opts = getRenderOptions();

    if (studioHint) studioHint.hidden = state.mode === 'ascii';

    switch (state.mode) {
      case 'network':
        state.renderer = renderNetwork(studioCanvas, state.analysis, opts);
        break;
      case 'soup':
        state.renderer = renderSoup(studioCanvas, state.analysis, opts);
        break;
      case 'ascii':
        state.renderer = renderAscii(studioCanvas, asciiOutput, state.analysis, opts);
        break;
      case 'vortex':
        state.renderer = renderVortex(studioCanvas, state.analysis, opts);
        break;
      case 'orbit':
        state.renderer = renderOrbit(studioCanvas, state.analysis, opts);
        break;
      default:
        console.warn('Unknown mode, falling back to network:', state.mode);
        state.renderer = renderNetwork(studioCanvas, state.analysis, opts);
    }
  } catch (error) {
    console.error('Render failed:', error);
    throw error;
  }
}

function destroyCurrentRenderer() {
  try {
    if (state.renderer && typeof state.renderer.destroy === 'function') {
      state.renderer.destroy();
    }
    state.renderer = null;

    if (studioCanvas) {
      destroyNetwork(studioCanvas);
      destroySoup(studioCanvas);
      destroyVortex(studioCanvas);
    }
    if (asciiOutput) {
      destroyAscii(studioCanvas, asciiOutput);
    }
  } catch (error) {
    console.error('Error destroying renderer:', error);
  }
}

function syncStudioModeButtons() {
  studioModeBtns.forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.mode === state.mode);
  });
}


function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

init();
