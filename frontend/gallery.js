import { applyTheme, initTheme } from './helperJS/theme.js';
import { fetchWorks, deleteWork, updateWork } from './helperJS/apiClient.js';
import { renderEchoMode, destroyEchoMode } from './helperJS/controls.js';
import { analyzeTextLocally, SAMPLE_PASSAGE } from './helperJS/textProcessing.js';
import { initSound } from './helperJS/sound.js';

const VALID_MODES = ['network', 'soup', 'ascii', 'vortex', 'orbit'];

// gallery page elements

const notice = document.querySelector('#gallery-notice');
const grid = document.querySelector('#gallery-grid');

const previewTitle = document.querySelector('#gallery-preview-title');
const previewSettings = document.querySelector('#gallery-preview-settings');
const previewCanvas = document.querySelector('#gallery-preview-canvas');
const previewAscii = document.querySelector('#gallery-preview-ascii');

const modal = document.querySelector('#gallery-modal');
const modalSave = document.querySelector('#gallery-modal-save');
const modalStatus = document.querySelector('#gallery-modal-status');
const closeButtons = document.querySelectorAll('[data-close]');

const intensitySlider = document.querySelector('#modal-intensity-slider');
const densitySlider = document.querySelector('#modal-density-slider');
const motionSlider = document.querySelector('#modal-motion-slider');

const intensityValue = document.querySelector('#modal-intensity-value');
const densityValue = document.querySelector('#modal-density-value');
const motionValue = document.querySelector('#modal-motion-value');

let works = [];
let selectedWork = null;
let previewRenderer = null;

// 0–100 slider state for the open piece
let intensity = 40;
let density = 60;
let motion = 40;

applyTheme(initTheme());
initSound();
loadGallery();


// placeholder piece when the gallery API is unavailable
function getDemoWork() {
  const analysis = analyzeTextLocally(SAMPLE_PASSAGE, 0.6);

  return {
    id: 'demo-local',
    title: 'Romantic Death · demo',
    originalText: SAMPLE_PASSAGE,
    coreWords: analysis.words,
    relatedWords: analysis.relatedWords,
    particles: analysis.particles,
    mode: 'network',
    density: 0.6,
    motion: 0.4,
    intensity: 0.4,
    options: { intensity: 0.4, density: 0.6, motion: 0.4 },
    analysisData: analysis,
    createdAt: new Date().toISOString()
  };
}


// fetch saved pieces on load and render them (or show empty/error state)
async function loadGallery() {
  notice.textContent = 'Loading saved Echo pieces...';

  try {
    works = await fetchWorks(); // fetch the works from the database

    if (works.length === 0) {
      notice.textContent = 'No saved pieces yet. Transform text in the Studio and click Save to Gallery.';
      grid.innerHTML = '<p class="gallery-empty">Nothing saved yet.</p>';
      return;
    }

    // async returns with works, so set the status and render the grid
    notice.textContent = works.length + ' saved piece(s) in the archive.';
    renderGrid();

  } catch (error) {
    console.log(error);
    works = [];
    notice.textContent =
      error && error.message
        ? error.message
        : 'Could not load gallery. Open http://localhost:3000/gallery.html with the backend running.';
    grid.innerHTML = '<p class="gallery-empty">Could not load saved works.</p>';
  }
}


// rebuild the whole card grid from the saved works
function renderGrid() {
  grid.innerHTML = '';

  if (works.length === 0) {
    grid.innerHTML = '<p class="gallery-empty">Nothing saved yet.</p>';
    return;
  }

  works.forEach(function (work) {
    const card = document.createElement('article');
    card.className = 'gallery-card';

    card.innerHTML =
      '<h2 class="gallery-card__title">' + escapeHtml(work.title) + '</h2>' +
      '<p class="gallery-card__preview">' + escapeHtml(truncate(work.originalText, 140)) + '</p>' +
      '<p class="gallery-card__meta">mode: ' + escapeHtml(work.mode) + '</p>' +
      '<p class="gallery-card__meta">' + formatSettings(work) + '</p>' +
      '<button type="button" class="gallery-card__delete">Delete</button>';

    card.addEventListener('click', function () {
      selectWork(work);
    });

    const deleteButton = card.querySelector('.gallery-card__delete');
    deleteButton.addEventListener('click', function (event) {
      event.stopPropagation();
      handleDelete(work);
    });

    grid.appendChild(card);
  });
}


// open a piece in the modal: seed sliders from its saved values, then render
function selectWork(work) {
  selectedWork = work;

  intensity = Math.round(Number(work.intensity || 0.4) * 100);
  density = Math.round(Number(work.density || 0.6) * 100);
  motion = Math.round(Number(work.motion || 0.4) * 100);

  syncSliders();

  previewTitle.textContent = work.title;
  updateSettingsLabel();

  modalStatus.textContent = '';
  modal.hidden = false;
  document.body.style.overflow = 'hidden';

  whenPreviewCanvasReady(renderPreview);
}

function whenPreviewCanvasReady(callback) {
  const rect = previewCanvas.getBoundingClientRect();
  if (rect.width > 8 && rect.height > 8) {
    callback();
    return;
  }

  const observer = new ResizeObserver(function () {
    const size = previewCanvas.getBoundingClientRect();
    if (size.width > 8 && size.height > 8) {
      observer.disconnect();
      callback();
    }
  });

  observer.observe(previewCanvas);
  requestAnimationFrame(function () {
    const size = previewCanvas.getBoundingClientRect();
    if (size.width > 8 && size.height > 8) {
      observer.disconnect();
      callback();
    }
  });
}


function resolveWorkMode(work) {
  const saved = work.analysisData || {};
  const candidate = String(work.mode || saved.mode || 'network').toLowerCase();
  return VALID_MODES.includes(candidate) ? candidate : 'network';
}

// Build the data the renderer expects and draw the visualization in the modal stage.
function renderPreview() {
  if (!selectedWork) {
    return;
  }

  const saved = selectedWork.analysisData || {};
  const previewMode = resolveWorkMode(selectedWork);
  const graphNodes = saved.nodes || [];
  const graphLinks = saved.links || [];
  const useSavedGraph = previewMode === 'network' && graphNodes.length > 0;
  const layoutNodes = graphNodes.map(function (node) {
    const copy = { ...node };
    delete copy.x;
    delete copy.y;
    delete copy.fx;
    delete copy.fy;
    delete copy.vx;
    delete copy.vy;
    return copy;
  });

  const previewData = {
    ...saved,
    mode: previewMode,
    text: selectedWork.originalText || saved.text || '',
    words: selectedWork.coreWords || saved.words || [],
    relatedWords: selectedWork.relatedWords || saved.relatedWords || [],
    particles: selectedWork.particles || saved.particles || [],
    links: graphLinks,
    cooccurrenceLinks: saved.cooccurrenceLinks || saved.links || [],
    nodes: layoutNodes,
    frequency: saved.frequency || {},
    meta: saved.meta || {},
    _source: useSavedGraph ? 'api' : undefined
  };

  const renderOptions = {
    ...optionsFromControls(),
    preferLocalGraph: false
  };

  previewRenderer = renderEchoMode({
    container: previewCanvas,
    asciiEl: previewAscii,
    mode: previewMode,
    data: previewData,
    options: renderOptions,
    renderer: previewRenderer
  });
}


// live slider update — mirrors the Studio's applyLiveControls
function applyControls() {
  if (!selectedWork) {
    return;
  }

  intensity = Number(intensitySlider.value);
  density = Number(densitySlider.value);
  motion = Number(motionSlider.value);

  syncSliders();
  updateSettingsLabel();

  const opts = optionsFromControls();

  const previewMode = resolveWorkMode(selectedWork);

  if (previewRenderer && previewRenderer.updateOptions) {
    previewRenderer.updateOptions(opts);
    if (previewMode !== 'network') {
      return;
    }
  }

  renderPreview();
}


// Convert the 0–100 slider state into the 0–1 options the renderer/API use.
function optionsFromControls() {
  return {
    intensity: intensity / 100,
    density: density / 100,
    motion: motion / 100
  };
}


// Push the current control values back into the slider inputs and their labels.
function syncSliders() {
  intensitySlider.value = intensity;
  densitySlider.value = density;
  motionSlider.value = motion;

  intensityValue.textContent = intensity;
  densityValue.textContent = density;
  motionValue.textContent = motion;
}


// "density 60 · motion 40 · intensity 40" — d/m/i are 0–100 ints.
function settingsText(d, m, i) {
  return 'density ' + d + ' · motion ' + m + ' · intensity ' + i;
}


// Write the modal header line from the live slider values.
function updateSettingsLabel() {
  previewSettings.textContent =
    resolveWorkMode(selectedWork) + ' · ' + settingsText(density, motion, intensity);
}


// Hide the modal and tear down the renderer.
function closeModal() {
  modal.hidden = true;
  document.body.style.overflow = '';

  destroyEchoMode({
    container: previewCanvas,
    asciiEl: previewAscii,
    renderer: previewRenderer
  });

  previewRenderer = null;
  selectedWork = null;
}


// Persist the edited slider values in place and refresh the card's settings text.
async function handleSave() {
  if (!selectedWork) {
    return;
  }

  modalSave.disabled = true;
  modalStatus.textContent = 'Saving changes...';

  try {
    const updated = await updateWork(selectedWork.id, {
      density: density / 100,
      motion: motion / 100,
      intensity: intensity / 100,
      options: optionsFromControls()
    });

    Object.assign(selectedWork, updated);

    modalStatus.textContent = 'Changes saved.';
    renderGrid();

  } catch (error) {
    console.log(error);
    modalStatus.textContent = 'Failed to save changes.';
  }

  modalSave.disabled = false;
}


// Confirm, delete on the server, then update local state, the modal, and the grid.
async function handleDelete(work) {
  const confirmed = window.confirm('Delete "' + work.title + '" from the gallery?');

  if (!confirmed) {
    return;
  }

  try {
    await deleteWork(work.id);

    works = works.filter(function (item) {
      return item.id !== work.id;
    });

    if (selectedWork && selectedWork.id === work.id) {
      closeModal();
    }

    renderGrid();

    if (works.length === 0) {
      notice.textContent = 'No saved pieces yet. Transform text in the Studio and click Save to Gallery.';
    } else {
      notice.textContent = works.length + ' saved piece(s) in the archive.';
    }

  } catch (error) {
    console.log(error);
    notice.textContent = 'Failed to delete work.';
  }
}


// Settings string from a work's saved values, shown on the grid card.
function formatSettings(work) {
  const savedDensity = Math.round(Number(work.density || 0) * 100);
  const savedMotion = Math.round(Number(work.motion || 0) * 100);
  const savedIntensity = Math.round(Number(work.intensity || 0) * 100);

  return settingsText(savedDensity, savedMotion, savedIntensity);
}


// Trim text to max chars, adding an ellipsis when cut.
function truncate(text, max) {
  const value = String(text || '').trim();

  if (value.length <= max) {
    return value;
  }

  return value.slice(0, max - 1) + '…';
}


// Escape HTML special chars, since cards are built via innerHTML from saved text.
function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}


// modal controls
intensitySlider.addEventListener('input', applyControls);
densitySlider.addEventListener('input', applyControls);
motionSlider.addEventListener('input', applyControls);

modalSave.addEventListener('click', handleSave);

closeButtons.forEach(function (button) {
  button.addEventListener('click', closeModal);
});