/**
 * Reliable container/canvas sizing for studio visualizations.
 * Uses layout box dimensions and keeps CSS size in sync with the drawing buffer.
 */

const wheelGuards = new WeakMap();

export function getStudioWrap(container) {
  return container?.closest('.studio-canvas-wrap') || container?.parentElement || null;
}

/** Ensure #studio-canvas fills its wrap so pointer/wheel events hit the art layer. */
export function syncContainerFromWrap(container) {
  const wrap = getStudioWrap(container);
  if (!wrap || !container) return;

  const wrapHeight = wrap.getBoundingClientRect().height;
  if (wrapHeight > 2 && container.getBoundingClientRect().height < 2) {
    container.style.minHeight = `${Math.round(wrapHeight)}px`;
  }
}

export function measureContainer(container) {
  if (!container) return { width: 1, height: 1 };

  syncContainerFromWrap(container);

  const rect = container.getBoundingClientRect();
  let width = rect.width || container.clientWidth;
  let height = rect.height || container.clientHeight;

  // Percentage height can resolve to 0 before the parent finishes layout.
  if (height < 2) {
    const wrap = getStudioWrap(container);
    if (wrap) {
      const wrapRect = wrap.getBoundingClientRect();
      width = wrapRect.width || wrap.clientWidth || width;
      height = wrapRect.height || wrap.clientHeight || height;
    }
  }

  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height))
  };
}

export function applyCanvasSize(canvas, ctx, width, height) {
  const dpr = window.devicePixelRatio || 1;

  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';

  const bufferWidth = Math.max(1, Math.round(width * dpr));
  const bufferHeight = Math.max(1, Math.round(height * dpr));

  if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
    canvas.width = bufferWidth;
    canvas.height = bufferHeight;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { width, height, dpr };
}

export function syncCanvasToContainer(canvas, ctx, container) {
  const { width, height } = measureContainer(container);
  return applyCanvasSize(canvas, ctx, width, height);
}

/** Wait until the visualization container has a usable layout box (not just wrap fallback). */
export function waitForContainerLayout(container, maxFrames = 16) {
  return new Promise((resolve) => {
    let frames = 0;

    const tryMeasure = () => {
      syncContainerFromWrap(container);
      const height = container?.getBoundingClientRect().height ?? 0;
      if (height > 48 || frames >= maxFrames) {
        resolve(measureContainer(container));
        return;
      }
      frames += 1;
      requestAnimationFrame(tryMeasure);
    };

    requestAnimationFrame(tryMeasure);
  });
}

/** Block page scroll while wheeling over the studio canvas area. */
export function bindStudioWheelGuard(container, { enabled = true } = {}) {
  if (!enabled || !container) return;

  const wrap = getStudioWrap(container);
  if (!wrap || wheelGuards.has(wrap)) return;

  const onWheel = (event) => {
    if (event.target.closest('#ascii-output:not([hidden])')) return;
    if (wrap.contains(event.target)) {
      event.preventDefault();
    }
  };

  wrap.addEventListener('wheel', onWheel, { passive: false });
  wheelGuards.set(wrap, onWheel);
}

export function unbindStudioWheelGuard(container) {
  const wrap = getStudioWrap(container);
  if (!wrap) return;

  const onWheel = wheelGuards.get(wrap);
  if (!onWheel) return;

  wrap.removeEventListener('wheel', onWheel);
  wheelGuards.delete(wrap);
}
