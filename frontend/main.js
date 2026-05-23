/**
 * Echo — main application orchestration (Studio page).
 */

import { analyzeText, saveWork } from './helperJS/apiClient.js';
import { SAMPLE_PASSAGE } from './helperJS/textProcessing.js';
import { renderEchoMode, destroyEchoMode } from './helperJS/renderMode.js';
import { applyTheme, initTheme, syncThemeUI } from './helperJS/theme.js';

const state = {
  theme: 'night',
  mode: 'network',
  intensity: 40,
  density: 60,
  motion: 40,
  paused: false,
  analysis: null,
  renderer: null,
  saving: false
};

const siteNav = document.querySelector('.site-nav');
const composeForm = document.getElementById('compose-form');
const passageInput = document.getElementById('text-input');
const charCounter = document.getElementById('char-counter');
const composeError = document.getElementById('compose-error');
const transformStatus = document.getElementById('transform-status');
const sampleBtn = document.getElementById('sample-btn');
const themeNightBtn = document.getElementById('theme-night');
const themePaperBtn = document.getElementById('theme-paper');
const modeSelect = document.getElementById('mode-select');
const modeStatus = document.getElementById('mode-status');
const intensitySlider = document.getElementById('intensity-slider');
const densitySlider = document.getElementById('density-slider');
const motionSlider = document.getElementById('motion-slider');
const intensityValue = document.getElementById('intensity-value');
const densityValue = document.getElementById('density-value');
const motionValue = document.getElementById('motion-value');
const transformBtn = document.getElementById('transform-btn');
const newTextBtn = document.getElementById('new-text-btn');
const studioBackBtn = document.getElementById('studio-back-btn');
const studioModeBtns = document.querySelectorAll('.studio-mode-btn');
const studioCanvas = document.getElementById('studio-canvas');
const asciiOutput = document.getElementById('ascii-output');
const studioHint = document.getElementById('studio-hint');
const fieldSummary = document.getElementById('field-summary');
const enterBtn = document.getElementById('enter-btn');
const saveBtn = document.getElementById('save-btn');
const saveStatus = document.getElementById('save-status');

function requireElement(value, name) {
  if (!value) throw new Error(`Echo init failed: missing required element #${name}`);
}

requireElement(composeForm, 'compose-form');
requireElement(passageInput, 'text-input');
requireElement(transformBtn, 'transform-btn');
requireElement(studioCanvas, 'studio-canvas');
requireElement(modeSelect, 'mode-select');
requireElement(charCounter, 'char-counter');

function init() {
  try {
    updateCharCounter();
    updateControlLabels();
    bindEvents();
    setTheme(initTheme());
    observeSections();
    updateNavOnScroll();
    updateSaveButtonState();
  } catch (error) {
    console.error('Echo init failed:', error);
    setTransformStatus('Echo failed to initialize. Check the browser console.', 'error');
  }
}

function bindEvents() {
  passageInput.addEventListener('input', () => {
    updateCharCounter();
    clearFormError();
  });

  sampleBtn?.addEventListener('click', () => {
    passageInput.value = SAMPLE_PASSAGE;
    updateCharCounter();
    clearFormError();
  });

  composeForm.addEventListener('submit', handleFormSubmit);

  themeNightBtn?.addEventListener('click', () => setTheme('night'));
  themePaperBtn?.addEventListener('click', () => setTheme('paper'));

  modeSelect.addEventListener('change', (e) => {
    state.mode = e.target.value;
    syncStudioModeButtons();
    announceMode(state.mode);
    if (state.analysis) renderCurrentMode();
  });

  intensitySlider?.addEventListener('input', (e) => {
    state.intensity = Number(e.target.value);
    e.target.setAttribute('aria-valuenow', String(state.intensity));
    applyLiveControls();
  });

  densitySlider?.addEventListener('input', (e) => {
    state.density = Number(e.target.value);
    e.target.setAttribute('aria-valuenow', String(state.density));
    applyLiveControls();
  });

  motionSlider?.addEventListener('input', (e) => {
    state.motion = Number(e.target.value);
    e.target.setAttribute('aria-valuenow', String(state.motion));
    applyLiveControls();
  });

  newTextBtn?.addEventListener('click', () => scrollToSection('compose'));
  studioBackBtn?.addEventListener('click', () => scrollToSection('compose'));
  enterBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    scrollToSection('compose');
  });

  studioModeBtns.forEach((btn) => {
    btn.addEventListener('click', () => selectMode(btn.dataset.mode));
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectMode(btn.dataset.mode);
      }
    });
  });

  window.addEventListener('scroll', updateNavOnScroll);
  window.addEventListener('resize', debounce(() => {
    if (state.analysis) renderCurrentMode();
  }, 250));

  saveBtn?.addEventListener('click', handleSave);
}

function selectMode(mode) {
  state.mode = mode;
  modeSelect.value = mode;
  syncStudioModeButtons();
  announceMode(mode);
  if (state.analysis) {
    updateFieldSummary(state.analysis);
    renderCurrentMode();
  }
}

function announceMode(mode) {
  if (modeStatus) modeStatus.textContent = `Visualization mode set to ${mode}.`;
}

function setTheme(theme) {
  if (theme !== 'night' && theme !== 'paper') return;
  state.theme = applyTheme(theme);
  syncThemeUI(state.theme, {
    nightBtn: themeNightBtn,
    paperBtn: themePaperBtn
  });
  if (state.analysis) renderCurrentMode();
}

function scrollToSection(id) {
  const el = document.getElementById(id);
  if (!el) return Promise.resolve();
  el.scrollIntoView({ behavior: 'smooth' });
  return new Promise((resolve) => {
    const done = () => resolve();
    if ('onscrollend' in window) {
      window.addEventListener('scrollend', done, { once: true });
    }
    setTimeout(done, 500);
  });
}

function observeSections() {
  const sections = ['hero', 'compose', 'studio'];
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          document.body.classList.toggle('in-studio', entry.target.id === 'studio');
        }
      });
    },
    { threshold: 0.35 }
  );

  sections.forEach((id) => {
    const el = document.getElementById(id);
    if (el) observer.observe(el);
  });
}

function updateNavOnScroll() {
  siteNav?.classList.toggle('is-scrolled', window.scrollY > 40);
}

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

function applyLiveControls() {
  updateControlLabels();
  if (!state.analysis) return;

  const opts = getRenderOptions();
  updateFieldSummary(state.analysis);

  if (state.renderer?.updateOptions) {
    state.renderer.updateOptions(opts);
    if (['soup', 'vortex', 'ascii'].includes(state.mode)) return;
  }

  renderCurrentMode();
}

function updateCharCounter() {
  const len = passageInput.value.length;
  charCounter.textContent = `${String(len).padStart(4, '0')} / 1200`;
}

function showFormError(message) {
  if (!composeError) return;
  composeError.textContent = message;
  composeError.hidden = false;
  passageInput.setAttribute('aria-invalid', 'true');
}

function clearFormError() {
  if (!composeError) return;
  composeError.textContent = '';
  composeError.hidden = true;
  passageInput.removeAttribute('aria-invalid');
}

function setTransformStatus(message, type = 'info') {
  if (!transformStatus) return;
  transformStatus.textContent = message;
  transformStatus.dataset.status = type;
}

function setLoading(loading) {
  transformBtn.disabled = loading;
  transformBtn.setAttribute('aria-busy', String(loading));
  studioCanvas?.classList.toggle('is-loading', loading);
  if (loading) setTransformStatus('Transforming your passage…');
}

function updateFieldSummary(analysis) {
  if (!fieldSummary) return;

  if (!analysis) {
    fieldSummary.innerHTML = `
      <span class="field-summary__line field-summary__line--idle">
        <span class="field-summary__meta">awaiting passage</span>
        <span class="field-summary__sep" aria-hidden="true"> ✦ </span>
        <span class="field-summary__words">enter text and transform to begin</span>
      </span>`;
    return;
  }

  const core = (analysis.words || []).slice(0, 6).map((w) => w.text);
  const related = (analysis.relatedWords || []).slice(0, 8).map((w) => w.text);
  const mode = state.mode;

  const coreLine = core.length
    ? `<span class="field-summary__line">
        <span class="field-summary__meta">${mode} mode</span>
        <span class="field-summary__sep" aria-hidden="true"> ✦ </span>
        <span class="field-summary__meta">core words:</span>
        <span class="field-summary__words">${core.join(', ')}</span>
      </span>`
    : `<span class="field-summary__line">
        <span class="field-summary__meta">${mode} mode</span>
      </span>`;

  const relatedLine = related.length
    ? `<span class="field-summary__line">
        <span class="field-summary__meta">related echoes:</span>
        <span class="field-summary__words">${related.join(', ')}</span>
      </span>`
    : '';

  fieldSummary.innerHTML = `
    ${coreLine}
    ${relatedLine}
    <span class="field-summary__line field-summary__line--controls">
      <span class="field-summary__meta">density ${state.density}</span>
      <span class="field-summary__sep" aria-hidden="true"> • </span>
      <span class="field-summary__meta">motion ${state.motion}</span>
      <span class="field-summary__sep" aria-hidden="true"> • </span>
      <span class="field-summary__meta">intensity ${state.intensity}</span>
    </span>`;
}

async function handleFormSubmit(event) {
  event.preventDefault();

  const formData = new FormData(composeForm);
  const text = String(formData.get('text') || '').trim();

  if (!text) {
    showFormError('Please enter some text before transforming.');
    passageInput.focus();
    setTransformStatus('Transform cancelled — passage is empty.', 'error');
    return;
  }

  clearFormError();
  setLoading(true);

  try {
    destroyCurrentRenderer();

    const analysis = await analyzeText(text, {
      density: state.density / 100
    });

    state.analysis = analysis;
    setTransformStatus('Transform complete. Echo field generated.', 'success');
    updateFieldSummary(analysis);
    updateSaveButtonState();

    await scrollToSection('studio');
    await renderCurrentMode();
  } catch (error) {
    console.error('Transform failed:', error);
    showFormError('Something went wrong while transforming. Please try again.');
    setTransformStatus('Transform failed. Check your connection and try again.', 'error');
  } finally {
    setLoading(false);
    transformBtn.removeAttribute('aria-busy');
  }
}

async function renderCurrentMode() {
  if (!state.analysis || !studioCanvas) return;

  try {
    const opts = getRenderOptions();
    if (studioHint) studioHint.hidden = state.mode === 'ascii';

    state.renderer = await renderEchoMode({
      container: studioCanvas,
      asciiEl: asciiOutput,
      mode: state.mode,
      data: state.analysis,
      options: opts,
      renderer: state.renderer
    });

    updateFieldSummary(state.analysis);
  } catch (error) {
    console.error('Render failed:', error);
    setTransformStatus('Visualization failed to render.', 'error');
  }
}

function destroyCurrentRenderer() {
  try {
    destroyEchoMode({
      container: studioCanvas,
      asciiEl: asciiOutput,
      renderer: state.renderer
    });
    state.renderer = null;
  } catch (error) {
    console.error('Error destroying renderer:', error);
  }
}

function updateSaveButtonState() {
  if (!saveBtn) return;
  const canSave = Boolean(state.analysis) && !state.saving;
  saveBtn.disabled = !canSave;
}

function setSaveStatus(message, type = 'info') {
  if (!saveStatus) return;
  saveStatus.textContent = message;
  saveStatus.dataset.status = type;
}

function buildWorkPayload() {
  const analysis = state.analysis;
  const originalText = passageInput.value.trim() || analysis?.text || '';

  return {
    originalText,
    coreWords: analysis?.words || [],
    relatedWords: analysis?.relatedWords || [],
    particles: analysis?.particles || [],
    mode: state.mode,
    density: state.density / 100,
    motion: state.motion / 100,
    intensity: state.intensity / 100,
    options: {
      density: state.density / 100,
      motion: state.motion / 100,
      intensity: state.intensity / 100,
      paused: state.paused
    },
    analysisData: analysis ? JSON.parse(JSON.stringify(analysis)) : {}
  };
}

async function handleSave() {
  if (!state.analysis) {
    setSaveStatus('Transform text before saving.', 'error');
    return;
  }

  state.saving = true;
  updateSaveButtonState();
  setSaveStatus('Saving to gallery…');

  try {
    await saveWork(buildWorkPayload());
    setSaveStatus('Saved to Gallery.', 'success');
  } catch (error) {
    console.error('Save failed:', error);
    setSaveStatus(error.message || 'Failed to save work.', 'error');
  } finally {
    state.saving = false;
    updateSaveButtonState();
  }
}

function syncStudioModeButtons() {
  studioModeBtns.forEach((btn) => {
    const active = btn.dataset.mode === state.mode;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', String(active));
    btn.tabIndex = active ? 0 : -1;
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
