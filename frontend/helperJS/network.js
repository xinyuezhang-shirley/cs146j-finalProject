// D3 force graph — draggable nodes, hover highlight, pan/zoom on empty space

import { densityToCount, getContainerSize } from './controls.js';

let simulation = null;
let zoomBehavior = null;
let resizeObserver = null;

export function renderNetwork(container, data, options) {
  destroyNetwork(container);

  options = options || {};

  let density = options.density || 0.6;
  let motion = options.motion || 0.4;
  let intensity = options.intensity || 0.4;
  let paused = options.paused || false;
  const maxNodes = densityToCount(density, 8, 40);
  const graphData = prepareGraphData(data, maxNodes);

  if (!graphData.nodes.length) {
    container.innerHTML = '<p class="network-empty">Not enough words to draw a network.</p>';
    return {
      pause: function () {},
      resume: function () {},
      destroy: function () {
        destroyNetwork(container);
      }
    };
  }

  // gets the container size and sets the width and height of the svg
  let size = getContainerSize(container);
  let width = size.width;
  let height = size.height;

  // creates the svg element and sets the width and height
  const svg = d3.select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', '0 0 ' + width + ' ' + height)
    .style('width', '100%')
    .style('height', '100%')
    .style('display', 'block')
    .style('background', 'transparent');

  const g = svg.append('g');

  // pan/zoom on empty space — node clicks still work
  zoomBehavior = d3.zoom()
    .scaleExtent([0.4, 3])
    .filter(function (event) {
      if (event.type === 'wheel') return true;
      return isBackgroundTarget(event.target, svg.node());
    })
    .on('zoom', function (event) {
      g.attr('transform', event.transform);
    });

  svg.call(zoomBehavior);

  // invisible background so dragging empty space pans the graph
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
    .attr('stroke-width', function (d) {
      return 0.8 + d.weight * 1.2;
    });

  const node = g.append('g')
    .attr('class', 'network-nodes')
    .selectAll('g')
    .data(graphData.nodes)
    .join('g')
    .attr('class', function (d) {
      if (d.type === 'related') {
        return 'network-node network-node--related';
      }
      return 'network-node network-node--core';
    })
    .attr('tabindex', 0)
    .attr('role', 'button')
    .attr('aria-label', function (d) {
      if (d.type === 'core') {
        return 'Core word ' + d.id;
      }
      return 'Echo word ' + d.id;
    });

  // larger invisible hit target so nodes are easy to grab
  node.append('circle')
    .attr('class', 'node-hit')
    .attr('r', function (d) {
      return d.radius + 12;
    })
    .attr('fill', 'transparent');

  node.append('circle')
    .attr('class', 'node-circle')
    .attr('r', function (d) {
      return d.radius;
    })
    .attr('opacity', function (d) {
      return d.opacity || 1;
    });

  node.append('text')
    .attr('class', 'node-label')
    .attr('text-anchor', 'middle')
    .attr('dy', '0.35em')
    .attr('font-size', function (d) {
      if (d.type === 'core') {
        return (11 + d.count * 2.5) + 'px';
      }
      const score = d.score || 0.3;
      return (9 + Math.min(score, 1) * 4) + 'px';
    })
    .attr('opacity', function (d) {
      return d.opacity || 1;
    })
    .text(function (d) {
      return d.id;
    });

  // physics — D3 forces control how nodes move and settle
  const charge = -100 - intensity * 320;
  const linkDistance = 70 + intensity * 110;
  const collisionPad = 8 + intensity * 22;
  const alphaDecay = 0.045 - motion * 0.038;
  const velocityDecay = 0.35 + (1 - motion) * 0.25;
  const floatStrength = 0.008 + motion * 0.045;

  simulation = d3.forceSimulation(graphData.nodes)
    .velocityDecay(velocityDecay)
    .force('link', d3.forceLink(graphData.links)
      .id(function (d) {
        return d.id;
      })
      .distance(linkDistance)
      .strength(0.06 + intensity * 0.06))
    .force('charge', d3.forceManyBody().strength(charge))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(function (d) {
      return d.radius + collisionPad;
    }))
    .force('x', d3.forceX(width / 2).strength(floatStrength))
    .force('y', d3.forceY(height / 2).strength(floatStrength))
    .alphaDecay(alphaDecay)
    .on('tick', ticked);

  if (paused) {
    simulation.stop();
  }

  // gentle ambient drift when motion slider is up
  if (motion > 0.05) {
    const driftInterval = setInterval(function () {
      if (!simulation || paused) {
        return;
      }
      simulation.alphaTarget(0.08 + motion * 0.25);
      setTimeout(function () {
        if (simulation) {
          simulation.alphaTarget(0);
        }
      }, 400);
    }, 2200 - motion * 1600);
    container._driftInterval = driftInterval;
  }

  // pointer interaction — drag nodes around
  node.call(drag(simulation, g));

  node
    .on('mouseenter', function (_, d) {
      highlightNode(node, link, d);
    })
    .on('focus', function (_, d) {
      highlightNode(node, link, d);
    })
    .on('mouseleave', function () {
      clearHighlight(node, link);
    })
    .on('blur', function () {
      clearHighlight(node, link);
    });

  // animation loop — update line and node positions each tick
  function ticked() {
    link
      .attr('x1', function (d) {
        return d.source.x;
      })
      .attr('y1', function (d) {
        return d.source.y;
      })
      .attr('x2', function (d) {
        return d.target.x;
      })
      .attr('y2', function (d) {
        return d.target.y;
      });

    node.attr('transform', function (d) {
      return 'translate(' + d.x + ', ' + d.y + ')';
    });
  }

  // resize
  function handleResize() {
    size = getContainerSize(container);
    width = size.width;
    height = size.height;
    svg
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', '0 0 ' + width + ' ' + height);
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
  const wrap = container.closest('.studio-canvas-wrap') || container;
  resizeObserver.observe(wrap);

  return {
    pause: function () {
      simulation.stop();
    },
    resume: function () {
      simulation.alpha(0.3).restart();
    },
    destroy: function () {
      destroyNetwork(container);
    }
  };
}

// true when the click landed on empty space, not a node or link
function isBackgroundTarget(target, svgEl) {
  let el = target;
  while (el && el !== svgEl) {
    if (el.classList && el.classList.contains('network-node')) return false;
    if (el.classList && el.classList.contains('network-link')) return false;
    el = el.parentNode;
  }
  return true;
}

// build the word nodes and links for the D3 graph
function prepareGraphData(data, maxNodes) {
  maxNodes = maxNodes || 20;

  const words = data.words || [];
  const relatedWords = data.relatedWords || [];
  const text = data.text || '';
  const coreIds = {};
  for (let i = 0; i < words.length; i++) {
    coreIds[words[i].text] = true;
  }

  const ECHO_LINK_WEIGHT = 0.35;
  const edgeMap = new Map();

  function addEdge(source, target, weight) {
    if (!source || !target || source === target) {
      return;
    }
    const pair = [source, target].sort();
    const key = pair[0] + '||' + pair[1];
    const existing = edgeMap.get(key);
    if (existing) {
      existing.weight = existing.weight + weight;
    } else {
      edgeMap.set(key, { source: source, target: target, weight: weight });
    }
  }

  // connect words that show up in the same sentence
  const chunks = text.split(/[.!?\n]+/);
  const segments = [];
  for (let i = 0; i < chunks.length; i++) {
    const trimmed = chunks[i].trim();
    if (trimmed) {
      segments.push(trimmed);
    }
  }
  if (!segments.length && text.trim()) {
    segments.push(text.trim());
  }

  for (let s = 0; s < segments.length; s++) {
    const segment = segments[s];
    const lower = segment.toLowerCase();

    const keywords = [];
    const seen = {};
    const sorted = words.slice().sort(function (a, b) {
      return b.frequency - a.frequency;
    });

    for (let i = 0; i < sorted.length && keywords.length < 6; i++) {
      const w = sorted[i];
      if (lower.indexOf(w.text) !== -1 && !seen[w.text]) {
        seen[w.text] = true;
        keywords.push(w.text);
      }
    }

    for (let i = 0; i < keywords.length; i++) {
      for (let j = i + 1; j < keywords.length; j++) {
        addEdge(keywords[i], keywords[j], 1);
      }
    }
  }

  // fall back to co-occurrence links from text analysis
  if (edgeMap.size === 0 && data.links && data.links.length) {
    for (let i = 0; i < data.links.length; i++) {
      const l = data.links[i];
      addEdge(l.source, l.target, l.weight || 1);
    }
  }

  // pick how many core vs related nodes to show
  const sortedCore = words.slice().sort(function (a, b) {
    return b.frequency - a.frequency;
  });
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

  for (let i = 0; i < numCore; i++) {
    const w = sortedCore[i];
    if (!w) {
      break;
    }
    nodeMap.set(w.text, {
      id: w.text,
      count: w.frequency || 1,
      type: 'core',
      score: 1
    });
  }

  let relatedAdded = 0;
  for (let i = 0; i < relatedWords.length && relatedAdded < numRelated; i++) {
    const r = relatedWords[i];
    if (coreIds[r.text]) {
      continue;
    }
    nodeMap.set(r.text, {
      id: r.text,
      count: 1,
      type: 'related',
      source: r.source || null,
      score: r.score || 0.3
    });
    relatedAdded = relatedAdded + 1;
  }

  const nodes = [];
  nodeMap.forEach(function (node) {
    nodes.push(node);
  });

  // link related words back to the core word they came from
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.type === 'related' && n.source && nodeMap.has(n.source)) {
      addEdge(n.source, n.id, ECHO_LINK_WEIGHT);
    }
  }

  const allowed = {};
  for (let i = 0; i < nodes.length; i++) {
    allowed[nodes[i].id] = true;
  }

  const links = [];
  edgeMap.forEach(function (edge) {
    if (allowed[edge.source] && allowed[edge.target]) {
      links.push(edge);
    }
  });

  let maxRelatedScore = 1;
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].type === 'related' && nodes[i].score > maxRelatedScore) {
      maxRelatedScore = nodes[i].score;
    }
  }

  // size and fade nodes based on importance
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.type === 'core') {
      node.radius = 14 + node.count * 4;
      node.opacity = 1;
    } else {
      const semantic = Math.min(node.score / maxRelatedScore, 1);
      node.radius = 9 + semantic * 5;
      node.opacity = 0.32 + semantic * 0.38;
    }

    node.connections = [];
    for (let j = 0; j < links.length; j++) {
      const l = links[j];
      if (l.source === node.id || l.target === node.id) {
        node.connections.push(l);
      }
    }
  }

  return { nodes: nodes, links: links };
}

// let the user drag a node and pin it while dragging
function drag(sim, rootG) {
  return d3.drag()
    .on('start', function (event, d) {
      if (event.sourceEvent) {
        event.sourceEvent.stopPropagation();
      }
      d3.select(this).raise();
      if (!event.active) {
        sim.alphaTarget(0.2).restart();
      }
      d.fx = d.x;
      d.fy = d.y;
    })
    .on('drag', function (event, d) {
      const point = d3.pointer(event, rootG.node());
      d.fx = point[0];
      d.fy = point[1];
    })
    .on('end', function (event, d) {
      if (!event.active) {
        sim.alphaTarget(0);
      }
      d.fx = null;
      d.fy = null;
    });
}

// dim everything except the hovered node and its neighbors
function highlightNode(node, link, activeNode) {
  const connectedIds = {};
  connectedIds[activeNode.id] = true;

  for (let i = 0; i < activeNode.connections.length; i++) {
    const l = activeNode.connections[i];
    const src = l.source.id || l.source;
    const tgt = l.target.id || l.target;
    connectedIds[src] = true;
    connectedIds[tgt] = true;
  }

  node
    .classed('is-dimmed', function (d) {
      return !connectedIds[d.id];
    })
    .classed('is-active', function (d) {
      return d.id === activeNode.id;
    });

  link
    .classed('is-dimmed', function (d) {
      const src = d.source.id || d.source;
      const tgt = d.target.id || d.target;
      return src !== activeNode.id && tgt !== activeNode.id;
    })
    .classed('is-active', function (d) {
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
  if (container._driftInterval) {
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
  d3.select(container).selectAll('*').remove();
}
