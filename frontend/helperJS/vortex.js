// Vortex + orbit — spiral and ring layouts.

import { getThemeColors, withAlpha } from './theme.js';
import { getContainerSize, fitCanvas } from './controls.js';

const DENSITY_MIN = 8;
const DENSITY_MAX = 120;
const VORTEX_DENSITY_MAX = 180;
const MIN_ZOOM = 0.55;
const MAX_ZOOM = 2.5;
const ZOOM_SMOOTH = 0.14;
const ZOOM_WHEEL_SENSITIVITY = 0.0012;

function targetParticleCount(density) {
  density = density || 0.6;
  return Math.round(DENSITY_MIN + density * (DENSITY_MAX - DENSITY_MIN));
}

function targetVortexParticleCount(density) {
  density = density || 0.6;
  return Math.round(DENSITY_MIN + density * (VORTEX_DENSITY_MAX - DENSITY_MIN));
}

// get word templates from the analysis data
function buildSourcePool(data) {
  if (data.particles && data.particles.length) {
    return data.particles.slice();
  }

  const fromWords = [];
  const words = data.words || [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    fromWords.push({
      text: w.text,
      type: 'core',
      frequency: w.frequency || 1,
      size: 0.7 + Math.min(w.frequency || 1, 5) * 0.25,
      opacity: 0.65 + Math.min(w.frequency || 1, 5) * 0.07,
      semanticScore: Math.min(1, (w.frequency || 1) / 5)
    });
  }

  if (fromWords.length) {
    return fromWords;
  }
  return [{ text: 'silence', type: 'core', frequency: 1, size: 1, opacity: 0.8, semanticScore: 1 }];
}

// turn slider values into spiral settings
function getVortexParams(options) {
  const motion = options.motion || 0.4;
  const intensity = options.intensity || 0.4;

  return {
    motion: motion,
    intensity: intensity,
    motionScale: 2 + motion * 22,
    wobbleAmount: 3 + intensity * 28,
    wobbleRate: 0.006 + intensity * 0.022,
    depthScale: 0.08 + intensity * 0.28,
    spiralSpacing: 3.5 + intensity * 8,
    speedBoost: 0.4 + motion * 5,
    vortexSpeed: 4 + motion * 26,
    outerSpread: 40 + intensity * 60
  };
}

// place one word on the spiral
function createVortexParticle(template, index, params) {
  const isCore = template.type === 'core';
  const importance = template.frequency || template.size || 1;
  let semanticScore;
  if (isCore) {
    semanticScore = Math.min(1, (template.semanticScore || importance / 5));
  } else {
    semanticScore = Math.min(1, template.semanticScore || 0.35);
  }

  const count = Math.max(params.particleCount || 80, 1);
  const densityTighten = Math.min(1, 100 / count);
  const spiralStep = (params.spiralSpacing + params.intensity * 3) * densityTighten;

  return {
    text: template.text,
    type: isCore ? 'core' : 'related',
    semanticScore: semanticScore,
    importance: importance,
    angle: index * 0.42,
    radius: 18 + index * spiralStep + (1 - semanticScore) * params.outerSpread * densityTighten,
    z: Math.sin(index * 0.7) * params.intensity * 120,
    size: isCore
      ? Math.min(34, 16 + importance * 8)
      : Math.min(22, 12 + semanticScore * 10),
    speed: 0.0015 + (1 - semanticScore) * 0.002 + Math.random() * 0.001,
    opacity: isCore ? 0.94 : 0.28 + semanticScore * 0.42,
    wobbleSeed: Math.random() * Math.PI * 2
  };
}

function buildVortexParticles(sourcePool, count, params) {
  const layout = { ...params, particleCount: Math.max(count, 1) };
  const particles = [];
  for (let i = 0; i < count; i++) {
    particles.push(createVortexParticle(sourcePool[i % sourcePool.length], i, layout));
  }
  return particles;
}

function resizeParticleField(particles, count, sourcePool, params) {
  if (particles.length === count) {
    return particles;
  }
  if (particles.length > count) {
    return particles.slice(0, count);
  }

  const layout = { ...params, particleCount: Math.max(count, 1) };
  const next = particles.slice();
  while (next.length < count) {
    next.push(createVortexParticle(sourcePool[next.length % sourcePool.length], next.length, layout));
  }
  return next;
}

// recalculate spiral positions when sliders change
function rebuildParticleLayout(particles, sourcePool, params) {
  const layout = { ...params, particleCount: Math.max(particles.length, 1) };
  const next = [];
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const template = sourcePool[i % sourcePool.length];
    const fresh = createVortexParticle(template, i, layout);
    fresh.text = p.text;
    fresh.type = p.type;
    next.push(fresh);
  }
  return next;
}

export function renderVortex(container, data, options) {
  destroyVortex(container);

  options = options || {};

  const sourcePool = buildSourcePool(data);
  let simOptions = {
    density: options.density || 0.6,
    motion: options.motion || 0.4,
    intensity: options.intensity || 0.4,
    paused: options.paused || false
  };

  let size = getContainerSize(container);
  let width = size.width;
  let height = size.height;
  let params = getVortexParams(simOptions);
  let fitScale = Math.min(width, height) / 520;
  let particles = buildVortexParticles(
    sourcePool,
    targetVortexParticleCount(simOptions.density),
    params
  );

  const canvas = document.createElement('canvas');
  canvas.style.touchAction = 'none';
  canvas.style.cursor = 'grab';
  container.appendChild(canvas);

  const wheelSurface = container.closest('.studio-canvas-wrap') || canvas;
  const ctx = canvas.getContext('2d');

  size = fitCanvas(canvas, ctx, container);
  width = size.width;
  height = size.height;
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
    const count = targetVortexParticleCount(simOptions.density);
    particles = resizeParticleField(particles, count, sourcePool, params);
    particles = rebuildParticleLayout(particles, sourcePool, params);
  }

  function syncLayoutFromControls() {
    syncParams();
    particles = rebuildParticleLayout(particles, sourcePool, params);
  }

  function updateView() {
    view.scale = view.scale + (view.targetScale - view.scale) * ZOOM_SMOOTH;
    view.offsetX = view.offsetX + (view.targetOffsetX - view.offsetX) * ZOOM_SMOOTH;
    view.offsetY = view.offsetY + (view.targetOffsetY - view.offsetY) * ZOOM_SMOOTH;
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
    if (nextScale === view.targetScale) {
      return;
    }

    const cx = width / 2;
    const cy = height / 2;
    const worldX = (sx - cx - view.targetOffsetX) / view.targetScale;
    const worldY = (sy - cy - view.targetOffsetY) / view.targetScale;

    view.targetScale = nextScale;
    view.targetOffsetX = sx - cx - worldX * nextScale;
    view.targetOffsetY = sy - cy - worldY * nextScale;
  }

  // drawing
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

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const a = p.angle + time * p.speed * params.motionScale * params.vortexSpeed * 0.00135;
      const spiral =
        p.radius +
        Math.sin(time * params.wobbleRate + p.wobbleSeed + i * 0.4) * params.wobbleAmount;

      const x = Math.cos(a) * spiral * fitScale;
      const y = (Math.sin(a) * spiral * 0.62 + p.z * params.depthScale) * fitScale;

      const dotRadius = p.type === 'core' ? 2.4 : 1.2;
      ctx.beginPath();
      ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(
        p.type === 'core' ? theme.text : theme.muted,
        p.opacity * (p.type === 'core' ? 0.85 : 0.55)
      );
      ctx.fill();

      const weight = p.type === 'core' ? 500 : 400;
      ctx.font = weight + ' ' + p.size + 'px "Cormorant Garamond", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = withAlpha(
        p.type === 'core' ? theme.text : theme.muted,
        p.opacity * (p.type === 'core' ? 1 : 0.72)
      );
      ctx.fillText(p.text, x, y - 8);
    }

    ctx.restore();
  }

  // animation loop
  function loop() {
    updateView();
    if (!simOptions.paused) {
      time = time + 1;
    }
    draw();
    animationId = requestAnimationFrame(loop);
  }

  // pointer interaction — drag to spin the vortex
  function onPointerDown(event) {
    canvas.setPointerCapture(event.pointerId);
    drag.active = true;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    canvas.style.cursor = 'grabbing';
  }

  function onPointerMove(event) {
    if (!drag.active) {
      return;
    }
    const dx = event.clientX - drag.lastX;
    const dy = event.clientY - drag.lastY;
    view.rotation = view.rotation + dx * 0.005;
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

  // resize
  function onResize() {
    size = fitCanvas(canvas, ctx, container);
    width = size.width;
    height = size.height;
    fitScale = Math.min(width, height) / 520;
    syncLayoutFromControls();
  }

  function endPointerSession() {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
  }

  function onPointerDownWrapped(event) {
    onPointerDown(event);
    if (!drag.active) {
      return;
    }
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }

  function onPointerUpWrapped(event) {
    onPointerUp(event);
    endPointerSession();
  }

  canvas.addEventListener('pointerdown', onPointerDownWrapped);
  wheelSurface.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('dblclick', onDoubleClick);

  const resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(container);

  loop();

  const api = {
    updateOptions: function (newOptions) {
      newOptions = newOptions || {};
      const prevDensity = simOptions.density;
      const prevIntensity = simOptions.intensity;

      if (newOptions.density) simOptions.density = newOptions.density;
      if (newOptions.motion) simOptions.motion = newOptions.motion;
      if (newOptions.intensity) simOptions.intensity = newOptions.intensity;
      if (newOptions.paused === true || newOptions.paused === false) {
        simOptions.paused = newOptions.paused;
      }

      syncParams();

      if (simOptions.density !== prevDensity) {
        syncDensity();
      } else if (simOptions.intensity !== prevIntensity) {
        syncLayoutFromControls();
      }
    },
    pause: function () {
      simOptions.paused = true;
    },
    resume: function () {
      simOptions.paused = false;
    },
    destroy: function () {
      destroyVortex(container);
    }
  };

  // cleanup
  container._vortexInstance = {
    cleanup: function () {
      cancelAnimationFrame(animationId);
      animationId = null;
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDownWrapped);
      endPointerSession();
      wheelSurface.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('dblclick', onDoubleClick);
    }
  };

  return api;
}

// place words on concentric rings for orbit mode
function buildOrbitPool(data, count) {
  const pool = [];
  const words = (data.words || []).slice();
  words.sort(function (a, b) {
    return (b.frequency || 1) - (a.frequency || 1);
  });

  const related = data.relatedWords || [];
  const coreCount = Math.min(words.length, Math.max(1, Math.round(count * 0.55)));
  const relatedCount = count - coreCount;

  for (let i = 0; i < coreCount; i++) {
    const w = words[i % words.length];
    pool.push({
      text: w.text,
      type: 'core',
      size: 0.9 + Math.min(w.frequency || 1, 5) * 0.12,
      opacity: 0.92,
      semanticScore: Math.min(1, (w.frequency || 1) / 5)
    });
  }

  for (let i = 0; i < relatedCount; i++) {
    if (related.length) {
      const r = related[i % related.length];
      pool.push({
        text: r.text,
        type: 'related',
        size: 0.65,
        opacity: 0.5 + (r.score || 0.3) * 0.35,
        semanticScore: r.score || 0.35
      });
    } else {
      const w = words[(coreCount + i) % words.length];
      pool.push({
        text: w.text,
        type: 'related',
        size: 0.7,
        opacity: 0.55,
        semanticScore: 0.35
      });
    }
  }

  return pool.slice(0, count);
}

function placeOrbitRing(group, innerBand, outerBand, maxRadius, minRadius, baseSpeed, wobbleAmp, wobbleRadius) {
  const placed = [];
  if (!group.length) {
    return placed;
  }

  const rings = Math.min(3, Math.max(1, Math.ceil(group.length / 4)));
  const perRing = Math.ceil(group.length / rings);

  for (let i = 0; i < group.length; i++) {
    const p = group[i];
    const ringIdx = Math.min(rings - 1, Math.floor(i / perRing));
    const slotOnRing = i - ringIdx * perRing;
    const slotsThisRing = Math.min(perRing, group.length - ringIdx * perRing);
    const ringT = rings <= 1 ? 0.5 : ringIdx / (rings - 1);
    const radius = minRadius + (maxRadius - minRadius) * (innerBand + ringT * (outerBand - innerBand));
    const angle = (slotOnRing / slotsThisRing) * Math.PI * 2 + ringIdx * 0.45;
    const direction = p.type === 'core' ? 1 : -0.7;

    placed.push({
      text: p.text,
      type: p.type,
      size: p.size,
      opacity: p.opacity,
      semanticScore: p.semanticScore,
      angle: angle,
      baseRadius: radius,
      radius: radius,
      speed: direction * (baseSpeed + (p.semanticScore || 0.3) * baseSpeed * 0.75),
      wobbleAmp: wobbleAmp * (p.type === 'core' ? 0.65 : 1),
      wobbleRadius: wobbleRadius
    });
  }

  return placed;
}

function orbitDynamics(motion, intensity) {
  return {
    wobbleAmp: 0.06 + intensity * 0.9,
    baseSpeed: 0.002 + motion * 0.028,
    wobbleRadius: 8 + intensity * 22
  };
}

function buildOrbitItems(sourcePool, motion, intensity, width, height) {
  const padding = 36;
  const maxRadius = Math.max(70, Math.min(width, height) * 0.42 - padding);
  const minRadius = maxRadius * 0.2;
  const dynamics = orbitDynamics(motion, intensity);
  const wobbleAmp = dynamics.wobbleAmp;
  const baseSpeed = dynamics.baseSpeed;

  const core = [];
  const related = [];
  for (let i = 0; i < sourcePool.length; i++) {
    if (sourcePool[i].type === 'core') {
      core.push(sourcePool[i]);
    } else {
      related.push(sourcePool[i]);
    }
  }

  const items = [];
  items.push.apply(items, placeOrbitRing(core, 0, 0.4, maxRadius, minRadius, baseSpeed, wobbleAmp, dynamics.wobbleRadius));
  items.push.apply(items, placeOrbitRing(related, 0.55, 0.95, maxRadius, minRadius, baseSpeed, wobbleAmp, dynamics.wobbleRadius));

  return items;
}

export function renderOrbit(container, data, options) {
  destroyVortex(container);

  options = options || {};

  let density = options.density ?? 0.6;
  let motion = options.motion ?? 0.4;
  let intensity = options.intensity ?? 0.4;
  let paused = options.paused ?? false;

  let size = getContainerSize(container);
  let width = size.width;
  let height = size.height;

  const canvas = document.createElement('canvas');
  canvas.style.touchAction = 'none';
  canvas.style.cursor = 'grab';
  container.appendChild(canvas);

  const wheelSurface = container.closest('.studio-canvas-wrap') || canvas;
  const ctx = canvas.getContext('2d');

  size = fitCanvas(canvas, ctx, container);
  width = size.width;
  height = size.height;

  let sourcePool = buildOrbitPool(data, targetParticleCount(density));
  let items = buildOrbitItems(sourcePool, motion, intensity, width, height);

  let animationId = null;
  let resizeObserver = null;

  const view = {
    scale: 1,
    targetScale: 1,
    offsetX: 0,
    offsetY: 0,
    targetOffsetX: 0,
    targetOffsetY: 0
  };

  const pan = {
    active: false,
    lastX: 0,
    lastY: 0
  };

  function updateView() {
    view.scale = view.scale + (view.targetScale - view.scale) * ZOOM_SMOOTH;
    view.offsetX = view.offsetX + (view.targetOffsetX - view.offsetX) * ZOOM_SMOOTH;
    view.offsetY = view.offsetY + (view.targetOffsetY - view.offsetY) * ZOOM_SMOOTH;
  }

  function resetView() {
    view.targetScale = 1;
    view.targetOffsetX = 0;
    view.targetOffsetY = 0;
  }

  function zoomAtScreenPoint(sx, sy, deltaY) {
    const factor = Math.exp(-deltaY * ZOOM_WHEEL_SENSITIVITY);
    const nextScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.targetScale * factor));
    if (nextScale === view.targetScale) {
      return;
    }

    const cx = width / 2;
    const cy = height / 2;
    const worldX = (sx - cx - view.targetOffsetX) / view.targetScale;
    const worldY = (sy - cy - view.targetOffsetY) / view.targetScale;

    view.targetScale = nextScale;
    view.targetOffsetX = sx - cx - worldX * nextScale;
    view.targetOffsetY = sy - cy - worldY * nextScale;
  }

  function syncDensity() {
    sourcePool = buildOrbitPool(data, targetParticleCount(density));
    items = buildOrbitItems(sourcePool, motion, intensity, width, height);
  }

  function applyDynamics() {
    const dynamics = orbitDynamics(motion, intensity);

    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      const direction = p.type === 'core' ? 1 : -0.7;
      p.speed = direction * (dynamics.baseSpeed + (p.semanticScore || 0.3) * dynamics.baseSpeed * 0.75);
      p.wobbleAmp = dynamics.wobbleAmp * (p.type === 'core' ? 0.65 : 1);
      p.wobbleRadius = dynamics.wobbleRadius;
    }
  }

  // drawing
  function draw() {
    const theme = getThemeColors();
    ctx.clearRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;

    ctx.save();
    ctx.translate(cx + view.offsetX, cy + view.offsetY);
    ctx.scale(view.scale, view.scale);

    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      const x = Math.cos(p.angle) * p.radius;
      const y = Math.sin(p.angle) * p.radius;
      const weight = p.type === 'core' ? 600 : 400;
      const fontSize = p.type === 'core' ? 15 + p.size * 9 : 11 + p.size * 5;
      ctx.font = weight + ' ' + fontSize + 'px "Cormorant Garamond", serif';
      ctx.fillStyle = withAlpha(
        p.type === 'core' ? theme.text : theme.muted,
        p.opacity * (p.type === 'core' ? 1 : 0.6)
      );
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.text, x, y);
    }

    ctx.restore();
  }

  // physics — slow orbit with a little wobble
  function update() {
    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      p.angle = p.angle + p.speed;
      p.radius = p.baseRadius + Math.sin(p.angle * 2) * p.wobbleAmp * (p.wobbleRadius || 12);
    }
  }

  function onPointerDown(event) {
    canvas.setPointerCapture(event.pointerId);
    pan.active = true;
    pan.lastX = event.clientX;
    pan.lastY = event.clientY;
    canvas.style.cursor = 'grabbing';
  }

  function onPointerMove(event) {
    if (!pan.active) {
      return;
    }
    view.targetOffsetX = view.targetOffsetX + (event.clientX - pan.lastX);
    view.targetOffsetY = view.targetOffsetY + (event.clientY - pan.lastY);
    pan.lastX = event.clientX;
    pan.lastY = event.clientY;
  }

  function onPointerUp(event) {
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    pan.active = false;
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

  // animation loop
  function loop() {
    updateView();
    if (!paused) {
      update();
    }
    draw();
    animationId = requestAnimationFrame(loop);
  }

  // resize
  function onResize() {
    size = fitCanvas(canvas, ctx, container);
    width = size.width;
    height = size.height;
    items = buildOrbitItems(sourcePool, motion, intensity, width, height);
  }

  function endPointerSession() {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
  }

  function onPointerDownWrapped(event) {
    onPointerDown(event);
    if (!pan.active) {
      return;
    }
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }

  function onPointerUpWrapped(event) {
    onPointerUp(event);
    endPointerSession();
  }

  canvas.addEventListener('pointerdown', onPointerDownWrapped);
  wheelSurface.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('dblclick', onDoubleClick);

  resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(container);

  loop();

  // cleanup
  container._vortexInstance = {
    cleanup: function () {
      cancelAnimationFrame(animationId);
      animationId = null;
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDownWrapped);
      endPointerSession();
      wheelSurface.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('dblclick', onDoubleClick);
    }
  };

  return {
    updateOptions: function (newOptions) {
      newOptions = newOptions || {};
      const prevDensity = density;

      if (newOptions.density !== undefined) {
        density = newOptions.density;
      }
      if (newOptions.motion !== undefined) {
        motion = newOptions.motion;
      }
      if (newOptions.intensity !== undefined) {
        intensity = newOptions.intensity;
      }
      if (newOptions.paused === true || newOptions.paused === false) {
        paused = newOptions.paused;
      }

      if (density !== prevDensity) {
        syncDensity();
      } else {
        applyDynamics();
      }
    },
    pause: function () {
      paused = true;
    },
    resume: function () {
      paused = false;
    },
    destroy: function () {
      destroyVortex(container);
    }
  };
}

export function destroyVortex(container) {
  if (container._vortexInstance) {
    container._vortexInstance.cleanup();
    container._vortexInstance = null;
  }
  container.innerHTML = '';
}
