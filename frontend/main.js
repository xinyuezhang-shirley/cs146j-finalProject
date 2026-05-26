// main.js
// connects the form, controls, theme buttons, visualization, and save button

import { analyzeText, saveWork } from './helperJS/apiClient.js';
import { SAMPLE_PASSAGE } from './helperJS/textProcessing.js';
import { renderEchoMode, destroyEchoMode } from './helperJS/controls.js';
import { applyTheme, initTheme, syncThemeUI } from './helperJS/theme.js';

const state = {
  theme: 'night',
  mode: 'network',
  intensity: 40,
  density: 60,
  motion: 40,
  analysis: null,
  renderer: null
};

// page elements
const nav = document.querySelector('.site-nav');
const enterBtn = document.querySelector('#enter-btn');

const form = document.querySelector('#compose-form');
const textInput = document.querySelector('#text-input');
const charCounter = document.querySelector('#char-counter');
const composeError = document.querySelector('#compose-error');
const transformStatus = document.querySelector('#transform-status');
const sampleBtn = document.querySelector('#sample-btn');
const transformBtn = document.querySelector('#transform-btn');

const themeNightBtn = document.querySelector('#theme-night');
const themePaperBtn = document.querySelector('#theme-paper');

const intensitySlider = document.querySelector('#intensity-slider');
const densitySlider = document.querySelector('#density-slider');
const motionSlider = document.querySelector('#motion-slider');

const intensityValue = document.querySelector('#intensity-value');
const densityValue = document.querySelector('#density-value');
const motionValue = document.querySelector('#motion-value');

const modeButtons = document.querySelectorAll('.studio-mode-btn');
const studioCanvas = document.querySelector('#studio-canvas');
const asciiOutput = document.querySelector('#ascii-output');
const fieldSummary = document.querySelector('#field-summary');
const saveBtn = document.querySelector('#save-btn');
const saveStatus = document.querySelector('#save-status');
const backBtn = document.querySelector('#studio-back-btn');

/***--------------------------small helpers-------------------------***/
//directly scroll to the sectio needed
function scrollToSection(id) {
  document.querySelector('#' + id).scrollIntoView({ behavior: 'smooth' });
}

//give a glass background to the nav bar
function updateNav() {
  nav.classList.toggle('is-scrolled', window.scrollY > 40);
}

//counts characters in texttarea
function updateCounter() {
  const length = textInput.value.length;
  charCounter.textContent = length + ' / 1200';
}

//show error when there's no text but still tries to transform text
function showError(message) {
  composeError.textContent = message;
  composeError.hidden = false;
}

//called when typing (with count char)
function clearError() {
  composeError.textContent = '';
  composeError.hidden = true;
}

//write state values on screen (update when slider moves)
function updateSliderLabels() {
  intensityValue.textContent = state.intensity;
  densityValue.textContent = state.density;
  motionValue.textContent = state.motion;
}

function getOptions() {
  return {
    intensity: state.intensity / 100,
    density: state.density / 100,
    motion: state.motion / 100
  };
}

//switch theme btn moonlight & paper
function setTheme(theme) {
  state.theme = applyTheme(theme);
  syncThemeUI(state.theme, themeNightBtn, themePaperBtn);
}


/***-----------updates the small text line above the visualization--------------***/
function updateSummary() {
  if (!state.analysis) {
    fieldSummary.innerHTML =
      '<span class="field-summary__line field-summary__line--idle">' +
        '<span class="field-summary__meta">awaiting passage</span>' +
        '<span class="field-summary__sep" aria-hidden="true"> ✦ </span>' +
        '<span class="field-summary__words">enter text and transform to begin</span>' +
      '</span>';
    return;
  }
  const words = state.analysis.words || [];
  //related words given by api
  const relatedWords = state.analysis.relatedWords || [];

  const core = words.slice(0, 6).map(function (word) {
    return word.text;
  });
  const related = relatedWords.slice(0, 8).map(function (word) {
    return word.text;
  });

  let html;
  if (core.length) {
    html =
      '<span class="field-summary__line">' +
        '<span class="field-summary__meta">' + state.mode + ' mode</span>' +
        '<span class="field-summary__sep" aria-hidden="true"> ✦ </span>' +
        '<span class="field-summary__meta">core words:</span>' +
        '<span class="field-summary__words">' + core.join(', ') + '</span>' +
      '</span>';
  } else {
    html =
      '<span class="field-summary__line">' +
        '<span class="field-summary__meta">' + state.mode + ' mode</span>' +
      '</span>';
  }

  if (related.length) {
    html +=
      '<span class="field-summary__line">' +
        '<span class="field-summary__meta">related echoes:</span>' +
        '<span class="field-summary__words">' + related.join(', ') + '</span>' +
      '</span>';
  }
  html +=
    '<span class="field-summary__line field-summary__line--controls">' +
      '<span class="field-summary__meta">density ' + state.density + '</span>' +
      '<span class="field-summary__sep" aria-hidden="true"> • </span>' +
      '<span class="field-summary__meta">motion ' + state.motion + '</span>' +
      '<span class="field-summary__sep" aria-hidden="true"> • </span>' +
      '<span class="field-summary__meta">intensity ' + state.intensity + '</span>' +
    '</span>';

  fieldSummary.innerHTML = html;
}

// updates the mode buttons to be active or not based on the current selection
function updateModeButtons() {
  modeButtons.forEach(function (button) {
    const isActive = button.dataset.mode === state.mode;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-selected', isActive);
  });
}

// clears the current visualization for any mode selected
function clearVisualization() {
  destroyEchoMode({
    container: studioCanvas,
    asciiEl: asciiOutput,
    renderer: state.renderer
  });

  state.renderer = null;
}


//render visual
function renderCurrentMode() {
  if (!state.analysis) {
    return;
  }
  // renders the current mode based on the selected mode
  state.renderer = renderEchoMode({
    container: studioCanvas,
    asciiEl: asciiOutput,
    mode: state.mode,
    data: state.analysis,
    options: getOptions(),
    renderer: state.renderer
  });
  updateSummary();
}


/***------- main function that calls text transform and then renders the current mode---***/
async function transformText(event) {
  event.preventDefault(); // prevents the form from submitting

  const text = textInput.value.trim(); // gets the text from the input field

  if (!text) {
    showError('Please enter some text before transforming.');
    return;
  }
  clearError();
  transformBtn.disabled = true;
  transformStatus.textContent = 'Transforming...';
  studioCanvas.classList.add('is-loading');

  try {
    clearVisualization();

    // calls the analyzeText function to analyze the text
    const analysis = await analyzeText(text, {
      density: state.density / 100
    });

    //async finishes, then updates the state and renders the current mode
    state.analysis = analysis;
    transformStatus.textContent = 'Transform complete.';
    saveBtn.disabled = false;

    updateSummary();
    scrollToSection('studio');
    renderCurrentMode();

  } catch (error) {
    console.log(error);
    showError('Something went wrong while transforming.');
    transformStatus.textContent = 'Transform failed.';
  }

  transformBtn.disabled = false;
  studioCanvas.classList.remove('is-loading');
}


// updates the controls for the current mode based on the slider values
function updateControls() {
  state.intensity = Number(intensitySlider.value);
  state.density = Number(densitySlider.value);
  state.motion = Number(motionSlider.value);

  updateSliderLabels();
  updateSummary();

  if (state.analysis) {
    const opts = getOptions();
    if (state.renderer && state.renderer.updateOptions) {
      state.renderer.updateOptions(opts);
      return;
    }

    renderCurrentMode();
  }
}

// saves the current work to the gallery
async function saveCurrentWork() {
  if (!state.analysis) {
    saveStatus.textContent = 'Transform text before saving.';
    return;
  }

  saveBtn.disabled = true;
  saveStatus.textContent = 'Saving...';

  try {
    await saveWork({
      originalText: textInput.value.trim(),
      coreWords: state.analysis.words || [],
      relatedWords: state.analysis.relatedWords || [],
      particles: state.analysis.particles || [],
      mode: state.mode,
      density: state.density / 100,
      motion: state.motion / 100,
      intensity: state.intensity / 100,
      options: getOptions(),
      analysisData: state.analysis
    });

    saveStatus.textContent = 'Saved to Gallery.';
  } catch (error) {
    console.log(error);
    saveStatus.textContent = 'Failed to save.';
  }

  saveBtn.disabled = false;
}


/***-------------event listeners for inputs, buttons, and theme selection----------***/
textInput.addEventListener('input', function () {
  updateCounter();
  clearError();
});

sampleBtn.addEventListener('click', function () {
  textInput.value = SAMPLE_PASSAGE;
  updateCounter();
  clearError();
});

form.addEventListener('submit', transformText);

themeNightBtn.addEventListener('click', function () {
  setTheme('night');
});

themePaperBtn.addEventListener('click', function () {
  setTheme('paper');
});

intensitySlider.addEventListener('input', updateControls);
densitySlider.addEventListener('input', updateControls);
motionSlider.addEventListener('input', updateControls);

modeButtons.forEach(function (button) {
  button.addEventListener('click', function () {
    state.mode = button.dataset.mode;
    updateModeButtons();
    renderCurrentMode();
  });
});

enterBtn.addEventListener('click', function (event) {
  event.preventDefault();
  scrollToSection('compose');
});

backBtn.addEventListener('click', function () {
  scrollToSection('compose');
});

saveBtn.addEventListener('click', saveCurrentWork);
window.addEventListener('scroll', updateNav);

// startup
setTheme(initTheme());
updateCounter();
updateSliderLabels();
updateSummary();
updateNav();
saveBtn.disabled = true;