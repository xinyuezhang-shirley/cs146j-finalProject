// Soup — drifting words with cursor push and wheel zoom.

import { getThemeColors, withAlpha } from './theme.js';
import { getContainerSize, fitCanvas } from './controls.js';

const DENSITY_MIN = 6;
const DENSITY_MAX = 130;
const TRAIL_FADE = 0.1;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
const ZOOM_SMOOTH = 0.14;
const ZOOM_WHEEL_SENSITIVITY = 0.0012;

// how many words to show based on the density slider
function targetParticleCount(density) {
  density = density || 0.6;
  return Math.round(DENSITY_MIN + density * (DENSITY_MAX - DENSITY_MIN));
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
      size: 0.7 + Math.min(w.frequency || 1, 5) * 0.25,
      opacity: 0.65 + Math.min(w.frequency || 1, 5) * 0.07
    });
  }

  if (fromWords.length) {
    return fromWords;
  }
  return [{ text: 'silence', type: 'core', size: 1, opacity: 0.8 }];
}

// turn slider values into movement settings
function getPhysics(options) {
  const motion = options.motion || 0.4;
  const intensity = options.intensity || 0.4;

  return {
    baseSpeed: 0.3 + motion * 4.5,
    noiseForce: 0.012 + intensity * 0.095,
    wobble: 0.006 + motion * 0.028 + intensity * 0.02,
    drift: 0.4 + intensity * 1.6,
    damp: 0.985 - (1 - motion) * 0.012,
    maxSpeed: 1.8 + motion * 5.5,
    cursorRadius: 80 + intensity * 110,
    cursorStrength: 0.22 + intensity * 0.55,
    grabRadius: 42
  };
}

// keep particles from moving too fast
function clampVelocity(p, maxSpeed) {
  const speed = Math.hypot(p.vx, p.vy);
  if (speed > maxSpeed) {
    const scale = maxSpeed / speed;
    p.vx = p.vx * scale;
    p.vy = p.vy * scale;
  }
}

// create one drifting word at a random spot
function spawnParticle(template, width, height, physics) {
  const speed = physics.baseSpeed * (0.45 + (template.size || 1) * 0.35);
  return {
    text: template.text,
    type: template.type || 'core',
    size: template.size || 1,
    opacity: template.opacity || 0.7,
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * speed,
    vy: (Math.random() - 0.5) * speed,
    angle: Math.random() * Math.PI * 2,
    phase: Math.random() * Math.PI * 2
  };
}

// fill the canvas with the right number of particles
function buildParticles(sourcePool, count, width, height, physics) {
  const particles = [];
  for (let i = 0; i < count; i++) {
    particles.push(spawnParticle(sourcePool[i % sourcePool.length], width, height, physics));
  }
  return particles;
}

// add or remove particles when density changes
function resizeParticleField(particles, count, sourcePool, width, height, physics) {
  if (particles.length === count) {
    return particles;
  }
  if (particles.length > count) {
    return particles.slice(0, count);
  }

  const next = particles.slice();
  while (next.length < count) {
    next.push(spawnParticle(sourcePool[next.length % sourcePool.length], width, height, physics));
  }
  return next;
}

// find the word closest to the cursor for dragging
function findNearestParticle(particles, x, y, radius) {
  let nearest = null;
  let nearestDist = radius;

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const dist = Math.hypot(p.x - x, p.y - y);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = p;
    }
  }

  return nearest;
}

export function renderSoup(container, data, options) {
  destroySoup(container);

  options = options || {};

  let simOptions = {
    density: options.density || 0.6,
    motion: options.motion || 0.4,
    intensity: options.intensity || 0.4,
    paused: options.paused || false
  };

  const sourcePool = buildSourcePool(data);

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

  // particles
  let physics = getPhysics(simOptions);
  let particles = buildParticles(
    sourcePool,
    targetParticleCount(simOptions.density),
    width,
    height,
    physics
  );

  const pointer = {
    x: width / 2,
    y: height / 2,
    down: false,
    dragging: null,
    lastX: width / 2,
    lastY: height / 2,
    vx: 0,
    vy: 0
  };

  let animationId = null;
  let time = 0;

  const view = {
    scale: 1,
    targetScale: 1,
    offsetX: 0,
    offsetY: 0,
    targetOffsetX: 0,
    targetOffsetY: 0
  };

  function screenToWorld(sx, sy) {
    return {
      x: (sx - view.offsetX) / view.scale,
      y: (sy - view.offsetY) / view.scale
    };
  }

  function worldCursorRadius() {
    return physics.cursorRadius / view.scale;
  }

  function worldGrabRadius() {
    return physics.grabRadius / view.scale;
  }

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

    const worldX = (sx - view.targetOffsetX) / view.targetScale;
    const worldY = (sy - view.targetOffsetY) / view.targetScale;

    view.targetScale = nextScale;
    view.targetOffsetX = sx - worldX * nextScale;
    view.targetOffsetY = sy - worldY * nextScale;
  }

  function syncPhysics() {
    physics = getPhysics(simOptions);
  }

  function syncDensity() {
    const count = targetParticleCount(simOptions.density);
    particles = resizeParticleField(particles, count, sourcePool, width, height, physics);
  }

  // physics — cursor push and drag
  function applyCursorForces() {
    if (pointer.dragging) {
      const p = pointer.dragging;
      p.vx = p.vx + (pointer.x - p.x) * 0.14;
      p.vy = p.vy + (pointer.y - p.y) * 0.14;
      p.x = p.x + p.vx;
      p.y = p.y + p.vy;
      clampVelocity(p, physics.maxSpeed * 1.4);
    }

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (p === pointer.dragging) {
        continue;
      }

      const dx = p.x - pointer.x;
      const dy = p.y - pointer.y;
      const dist = Math.hypot(dx, dy);
      const radius = worldCursorRadius();
      if (dist >= radius || dist < 1) {
        continue;
      }

      const falloff = 1 - dist / radius;
      const push = physics.cursorStrength * falloff * falloff;

      if (pointer.down) {
        p.vx = p.vx + (dx / dist) * push;
        p.vy = p.vy + (dy / dist) * push;
      } else if (Math.abs(pointer.vx) + Math.abs(pointer.vy) > 0.05) {
        p.vx = p.vx + pointer.vx * push * 0.35;
        p.vy = p.vy + pointer.vy * push * 0.35;
      }
    }
  }

  // physics — drift, wrap around edges, slow down over time
  function update() {
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.angle = p.angle + physics.wobble;
      p.phase = p.phase + physics.wobble * 0.7;

      const noiseX =
        Math.sin(p.angle + time * 0.012) * physics.noiseForce +
        Math.sin(p.phase * 1.7 + i * 0.3) * physics.noiseForce * 0.6;
      const noiseY =
        Math.cos(p.angle * 1.3 + time * 0.01) * physics.noiseForce +
        Math.cos(p.phase * 2.1 + i * 0.2) * physics.noiseForce * 0.6;

      p.vx = p.vx + noiseX;
      p.vy = p.vy + noiseY;
      p.vx = p.vx + Math.sin(time * 0.004 + p.phase) * physics.drift * 0.002;
      p.vy = p.vy + Math.cos(time * 0.003 + p.phase * 1.2) * physics.drift * 0.002;

      p.x = p.x + p.vx;
      p.y = p.y + p.vy;

      if (p.x < -60) {
        p.x = width + 60;
      }
      if (p.x > width + 60) {
        p.x = -60;
      }
      if (p.y < -30) {
        p.y = height + 30;
      }
      if (p.y > height + 30) {
        p.y = -30;
      }

      p.vx = p.vx * physics.damp;
      p.vy = p.vy * physics.damp;
      clampVelocity(p, physics.maxSpeed);
    }

    applyCursorForces();
    time = time + 1;
  }

  // drawing
  function draw() {
    const theme = getThemeColors();

    ctx.fillStyle = withAlpha(theme.bg, TRAIL_FADE);
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(view.offsetX, view.offsetY);
    ctx.scale(view.scale, view.scale);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const fontSize = 12 + p.size * 10;
      const weight = p.type === 'core' ? 500 : 400;
      ctx.font = weight + ' ' + fontSize + 'px "Cormorant Garamond", serif';
      const base = p.type === 'core' ? theme.text : theme.muted;
      const alpha = p.opacity * (p.type === 'core' ? 1 : 0.65);
      ctx.fillStyle = withAlpha(base, alpha);
      ctx.fillText(p.text, p.x, p.y);
    }

    ctx.restore();
  }

  // animation loop
  function loop() {
    updateView();
    if (!simOptions.paused) {
      update();
    }
    draw();
    animationId = requestAnimationFrame(loop);
  }

  // pointer interaction
  function setPointerPosition(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const world = screenToWorld(sx, sy);
    pointer.vx = (world.x - pointer.x) * 0.35;
    pointer.vy = (world.y - pointer.y) * 0.35;
    pointer.lastX = pointer.x;
    pointer.lastY = pointer.y;
    pointer.screenX = sx;
    pointer.screenY = sy;
    pointer.x = world.x;
    pointer.y = world.y;
  }

  function onPointerDown(event) {
    canvas.setPointerCapture(event.pointerId);
    pointer.down = true;
    canvas.style.cursor = 'grabbing';
    setPointerPosition(event.clientX, event.clientY);
    pointer.dragging = findNearestParticle(
      particles,
      pointer.x,
      pointer.y,
      worldGrabRadius()
    );
  }

  function onPointerMove(event) {
    setPointerPosition(event.clientX, event.clientY);
  }

  function onPointerUp(event) {
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    pointer.down = false;
    pointer.dragging = null;
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
    const prevWidth = width;
    const prevHeight = height;
    size = fitCanvas(canvas, ctx, container);
    width = size.width;
    height = size.height;

    if (prevWidth > 0 && prevHeight > 0 && (width !== prevWidth || height !== prevHeight)) {
      const scaleX = width / prevWidth;
      const scaleY = height / prevHeight;
      for (let i = 0; i < particles.length; i++) {
        particles[i].x = particles[i].x * scaleX;
        particles[i].y = particles[i].y * scaleY;
      }
      pointer.x = pointer.x * scaleX;
      pointer.y = pointer.y * scaleY;
      pointer.lastX = pointer.lastX * scaleX;
      pointer.lastY = pointer.lastY * scaleY;
    }

    syncDensity();
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('pointerleave', onPointerUp);
  wheelSurface.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('dblclick', onDoubleClick);

  const resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(container);

  loop();

  const api = {
    updateOptions: function (newOptions) {
      newOptions = newOptions || {};
      const prevDensity = simOptions.density;

      if (newOptions.density) simOptions.density = newOptions.density;
      if (newOptions.motion) simOptions.motion = newOptions.motion;
      if (newOptions.intensity) simOptions.intensity = newOptions.intensity;
      if (newOptions.paused === true || newOptions.paused === false) {
        simOptions.paused = newOptions.paused;
      }

      syncPhysics();

      if (simOptions.density !== prevDensity) {
        syncDensity();
      }
    },
    pause: function () {
      simOptions.paused = true;
    },
    resume: function () {
      simOptions.paused = false;
    },
    destroy: function () {
      destroySoup(container);
    }
  };

  // cleanup
  container._soupInstance = {
    cleanup: function () {
      cancelAnimationFrame(animationId);
      animationId = null;
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerUp);
      wheelSurface.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('dblclick', onDoubleClick);
    }
  };

  return api;
}

export function destroySoup(container) {
  if (container._soupInstance) {
    container._soupInstance.cleanup();
    container._soupInstance = null;
  }
  container.innerHTML = '';
}
