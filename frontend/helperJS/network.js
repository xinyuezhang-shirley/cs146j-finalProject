/**
 * D3 force-directed network — draggable nodes, hover dim/highlight,
 * gentle floating motion. Styled via CSS theme tokens.
 */

import { densityToCount, clamp01 } from './controls.js';

let simulation = null;
let zoomBehavior = null;
let resizeObserver = null;

export function renderNetwork(container, data, options = {}) {
  if (typeof d3 === 'undefined') {
    throw new Error('D3.js is not loaded. Check the CDN script in index.html.');
  }
  if (!container) {
    throw new Error('Network render failed: missing container element.');
  }

  destroyNetwork(container);

  const density = clamp01(options.density ?? 0.6);
  const motion = clamp01(options.motion ?? 0.4);
  const intensity = clamp01(options.intensity ?? 0.4);
  const paused = options.paused ?? false;
  const maxNodes = densityToCount(density, 8, 40);
  const graphData = prepareGraphData(data, maxNodes);

  if (!graphData.nodes.length) {
    container.innerHTML = '<p class="network-empty">Not enough words to draw a network.</p>';
    return { pause: () => {}, resume: () => {}, destroy: () => destroyNetwork(container) };
  }

  let width = container.clientWidth;
  let height = container.clientHeight;

  const svg = d3.select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', `0 0 ${width} ${height}`)
    .style('background', 'transparent');

  const g = svg.append('g');

  // Pan/zoom on empty space + wheel only — never steal clicks from nodes
  zoomBehavior = d3.zoom()
    .scaleExtent([0.4, 3])
    .filter((event) => {
      if (event.type === 'wheel') return true;
      if (event.type.startsWith('touch')) return isBackgroundTarget(event.target, svg.node());
      return isBackgroundTarget(event.target, svg.node());
    })
    .on('zoom', (event) => g.attr('transform', event.transform));

  svg.call(zoomBehavior);

  // Background rect for panning (like clicking empty canvas)
  g.append('rect')
    .attr('class', 'network-bg')
    .attr('width', width)
    .attr('height', height)
    .attr('fill', 'transparent');

  const link = g.append('g')
    .attr('class', 'network-links')
    .selectAll('line')
    .data(graphData.links)
    .join('line')
    .attr('class', 'network-link')
    .attr('stroke-width', (d) => 0.8 + d.weight * 1.2);

  const node = g.append('g')
    .attr('class', 'network-nodes')
    .selectAll('g')
    .data(graphData.nodes)
    .join('g')
    .attr('class', (d) => `network-node${d.type === 'related' ? ' network-node--related' : ' network-node--core'}`)
    .attr('tabindex', 0)
    .attr('role', 'button')
    .attr('aria-label', (d) => `${d.type === 'core' ? 'Core' : 'Echo'} word ${d.id}`);

  // Larger invisible hit target so nodes are easy to grab
  node.append('circle')
    .attr('class', 'node-hit')
    .attr('r', (d) => d.radius + 12)
    .attr('fill', 'transparent');

  node.append('circle')
    .attr('class', 'node-circle')
    .attr('r', (d) => d.radius)
    .attr('opacity', (d) => d.opacity ?? 1);

  node.append('text')
    .attr('class', 'node-label')
    .attr('text-anchor', 'middle')
    .attr('dy', '0.35em')
    .attr('font-size', (d) => (
      d.type === 'core'
        ? `${11 + d.count * 2.5}px`
        : `${9 + Math.min(d.score || 0.3, 1) * 4}px`
    ))
    .attr('opacity', (d) => d.opacity ?? 1)
    .text((d) => d.id);

  const charge = -100 - intensity * 320;
  const linkDistance = 70 + intensity * 110;
  const collisionPad = 8 + intensity * 22;
  const alphaDecay = 0.045 - motion * 0.038;
  const velocityDecay = 0.35 + (1 - motion) * 0.25;
  const floatStrength = 0.008 + motion * 0.045;

  simulation = d3.forceSimulation(graphData.nodes)
    .velocityDecay(velocityDecay)
    .force('link', d3.forceLink(graphData.links)
      .id((d) => d.id)
      .distance(linkDistance)
      .strength(0.06 + intensity * 0.06))
    .force('charge', d3.forceManyBody().strength(charge))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius((d) => d.radius + collisionPad))
    .force('x', d3.forceX(width / 2).strength(floatStrength))
    .force('y', d3.forceY(height / 2).strength(floatStrength))
    .alphaDecay(alphaDecay)
    .on('tick', ticked);

  if (paused) simulation.stop();

  // Gentle ambient drift — stronger when motion is high
  if (motion > 0.05) {
    const driftInterval = setInterval(() => {
      if (!simulation || paused) return;
      simulation.alphaTarget(0.08 + motion * 0.25);
      setTimeout(() => simulation?.alphaTarget(0), 400);
    }, 2200 - motion * 1600);
    container._driftInterval = driftInterval;
  }

  // Attach drag AFTER simulation exists (matches reference pattern)
  node.call(drag(simulation, g));

  node
    .on('mouseenter', (_, d) => highlightNode(node, link, d))
    .on('focus', (_, d) => highlightNode(node, link, d))
    .on('mouseleave', () => clearHighlight(node, link))
    .on('blur', () => clearHighlight(node, link));

  function ticked() {
    link
      .attr('x1', (d) => d.source.x)
      .attr('y1', (d) => d.source.y)
      .attr('x2', (d) => d.target.x)
      .attr('y2', (d) => d.target.y);

    node.attr('transform', (d) => `translate(${d.x}, ${d.y})`);
  }

  function handleResize() {
    width = container.clientWidth;
    height = container.clientHeight;
    svg.attr('viewBox', `0 0 ${width} ${height}`);
    g.select('.network-bg')
      .attr('width', width)
      .attr('height', height);
    simulation
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('x', d3.forceX(width / 2).strength(floatStrength))
      .force('y', d3.forceY(height / 2).strength(floatStrength))
      .alpha(0.3 + motion * 0.4)
      .restart();
  }

  resizeObserver = new ResizeObserver(handleResize);
  resizeObserver.observe(container);

  return {
    pause: () => simulation?.stop(),
    resume: () => simulation?.alpha(0.3).restart(),
    destroy: () => destroyNetwork(container)
  };
}

/** True if the event target is the background, not a node/link. */
function isBackgroundTarget(target, svgEl) {
  if (!target) return true;
  let el = target;
  while (el && el !== svgEl) {
    if (el.classList?.contains('network-node')) return false;
    if (el.classList?.contains('network-link')) return false;
    el = el.parentNode;
  }
  return true;
}

function prepareGraphData(data, maxNodes = 20) {
  const words = data.words || [];
  const relatedWords = data.relatedWords || [];
  const text = data.text || '';
  const coreIds = new Set(words.map((w) => w.text));
  const ECHO_LINK_WEIGHT = 0.35;
  const edgeMap = new Map();

  const addEdge = (source, target, weight) => {
    if (!source || !target || source === target) return;
    const key = [source, target].sort().join('||');
    const existing = edgeMap.get(key);
    if (existing) existing.weight += weight;
    else edgeMap.set(key, { source, target, weight });
  };

  const chunks = text.split(/[.!?\n]+/).map((s) => s.trim()).filter(Boolean);
  const segments = chunks.length ? chunks : [text.trim()].filter(Boolean);

  for (const segment of segments) {
    const lower = segment.toLowerCase();
    const keywords = [...new Set(
      words
        .filter((w) => lower.includes(w.text))
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, 6)
        .map((w) => w.text)
    )];

    for (let i = 0; i < keywords.length; i++) {
      for (let j = i + 1; j < keywords.length; j++) {
        addEdge(keywords[i], keywords[j], 1);
      }
    }
  }

  if (edgeMap.size === 0 && data.links?.length) {
    data.links.forEach((l) => addEdge(l.source, l.target, l.weight || 1));
  }

  const sortedCore = [...words].sort((a, b) => b.frequency - a.frequency);
  const minCore = Math.ceil(maxNodes * 0.6);
  const maxRelated = Math.floor(maxNodes * 0.4);

  let numCore;
  if (sortedCore.length >= minCore) {
    numCore = Math.max(minCore, Math.min(sortedCore.length, maxNodes - maxRelated));
  } else {
    numCore = sortedCore.length;
  }

  const numRelated = Math.max(0, maxNodes - numCore);
  const nodeMap = new Map();

  sortedCore.slice(0, numCore).forEach((w) => {
    nodeMap.set(w.text, {
      id: w.text,
      count: w.frequency || 1,
      type: 'core',
      score: 1
    });
  });

  relatedWords
    .filter((r) => !coreIds.has(r.text))
    .slice(0, numRelated)
    .forEach((r) => {
      nodeMap.set(r.text, {
        id: r.text,
        count: 1,
        type: 'related',
        source: r.source || null,
        score: r.score || 0.3
      });
    });

  const nodes = [...nodeMap.values()];

  nodes
    .filter((n) => n.type === 'related' && n.source && nodeMap.has(n.source))
    .forEach((n) => addEdge(n.source, n.id, ECHO_LINK_WEIGHT));

  const allowed = new Set(nodes.map((n) => n.id));
  const links = [...edgeMap.values()].filter(
    (l) => allowed.has(l.source) && allowed.has(l.target)
  );

  const maxRelatedScore = Math.max(
    ...nodes.filter((n) => n.type === 'related').map((n) => n.score),
    1
  );

  nodes.forEach((node) => {
    if (node.type === 'core') {
      node.radius = 14 + node.count * 4;
      node.opacity = 1;
    } else {
      const semantic = Math.min(node.score / maxRelatedScore, 1);
      node.radius = 9 + semantic * 5;
      node.opacity = 0.32 + semantic * 0.38;
    }
    node.connections = links.filter(
      (l) => l.source === node.id || l.target === node.id
    );
  });

  return { nodes, links };
}

/**
 * Drag handler — uses d3.pointer so coordinates stay correct under zoom.
 * Matches the reference: restart simulation on drag, release fx/fy on end.
 */
function drag(sim, rootG) {
  return d3.drag()
    .on('start', function (event, d) {
      event.sourceEvent?.stopPropagation();
      d3.select(this).raise();
      if (!event.active) sim.alphaTarget(0.2).restart();
      d.fx = d.x;
      d.fy = d.y;
    })
    .on('drag', function (event, d) {
      const [x, y] = d3.pointer(event, rootG.node());
      d.fx = x;
      d.fy = y;
    })
    .on('end', function (event, d) {
      if (!event.active) sim.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    });
}

function highlightNode(node, link, activeNode) {
  const connectedIds = new Set([activeNode.id]);

  activeNode.connections.forEach((l) => {
    const src = l.source.id || l.source;
    const tgt = l.target.id || l.target;
    connectedIds.add(src);
    connectedIds.add(tgt);
  });

  node
    .classed('is-dimmed', (d) => !connectedIds.has(d.id))
    .classed('is-active', (d) => d.id === activeNode.id);

  link
    .classed('is-dimmed', (d) => {
      const src = d.source.id || d.source;
      const tgt = d.target.id || d.target;
      return src !== activeNode.id && tgt !== activeNode.id;
    })
    .classed('is-active', (d) => {
      const src = d.source.id || d.source;
      const tgt = d.target.id || d.target;
      return src === activeNode.id || tgt === activeNode.id;
    });
}

function clearHighlight(node, link) {
  node.classed('is-dimmed', false).classed('is-active', false);
  link.classed('is-dimmed', false).classed('is-active', false);
}

export function destroyNetwork(container) {
  if (container?._driftInterval) {
    clearInterval(container._driftInterval);
    container._driftInterval = null;
  }
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (simulation) {
    simulation.stop();
    simulation = null;
  }
  zoomBehavior = null;
  if (!container) return;
  if (typeof d3 !== 'undefined') {
    d3.select(container).selectAll('*').remove();
  } else {
    container.innerHTML = '';
  }
}

export function setNetworkPaused(paused) {
  if (!simulation) return;
  if (paused) simulation.stop();
  else simulation.alpha(0.2).restart();
}
