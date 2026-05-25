// imports
import { analyzeText, saveWork } from './helperJS/apiClient.js';
import { SAMPLE_PASSAGE } from './helperJS/textProcessing.js';
import { renderEchoMode, destroyEchoMode } from './helperJS/controls.js';
import { applyTheme, initTheme, syncThemeUI } from './helperJS/theme.js';

// state
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

// page elements
const siteNav = document.querySelector('.site-nav');
const enterBtn = document.getElementById('enter-btn');

const composeForm = document.getElementById('compose-form');
const passageInput = document.getElementById('text-input');
const charCounter = document.getElementById('char-counter');
const composeError = document.getElementById('compose-error');
const transformStatus = document.getElementById('transform-status');
const sampleBtn = document.getElementById('sample-btn');
const transformBtn = document.getElementById('transform-btn');
const newTextBtn = document.getElementById('new-text-btn');

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

const studioBackBtn = document.getElementById('studio-back-btn');
const studioModeBtns = document.querySelectorAll('.studio-mode-btn');
const studioCanvas = document.getElementById('studio-canvas');
const asciiOutput = document.getElementById('ascii-output');
const studioHint = document.getElementById('studio-hint');
const fieldSummary = document.getElementById('field-summary');
const saveBtn = document.getElementById('save-btn');
const saveStatus = document.getElementById('save-status');

// Screen-managing functions

//directly jumps to sections needed
function scrollToSection(id) {
  const section = document.getElementById(id);
  if (!section) {
    return;
  }
  section.scrollIntoView({ behavior: 'smooth' });
}

//adds a transparent background for the nav bar if scrolled down
function updateNavOnScroll() {
  siteNav.classList.toggle('is-scrolled', window.scrollY > 40);
}


function syncStudioModeButtons() {
  studioModeBtns.forEach(function (btn) {
    const active = btn.dataset.mode === state.mode;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', String(active));
    btn.tabIndex = active ? 0 : -1;
  });
}

function selectMode(mode) {
  state.mode = mode;
  modeSelect.value = mode;
  syncStudioModeButtons();
  modeStatus.textContent = 'Visualization mode set to ' + mode + '.';
  if (state.analysis) {
    updateFieldSummary(state.analysis);
    renderCurrentMode();
  }
}

// theme works even before the user transforms text
function setTheme(theme) {
  if (theme !== 'night' && theme !== 'paper') {
    return;
  }
  state.theme = applyTheme(theme);
  syncThemeUI(state.theme, themeNightBtn, themePaperBtn);
  if (state.analysis) {
    renderCurrentMode();
  }
}


function updateCharCounter() {
  const len = passageInput.value.length;
  charCounter.textContent = String(len).padStart(4, '0') + ' / 1200';
}

function showFormError(message) {
  composeError.textContent = message;
  composeError.hidden = false;
  passageInput.setAttribute('aria-invalid', 'true');
}

function clearFormError() {
  composeError.textContent = '';
  composeError.hidden = true;
  passageInput.removeAttribute('aria-invalid');
}

function setLoading(loading) {
  transformBtn.disabled = loading;
  studioCanvas.classList.toggle('is-loading', loading);
  if (loading) {
    transformStatus.textContent = 'Transforming your passage…';
  }
}

//--------------------------------------------------------
//update slide bar value
function updateControlLabels() {
  intensityValue.textContent = String(state.intensity);
  densityValue.textContent = String(state.density);
  motionValue.textContent = String(state.motion);
}

// update the graph when sliders move
function applyLiveControls() {
  updateControlLabels();
  if (!state.analysis) {
    return;
  }

  const opts = {
    intensity: state.intensity / 100,
    density: state.density / 100,
    motion: state.motion / 100,
    paused: state.paused
  };

  updateFieldSummary(state.analysis);

  if (state.renderer && state.renderer.updateOptions) {
    state.renderer.updateOptions(opts);
    if (state.mode === 'soup' || state.mode === 'vortex' || state.mode === 'ascii') {
      return;
    }
  }

  renderCurrentMode();
}

function updateFieldSummary(analysis) {
  if (!analysis) {
    fieldSummary.innerHTML =
      '<span class="field-summary__line field-summary__line--idle">' +
        '<span class="field-summary__meta">awaiting passage</span>' +
        '<span class="field-summary__sep" aria-hidden="true"> ✦ </span>' +
        '<span class="field-summary__words">enter text and transform to begin</span>' +
      '</span>';
    return;
  }

  const words = analysis.words ? analysis.words : [];
  const relatedWords = analysis.relatedWords ? analysis.relatedWords : [];
  const core = words.slice(0, 6).map(function (w) { return w.text; });
  const related = relatedWords.slice(0, 8).map(function (w) { return w.text; });
  const mode = state.mode;

  let coreLine;
  if (core.length) {
    coreLine =
      '<span class="field-summary__line">' +
        '<span class="field-summary__meta">' + mode + ' mode</span>' +
        '<span class="field-summary__sep" aria-hidden="true"> ✦ </span>' +
        '<span class="field-summary__meta">core words:</span>' +
        '<span class="field-summary__words">' + core.join(', ') + '</span>' +
      '</span>';
  } else {
    coreLine =
      '<span class="field-summary__line">' +
        '<span class="field-summary__meta">' + mode + ' mode</span>' +
      '</span>';
  }

  let relatedLine = '';
  if (related.length) {
    relatedLine =
      '<span class="field-summary__line">' +
        '<span class="field-summary__meta">related echoes:</span>' +
        '<span class="field-summary__words">' + related.join(', ') + '</span>' +
      '</span>';
  }

  fieldSummary.innerHTML =
    coreLine +
    relatedLine +
    '<span class="field-summary__line field-summary__line--controls">' +
      '<span class="field-summary__meta">density ' + state.density + '</span>' +
      '<span class="field-summary__sep" aria-hidden="true"> • </span>' +
      '<span class="field-summary__meta">motion ' + state.motion + '</span>' +
      '<span class="field-summary__sep" aria-hidden="true"> • </span>' +
      '<span class="field-summary__meta">intensity ' + state.intensity + '</span>' +
    '</span>';
}

// textarea → API → visualization
async function handleFormSubmit(event) {
  event.preventDefault();

  const formData = new FormData(composeForm);
  const text = String(formData.get('text') || '').trim();

  if (!text) {
    showFormError('Please enter some text before transforming.');
    passageInput.focus();
    transformStatus.textContent = 'Transform cancelled — passage is empty.';
    transformStatus.dataset.status = 'error';
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
    transformStatus.textContent = 'Transform complete. Echo field generated.';
    transformStatus.dataset.status = 'success';
    updateFieldSummary(analysis);
    saveBtn.disabled = false;

    scrollToSection('studio');
    setTimeout(function () {
      renderCurrentMode();
    }, 300);
  } catch (error) {
    showFormError('Something went wrong while transforming. Please try again.');
    transformStatus.textContent = 'Transform failed. Check your connection and try again.';
    transformStatus.dataset.status = 'error';
  } finally {
    setLoading(false);
  }
}

function renderCurrentMode() {
  if (!state.analysis) {
    return;
  }

  const opts = {
    intensity: state.intensity / 100,
    density: state.density / 100,
    motion: state.motion / 100,
    paused: state.paused
  };

  studioHint.hidden = state.mode === 'ascii';

  state.renderer = renderEchoMode({
    container: studioCanvas,
    asciiEl: asciiOutput,
    mode: state.mode,
    data: state.analysis,
    options: opts,
    renderer: state.renderer
  });

  updateFieldSummary(state.analysis);
}

function destroyCurrentRenderer() {
  destroyEchoMode({
    container: studioCanvas,
    asciiEl: asciiOutput,
    renderer: state.renderer
  });
  state.renderer = null;
}

async function handleSave() {
  if (!state.analysis) {
    saveStatus.textContent = 'Transform text before saving.';
    saveStatus.dataset.status = 'error';
    return;
  }

  state.saving = true;
  saveBtn.disabled = true;
  saveStatus.textContent = 'Saving to gallery…';

  const analysis = state.analysis;
  let originalText = passageInput.value.trim();
  if (!originalText && analysis.text) {
    originalText = analysis.text;
  }

  try {
    await saveWork({
      originalText: originalText,
      coreWords: analysis.words ? analysis.words : [],
      relatedWords: analysis.relatedWords ? analysis.relatedWords : [],
      particles: analysis.particles ? analysis.particles : [],
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
      analysisData: JSON.parse(JSON.stringify(analysis))
    });
    saveStatus.textContent = 'Saved to Gallery.';
    saveStatus.dataset.status = 'success';
  } catch (error) {
    const message = error.message ? error.message : 'Failed to save work.';
    saveStatus.textContent = message;
    saveStatus.dataset.status = 'error';
  } finally {
    state.saving = false;
    saveBtn.disabled = false;
  }
}

function debounce(fn, ms) {
  let timer;
  return function () {
    const args = arguments;
    clearTimeout(timer);
    timer = setTimeout(function () {
      fn.apply(null, args);
    }, ms);
  };
}

// event listeners

passageInput.addEventListener('input', function () {
  updateCharCounter();
  clearFormError();
});

sampleBtn.addEventListener('click', function () {
  passageInput.value = SAMPLE_PASSAGE;
  updateCharCounter();
  clearFormError();
});

composeForm.addEventListener('submit', handleFormSubmit);

themeNightBtn.addEventListener('click', function () {
  setTheme('night');
});

themePaperBtn.addEventListener('click', function () {
  setTheme('paper');
});

modeSelect.addEventListener('change', function (e) {
  state.mode = e.target.value;
  syncStudioModeButtons();
  modeStatus.textContent = 'Visualization mode set to ' + state.mode + '.';
  if (state.analysis) {
    renderCurrentMode();
  }
});

intensitySlider.addEventListener('input', function (e) {
  state.intensity = Number(e.target.value);
  e.target.setAttribute('aria-valuenow', String(state.intensity));
  applyLiveControls();
});

densitySlider.addEventListener('input', function (e) {
  state.density = Number(e.target.value);
  e.target.setAttribute('aria-valuenow', String(state.density));
  applyLiveControls();
});

motionSlider.addEventListener('input', function (e) {
  state.motion = Number(e.target.value);
  e.target.setAttribute('aria-valuenow', String(state.motion));
  applyLiveControls();
});

newTextBtn.addEventListener('click', function () {
  scrollToSection('compose');
});

studioBackBtn.addEventListener('click', function () {
  scrollToSection('compose');
});

enterBtn.addEventListener('click', function (e) {
  e.preventDefault();
  scrollToSection('compose');
});

studioModeBtns.forEach(function (btn) {
  btn.addEventListener('click', function () {
    selectMode(btn.dataset.mode);
  });
  btn.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      selectMode(btn.dataset.mode);
    }
  });
});

window.addEventListener('scroll', updateNavOnScroll);
window.addEventListener('resize', debounce(function () {
  if (state.analysis) {
    renderCurrentMode();
  }
}, 250));

saveBtn.addEventListener('click', handleSave);

// startup
updateCharCounter();
updateControlLabels();
setTheme(initTheme());
updateNavOnScroll();
saveBtn.disabled = true;
