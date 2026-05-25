import { applyTheme, initTheme } from './helperJS/theme.js';
import { fetchWorks, deleteWork } from './helperJS/apiClient.js';
import { renderEchoMode, destroyEchoMode } from './helperJS/controls.js';

const notice = document.getElementById('gallery-notice');
const grid = document.getElementById('gallery-grid');
const previewPanel = document.getElementById('gallery-preview');
const previewTitle = document.getElementById('gallery-preview-title');
const previewSettings = document.getElementById('gallery-preview-settings');
const previewCanvas = document.getElementById('gallery-preview-canvas');
const previewAscii = document.getElementById('gallery-preview-ascii');

let works = [];
let selectedId = null;
let previewRenderer = null;

applyTheme(initTheme());
loadGallery();

async function loadGallery() {
  setNotice('Loading saved Echo pieces…');

  try {
    works = await fetchWorks();

    if (!works.length) {
      setNotice('No saved pieces yet. Transform text in the Studio and click Save to Gallery.');
      renderGrid([]);
      clearPreview('Select a saved Echo piece to preview it.');
      return;
    }

    setNotice(`${works.length} saved piece${works.length === 1 ? '' : 's'} in the archive.`);
    renderGrid(works);

    if (selectedId && works.some((w) => w.id === selectedId)) {
      selectWork(selectedId, { scroll: false });
    } else {
      clearPreview('Select a saved Echo piece to preview it.');
    }
  } catch (error) {
    setNotice(error.message || 'Failed to load gallery.', 'error');
    renderGrid([]);
    clearPreview('Preview unavailable.');
  }
}

function setNotice(message, type = 'info') {
  if (!notice) return;
  notice.textContent = message;
  notice.dataset.status = type;
}

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

  grid.querySelectorAll('.gallery-card').forEach((card) => {
    card.addEventListener('click', (event) => {
      if (event.target.closest('[data-delete-id]')) return;
      selectWork(card.dataset.id);
    });

    card.addEventListener('keydown', (event) => {
      if (event.target.closest('[data-delete-id]')) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectWork(card.dataset.id);
      }
    });
  });

  grid.querySelectorAll('[data-delete-id]').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      handleDelete(btn.dataset.deleteId);
    });
  });
}

function selectWork(id, { scroll = true } = {}) {
  const work = works.find((item) => item.id === id);
  if (!work) return;

  selectedId = id;
  renderGrid(works);

  if (previewTitle) {
    previewTitle.textContent = work.title;
  }

  if (previewSettings) {
    previewSettings.textContent = `${String(work.mode).toUpperCase()} · ${formatSettings(work)}`;
  }

  try {
    const saved = work.analysisData && typeof work.analysisData === 'object' ? work.analysisData : {};
    const extra = work.options && typeof work.options === 'object' ? work.options : {};

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

    let density = Number(work.density != null ? work.density : extra.density) || 0.6;
    let motion = Number(work.motion != null ? work.motion : extra.motion) || 0.4;
    let intensity = Number(work.intensity != null ? work.intensity : extra.intensity) || 0.4;
    if (density < 0) density = 0;
    if (density > 1) density = 1;
    if (motion < 0) motion = 0;
    if (motion > 1) motion = 1;
    if (intensity < 0) intensity = 0;
    if (intensity > 1) intensity = 1;

    const previewOptions = {
      density: density,
      motion: motion,
      intensity: intensity,
      paused: Boolean(extra.paused)
    };

    previewRenderer = renderEchoMode({
      container: previewCanvas,
      asciiEl: previewAscii,
      mode: work.mode,
      data: previewData,
      options: previewOptions,
      renderer: previewRenderer
    });
  } catch {
    setNotice('Could not render preview for this piece.', 'error');
  }

  if (scroll) {
    previewPanel?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function clearPreview(message) {
  selectedId = null;
  if (previewTitle) previewTitle.textContent = message;
  if (previewSettings) previewSettings.textContent = '';
  destroyEchoMode({
    container: previewCanvas,
    asciiEl: previewAscii,
    renderer: previewRenderer
  });
  previewRenderer = null;
}

async function handleDelete(id) {
  const work = works.find((item) => item.id === id);
  if (!work) return;

  const confirmed = window.confirm(`Delete "${work.title}" from the gallery?`);
  if (!confirmed) return;

  try {
    await deleteWork(id);
    works = works.filter((item) => item.id !== id);

    if (selectedId === id) {
      clearPreview('Select a saved Echo piece to preview it.');
    }

    if (!works.length) {
      setNotice('No saved pieces yet. Transform text in the Studio and click Save to Gallery.');
      renderGrid([]);
      return;
    }

    setNotice(`${works.length} saved piece${works.length === 1 ? '' : 's'} in the archive.`);
    renderGrid(works);
  } catch (error) {
    setNotice(error.message || 'Failed to delete work.', 'error');
  }
}

function formatSettings(work) {
  const d = Math.round(Number(work.density ?? 0) * 100);
  const m = Math.round(Number(work.motion ?? 0) * 100);
  const i = Math.round(Number(work.intensity ?? 0) * 100);
  return `density ${d} · motion ${m} · intensity ${i}`;
}

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

function truncate(text, max) {
  const value = String(text || '').trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

window.addEventListener('resize', debounce(() => {
  if (selectedId) selectWork(selectedId, { scroll: false });
}, 250));

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
