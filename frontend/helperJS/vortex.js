/**
 * Vortex — spiral word field with live controls, drag rotation, and zoom.
 *
 * density   → particle count (sparse → immersive field)
 * motion    → swirl speed
 * intensity → spiral spacing, wobble, depth, turbulence
 *
 * Double-click canvas to reset zoom/rotation.
 */

import { getThemeColors, withAlpha } from './theme.js';
import { clamp01 } from './controls.js';
import { measureContainer, syncCanvasToContainer, getStudioWrap } from './canvasSize.js';

const DENSITY_MIN = 8;
const DENSITY_MAX = 120;
const MIN_ZOOM = 0.55;
const MAX_ZOOM = 2.5;
const ZOOM_SMOOTH = 0.14;
const ZOOM_WHEEL_SENSITIVITY = 0.0012;

function targetParticleCount(density) {
  return Math.round(DENSITY_MIN + clamp01(density) * (DENSITY_MAX - DENSITY_MIN));
}

function buildSourcePool(data) {
  if (data.particles?.length) return [...data.particles];

  const fromWords = (data.words || []).map((w) => ({
    text: w.text,
    type: 'core',
    frequency: w.frequency || 1,
    size: 0.7 + Math.min(w.frequency || 1, 5) * 0.25,
    opacity: 0.65 + Math.min(w.frequency || 1, 5) * 0.07,
    semanticScore: Math.min(1, (w.frequency || 1) / 5)
  }));

  return fromWords.length
    ? fromWords
    : [{ text: 'silence', type: 'core', frequency: 1, size: 1, opacity: 0.8, semanticScore: 1 }];
}

function getVortexParams(options) {
  const motion = clamp01(options.motion ?? 0.4);
  const intensity = clamp01(options.intensity ?? 0.4);

  return {
    motion,
    intensity,
    motionScale: 2 + motion * 18,
    wobbleAmount: 3 + intensity * 28,
    wobbleRate: 0.006 + intensity * 0.022,
    depthScale: 0.08 + intensity * 0.28,
    spiralSpacing: 3.5 + intensity * 8,
    speedBoost: 0.4 + motion * 3.5,
    vortexSpeed: 4 + motion * 14,
    outerSpread: 40 + intensity * 60
  };
}

function createVortexParticle(template, index, params) {
  const isCore = template.type === 'core';
  const importance = template.frequency || template.size || 1;
  const semanticScore = isCore
    ? Math.min(1, template.semanticScore ?? importance / 5)
    : Math.min(1, template.semanticScore ?? 0.35);

  const spiralStep = params.spiralSpacing + params.intensity * 3;

  return {
    text: template.text,
    type: isCore ? 'core' : 'related',
    semanticScore,
    importance,
    angle: index * 0.42,
    radius:
      18 +
      index * spiralStep +
      (1 - semanticScore) * params.outerSpread,
    z: Math.sin(index * 0.7) * params.intensity * 120,
    size: isCore
      ? Math.min(34, 16 + importance * 8)
      : Math.min(22, 12 + semanticScore * 10),
    speed:
      0.0015 +
      (1 - semanticScore) * 0.002 +
      Math.random() * 0.001,
    opacity: isCore ? 0.94 : 0.28 + semanticScore * 0.42,
    wobbleSeed: Math.random() * Math.PI * 2
  };
}

function buildVortexParticles(sourcePool, count, params) {
  const particles = [];
  for (let i = 0; i < count; i++) {
    particles.push(createVortexParticle(sourcePool[i % sourcePool.length], i, params));
  }
  return particles;
}

function resizeParticleField(particles, count, sourcePool, params) {
  if (particles.length === count) return particles;
  if (particles.length > count) return particles.slice(0, count);

  const next = [...particles];
  while (next.length < count) {
    next.push(createVortexParticle(sourcePool[next.length % sourcePool.length], next.length, params));
  }
  return next;
}

function rebuildParticleLayout(particles, sourcePool, params) {
  return particles.map((p, i) => {
    const template = sourcePool[i % sourcePool.length];
    const fresh = createVortexParticle(template, i, params);
    return { ...fresh, text: p.text, type: p.type };
  });
}

export function renderVortex(container, data, options = {}) {
  destroyVortex(container);

  const sourcePool = buildSourcePool(data);
  let simOptions = {
    density: clamp01(options.density ?? 0.6),
    motion: clamp01(options.motion ?? 0.4),
    intensity: clamp01(options.intensity ?? 0.4),
    paused: options.paused ?? false
  };

  let { width, height } = measureContainer(container);
  let params = getVortexParams(simOptions);
  let fitScale = Math.min(width, height) / 520;
  let particles = buildVortexParticles(
    sourcePool,
    targetParticleCount(simOptions.density),
    params
  );

  const canvas = document.createElement('canvas');
  canvas.style.touchAction = 'none';
  canvas.style.cursor = 'grab';
  container.appendChild(canvas);

  const wheelSurface = getStudioWrap(container) || canvas;

  const ctx = canvas.getContext('2d');
  ({ width, height } = syncCanvasToContainer(canvas, ctx, container));
  fitScale = Math.min(width, height) / 520;

  let animationId = null;
  let time = 0;

  const view = {
    rotation: 0,
    tilt: 0,
    scale: 1,
    targetScale: 1,
    offsetX: 0,
    offsetY: 0,
    targetOffsetX: 0,
    targetOffsetY: 0
  };

  const drag = {
    active: false,
    lastX: 0,
    lastY: 0
  };

  function syncParams() {
    params = getVortexParams(simOptions);
  }

  function syncDensity() {
    const count = targetParticleCount(simOptions.density);
    particles = resizeParticleField(particles, count, sourcePool, params);
    particles = rebuildParticleLayout(particles, sourcePool, params);
  }

  function syncLayoutFromControls() {
    syncParams();
    particles = rebuildParticleLayout(particles, sourcePool, params);
  }

  function updateView() {
    view.scale += (view.targetScale - view.scale) * ZOOM_SMOOTH;
    view.offsetX += (view.targetOffsetX - view.offsetX) * ZOOM_SMOOTH;
    view.offsetY += (view.targetOffsetY - view.offsetY) * ZOOM_SMOOTH;
  }

  function resetView() {
    view.rotation = 0;
    view.tilt = 0;
    view.targetScale = 1;
    view.targetOffsetX = 0;
    view.targetOffsetY = 0;
  }

  function zoomAtScreenPoint(sx, sy, deltaY) {
    const factor = Math.exp(-deltaY * ZOOM_WHEEL_SENSITIVITY);
    const nextScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.targetScale * factor));
    if (nextScale === view.targetScale) return;

    const cx = width / 2;
    const cy = height / 2;
    const worldX = (sx - cx - view.targetOffsetX) / view.targetScale;
    const worldY = (sy - cy - view.targetOffsetY) / view.targetScale;

    view.targetScale = nextScale;
    view.targetOffsetX = sx - cx - worldX * nextScale;
    view.targetOffsetY = sy - cy - worldY * nextScale;
  }

  function draw() {
    const theme = getThemeColors();
    ctx.clearRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;

    ctx.save();
    ctx.translate(cx + view.offsetX, cy + view.offsetY);
    ctx.scale(view.scale, view.scale);
    ctx.rotate(view.rotation);
    ctx.scale(1, 0.92 + view.tilt * 0.08);

    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(theme.muted, 0.45);
    ctx.fill();

    particles.forEach((p, i) => {
      const a = p.angle + time * p.speed * params.motionScale * params.vortexSpeed * 0.001;
      const spiral =
        p.radius +
        Math.sin(time * params.wobbleRate + p.wobbleSeed + i * 0.4) * params.wobbleAmount;

      const x = Math.cos(a) * spiral * fitScale;
      const y = (Math.sin(a) * spiral * 0.62 + p.z * params.depthScale) * fitScale;

      const dotRadius = p.type === 'core' ? 2.4 : 1.2;
      ctx.beginPath();
      ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(
        p.type === 'core' ? theme.vizCore : theme.vizRelated,
        p.opacity * (p.type === 'core' ? 0.85 : 0.55)
      );
      ctx.fill();

      ctx.font = `${p.type === 'core' ? 500 : 400} ${p.size}px "Cormorant Garamond", serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = withAlpha(
        p.type === 'core' ? theme.vizCore : theme.vizRelated,
        p.opacity * (p.type === 'core' ? 1 : 0.72)
      );
      ctx.fillText(p.text, x, y - 8);
    });

    ctx.restore();
  }

  function loop() {
    updateView();
    if (!simOptions.paused) time += 1;
    draw();
    animationId = requestAnimationFrame(loop);
  }

  function onPointerDown(event) {
    canvas.setPointerCapture(event.pointerId);
    drag.active = true;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    canvas.style.cursor = 'grabbing';
  }

  function onPointerMove(event) {
    if (!drag.active) return;
    const dx = event.clientX - drag.lastX;
    const dy = event.clientY - drag.lastY;
    view.rotation += dx * 0.005;
    view.tilt = Math.max(-1, Math.min(1, view.tilt + dy * 0.003));
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
  }

  function onPointerUp(event) {
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    drag.active = false;
    canvas.style.cursor = 'grab';
  }

  function onWheel(event) {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    zoomAtScreenPoint(event.clientX - rect.left, event.clientY - rect.top, event.deltaY);
  }

  function onDoubleClick(event) {
    event.preventDefault();
    resetView();
  }

  function onResize() {
    ({ width, height } = syncCanvasToContainer(canvas, ctx, container));
    fitScale = Math.min(width, height) / 520;
    syncLayoutFromControls();
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  wheelSurface.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('dblclick', onDoubleClick);

  const resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(container);

  loop();

  const api = {
    updateOptions(newOptions = {}) {
      const prevDensity = simOptions.density;
      const prevIntensity = simOptions.intensity;

      if (newOptions.density !== undefined) simOptions.density = clamp01(newOptions.density);
      if (newOptions.motion !== undefined) simOptions.motion = clamp01(newOptions.motion);
      if (newOptions.intensity !== undefined) simOptions.intensity = clamp01(newOptions.intensity);
      if (newOptions.paused !== undefined) simOptions.paused = newOptions.paused;

      syncParams();

      if (simOptions.density !== prevDensity) {
        syncDensity();
      } else if (simOptions.intensity !== prevIntensity) {
        syncLayoutFromControls();
      }
    },
    pause: () => {
      simOptions.paused = true;
    },
    resume: () => {
      simOptions.paused = false;
    },
    destroy: () => destroyVortex(container)
  };

  container._vortexInstance = {
    cleanup: () => {
      if (animationId) cancelAnimationFrame(animationId);
      animationId = null;
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      wheelSurface.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('dblclick', onDoubleClick);
    }
  };

  return api;
}

/**
 * Orbit — concentric ring layout centered in the visualization box.
 */
function buildOrbitItems(sourcePool, count, motion, intensity, width, height) {
  const padding = 28;
  const maxRadius = Math.max(36, Math.min(width, height) * 0.38 - padding);
  const numRings = 8;
  const wobbleAmp = 0.05 + intensity * 0.55;
  const baseSpeed = 0.001 + motion * 0.009;
  const items = [];

  for (let i = 0; i < count; i++) {
    const p = sourcePool[i % sourcePool.length];
    const ringIndex = i % numRings;
    const t = numRings <= 1 ? 1 : ringIndex / (numRings - 1);
    const baseRadius = maxRadius * (0.32 + t * 0.68);

    items.push({
      ...p,
      angle: (i / count) * Math.PI * 2,
      baseRadius,
      radius: baseRadius,
      speed: baseSpeed + (p.semanticScore || 0.3) * baseSpeed * 0.8,
      wobbleAmp
    });
  }

  return items;
}

export function renderOrbit(container, data, options = {}) {
  destroyVortex(container);

  const density = clamp01(options.density ?? 0.6);
  const motion = clamp01(options.motion ?? 0.4);
  const intensity = clamp01(options.intensity ?? 0.4);
  let paused = options.paused ?? false;

  let { width, height } = measureContainer(container);

  const canvas = document.createElement('canvas');
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  ({ width, height } = syncCanvasToContainer(canvas, ctx, container));

  const sourcePool = buildSourcePool(data);
  const count = targetParticleCount(density);
  let items = buildOrbitItems(sourcePool, count, motion, intensity, width, height);

  let animationId = null;
  let resizeObserver = null;

  function draw() {
    const theme = getThemeColors();
    ctx.clearRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;

    ctx.save();
    ctx.translate(cx, cy);

    items.forEach((p) => {
      const x = Math.cos(p.angle) * p.radius;
      const y = Math.sin(p.angle) * p.radius;
      ctx.font = `${p.type === 'core' ? 500 : 400} ${11 + p.size * 8}px "Cormorant Garamond", serif`;
      ctx.fillStyle = withAlpha(
        p.type === 'core' ? theme.vizCore : theme.vizRelated,
        p.opacity * (p.type === 'core' ? 1 : 0.6)
      );
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.text, x, y);
    });

    ctx.restore();
  }

  function update() {
    items.forEach((p) => {
      p.angle += p.speed;
      p.radius = p.baseRadius + Math.sin(p.angle * 2) * p.wobbleAmp * 12;
    });
  }

  function loop() {
    if (!paused) update();
    draw();
    animationId = requestAnimationFrame(loop);
  }

  function onResize() {
    ({ width, height } = syncCanvasToContainer(canvas, ctx, container));
    items = buildOrbitItems(sourcePool, count, motion, intensity, width, height);
  }

  resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(container);

  loop();

  container._vortexInstance = {
    cleanup: () => {
      if (animationId) cancelAnimationFrame(animationId);
      animationId = null;
      resizeObserver?.disconnect();
      resizeObserver = null;
    }
  };

  return {
    pause: () => { paused = true; },
    resume: () => { paused = false; },
    destroy: () => destroyVortex(container)
  };
}

export function destroyVortex(container) {
  if (container?._vortexInstance) {
    container._vortexInstance.cleanup();
    container._vortexInstance = null;
  }
  if (container) container.innerHTML = '';
}
