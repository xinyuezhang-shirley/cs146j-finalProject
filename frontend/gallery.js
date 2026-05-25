import { applyTheme, initTheme } from './helperJS/theme.js';
import { fetchWorks, deleteWork, updateWork } from './helperJS/apiClient.js';
import { renderEchoMode, destroyEchoMode, clamp01 } from './helperJS/controls.js';

const notice = document.getElementById('gallery-notice');
const grid = document.getElementById('gallery-grid');
const previewTitle = document.getElementById('gallery-preview-title');
const previewSettings = document.getElementById('gallery-preview-settings');
const previewCanvas = document.getElementById('gallery-preview-canvas');
const previewAscii = document.getElementById('gallery-preview-ascii');

const modal = document.getElementById('gallery-modal');
const modalSave = document.getElementById('gallery-modal-save');
const modalStatus = document.getElementById('gallery-modal-status');
const closeEls = modal ? modal.querySelectorAll('[data-close]') : [];

const sliders = {
  intensity: document.getElementById('modal-intensity-slider'),
  density: document.getElementById('modal-density-slider'),
  motion: document.getElementById('modal-motion-slider')
};
const sliderValues = {
  intensity: document.getElementById('modal-intensity-value'),
  density: document.getElementById('modal-density-value'),
  motion: document.getElementById('modal-motion-value')
};

let works = [];
let selectedId = null;
let previewRenderer = null;
let lastFocused = null;

// 0–100 slider state for the open piece
const controls = { intensity: 40, density: 60, motion: 40, paused: false };

applyTheme(initTheme());
loadGallery();

// Fetch saved pieces on load and render them (or show empty/error state).
async function loadGallery() {
  setStatus(notice, 'Loading saved Echo pieces…');

  try {
    works = await fetchWorks();

    if (!works.length) {
      setStatus(notice, 'No saved pieces yet. Transform text in the Studio and click Save to Gallery.');
      renderGrid([]);
      return;
    }

    setStatus(notice, `${works.length} saved piece${works.length === 1 ? '' : 's'} in the archive.`);
    renderGrid(works);
  } catch (error) {
    setStatus(notice, error.message || 'Failed to load gallery.', 'error');
    renderGrid([]);
  }
}

// Set a status line's text + data-status (used by both the page notice and the modal).
function setStatus(el, message, type = 'info') {
  if (!el) return;
  el.textContent = message;
  el.dataset.status = type;
}

// Rebuild the whole card grid from a list of works (used only when data changes).
function renderGrid(items) {
  if (!grid) return;

  if (!items.length) {
    grid.innerHTML = '<p class="gallery-empty">Nothing saved yet.</p>';
    return;
  }

  grid.innerHTML = items.map((work) => {
    const date = formatDate(work.createdAt);
    const preview = truncate(work.originalText, 140);
    const corePreview = (work.coreWords || [])
      .slice(0, 5)
      .map((w) => (typeof w === 'string' ? w : w.text))
      .filter(Boolean)
      .join(', ');
    const settings = formatSettings(work);
    const selected = work.id === selectedId;

    return `
      <article
        class="gallery-card${selected ? ' is-selected' : ''}"
        data-id="${work.id}"
        tabindex="0"
        role="button"
        aria-pressed="${selected}"
        aria-labelledby="card-title-${work.id}"
      >
        <header class="gallery-card__header">
          <h2 class="gallery-card__title" id="card-title-${work.id}">${escapeHtml(work.title)}</h2>
          <time class="gallery-card__date" datetime="${work.createdAt || ''}">${date}</time>
        </header>
        <p class="gallery-card__preview">${escapeHtml(preview)}</p>
        <dl class="gallery-card__meta">
          <div class="gallery-card__meta-row">
            <dt>Mode</dt>
            <dd>${escapeHtml(String(work.mode || '').toUpperCase())}</dd>
          </div>
          <div class="gallery-card__meta-row">
            <dt>Settings</dt>
            <dd>${escapeHtml(settings)}</dd>
          </div>
          ${corePreview ? `
          <div class="gallery-card__meta-row">
            <dt>Core</dt>
            <dd>${escapeHtml(corePreview)}</dd>
          </div>` : ''}
        </dl>
        <div class="gallery-card__actions">
          <button
            type="button"
            class="gallery-card__delete"
            data-delete-id="${work.id}"
            aria-label="Delete ${escapeHtml(work.title)}"
          >Delete</button>
        </div>
      </article>`;
  }).join('');
}

// Toggle the selected-card highlight without rebuilding the whole grid.
function setSelectedCard(id) {
  selectedId = id;
  if (!grid) return;
  grid.querySelectorAll('.gallery-card').forEach((card) => {
    const isSelected = card.dataset.id === id;
    card.classList.toggle('is-selected', isSelected);
    card.setAttribute('aria-pressed', String(isSelected));
  });
}

// Open a piece in the modal: seed sliders from its saved values, then render.
function selectWork(id) {
  const work = works.find((item) => item.id === id);
  if (!work) return;

  setSelectedCard(id);

  const extra = work.options && typeof work.options === 'object' ? work.options : {};
  controls.intensity = toSlider(work.intensity != null ? work.intensity : extra.intensity, 0.4);
  controls.density = toSlider(work.density != null ? work.density : extra.density, 0.6);
  controls.motion = toSlider(work.motion != null ? work.motion : extra.motion, 0.4);
  controls.paused = Boolean(extra.paused);
  syncSliders();

  if (previewTitle) previewTitle.textContent = work.title;
  updateSettingsLabel(work);
  setStatus(modalStatus, '');

  openModal();

  // render after the modal is visible so the stage has measurable size
  requestAnimationFrame(() => renderPreview(work));
}

// Build the data the renderer expects and draw the visualization in the modal stage.
function renderPreview(work) {
  try {
    const saved = work.analysisData && typeof work.analysisData === 'object' ? work.analysisData : {};

    const previewData = {
      text: work.originalText || saved.text || '',
      words: work.coreWords && work.coreWords.length ? work.coreWords : (saved.words || []),
      relatedWords: work.relatedWords && work.relatedWords.length ? work.relatedWords : (saved.relatedWords || []),
      particles: work.particles && work.particles.length ? work.particles : (saved.particles || []),
      links: saved.links || [],
      nodes: saved.nodes || [],
      frequency: saved.frequency || {},
      meta: saved.meta || {}
    };

    previewRenderer = renderEchoMode({
      container: previewCanvas,
      asciiEl: previewAscii,
      mode: work.mode,
      data: previewData,
      options: optionsFromControls(),
      renderer: previewRenderer
    });
  } catch {
    setStatus(modalStatus, 'Could not render preview for this piece.', 'error');
  }
}

// live slider update — mirrors the Studio's applyLiveControls
function applyControls() {
  const work = works.find((item) => item.id === selectedId);
  if (!work) return;

  syncSliders();
  updateSettingsLabel(work);

  const opts = optionsFromControls();
  if (previewRenderer && previewRenderer.updateOptions) {
    previewRenderer.updateOptions(opts);
    if (work.mode === 'soup' || work.mode === 'vortex' || work.mode === 'ascii') {
      return;
    }
  }
  renderPreview(work);
}

// Convert the 0–100 slider state into the 0–1 options the renderer/API use.
function optionsFromControls() {
  return {
    intensity: clamp01(controls.intensity / 100),
    density: clamp01(controls.density / 100),
    motion: clamp01(controls.motion / 100),
    paused: controls.paused
  };
}

// Push the current control values back into the slider inputs and their labels.
function syncSliders() {
  ['intensity', 'density', 'motion'].forEach((key) => {
    const slider = sliders[key];
    if (slider) {
      slider.value = String(controls[key]);
      slider.setAttribute('aria-valuenow', String(controls[key]));
    }
    if (sliderValues[key]) sliderValues[key].textContent = String(controls[key]);
  });
}

// "density 60 · motion 40 · intensity 40" — d/m/i are 0–100 ints.
function settingsText(d, m, i) {
  return `density ${d} · motion ${m} · intensity ${i}`;
}

// Write the modal header line from the *live* slider values (e.g. "NETWORK · density 60 …").
function updateSettingsLabel(work) {
  if (!previewSettings) return;
  const settings = settingsText(
    Math.round(controls.density),
    Math.round(controls.motion),
    Math.round(controls.intensity)
  );
  previewSettings.textContent = `${String(work.mode).toUpperCase()} · ${settings}`;
}

// Show the modal, lock page scroll, and move focus to the close button.
function openModal() {
  if (!modal) return;
  lastFocused = document.activeElement;
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  document.getElementById('gallery-modal-close')?.focus();
}

// Hide the modal, tear down the renderer, clear the highlight, and restore focus.
function closeModal() {
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  document.body.style.overflow = '';

  destroyEchoMode({
    container: previewCanvas,
    asciiEl: previewAscii,
    renderer: previewRenderer
  });
  previewRenderer = null;

  setSelectedCard(null);

  if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
  lastFocused = null;
}

// Persist the edited slider values in place (PUT) and refresh the card's settings text.
async function handleSave() {
  const work = works.find((item) => item.id === selectedId);
  if (!work) return;

  modalSave.disabled = true;
  setStatus(modalStatus, 'Saving changes…');

  const opts = optionsFromControls();
  const patch = {
    density: opts.density,
    motion: opts.motion,
    intensity: opts.intensity,
    options: { ...(work.options || {}), ...opts }
  };

  try {
    const updated = await updateWork(work.id, patch);
    Object.assign(work, updated);
    renderGrid(works);
    updateSettingsLabel(work);
    setStatus(modalStatus, 'Changes saved.', 'success');
  } catch (error) {
    setStatus(modalStatus, error.message || 'Failed to save changes.', 'error');
  } finally {
    modalSave.disabled = false;
  }
}

// Convert a stored 0–1 value into a rounded 0–100 slider value (fallback if missing).
function toSlider(value, fallback) {
  const n = Number(value);
  return Math.round(clamp01(Number.isFinite(n) ? n : fallback) * 100);
}

// Confirm, delete on the server, then update local state, the modal, and the grid.
async function handleDelete(id) {
  const work = works.find((item) => item.id === id);
  if (!work) return;

  const confirmed = window.confirm(`Delete "${work.title}" from the gallery?`);
  if (!confirmed) return;

  try {
    await deleteWork(id);
    works = works.filter((item) => item.id !== id);

    if (selectedId === id) {
      closeModal();
    }

    if (!works.length) {
      setStatus(notice, 'No saved pieces yet. Transform text in the Studio and click Save to Gallery.');
      renderGrid([]);
      return;
    }

    setStatus(notice, `${works.length} saved piece${works.length === 1 ? '' : 's'} in the archive.`);
    renderGrid(works);
  } catch (error) {
    setStatus(notice, error.message || 'Failed to delete work.', 'error');
  }
}

// Settings string from a work's *saved* values, shown on the grid card.
function formatSettings(work) {
  return settingsText(
    Math.round(Number(work.density ?? 0) * 100),
    Math.round(Number(work.motion ?? 0) * 100),
    Math.round(Number(work.intensity ?? 0) * 100)
  );
}

// Format an ISO date into a localized short date ('' if missing/invalid).
function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

// Trim text to `max` chars, adding an ellipsis when cut.
function truncate(text, max) {
  const value = String(text || '').trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

// Escape HTML special chars, since cards are built via innerHTML from saved text.
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// grid — one delegated listener instead of re-binding every card on each render
grid?.addEventListener('click', (event) => {
  const deleteBtn = event.target.closest('[data-delete-id]');
  if (deleteBtn) {
    handleDelete(deleteBtn.dataset.deleteId);
    return;
  }
  const card = event.target.closest('.gallery-card');
  if (card) selectWork(card.dataset.id);
});

grid?.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  if (event.target.closest('[data-delete-id]')) return;
  const card = event.target.closest('.gallery-card');
  if (card) {
    event.preventDefault();
    selectWork(card.dataset.id);
  }
});

// modal controls
['intensity', 'density', 'motion'].forEach((key) => {
  sliders[key]?.addEventListener('input', (event) => {
    controls[key] = Number(event.target.value);
    applyControls();
  });
});

modalSave?.addEventListener('click', handleSave);

closeEls.forEach((el) => el.addEventListener('click', closeModal));

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && modal && !modal.hidden) {
    closeModal();
  }
});

window.addEventListener('resize', debounce(() => {
  const work = works.find((item) => item.id === selectedId);
  if (work && modal && !modal.hidden) renderPreview(work);
}, 250));

// Run `fn` only after `ms` of quiet — used to throttle resize re-renders.
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
