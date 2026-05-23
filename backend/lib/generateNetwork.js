/**
 * Echo network art-data generator — core + echo nodes with co-occurrence links.
 *
 * Uses analysis.relatedWords (Datamuse or local) to fill sparse graphs.
 * At least 60% of nodes prefer core input words when enough are available.
 */

const { clamp01, densityToCount, sliceParticles } = require('./generateParticles');

const ECHO_LINK_WEIGHT = 0.35;

function buildNetworkGraph(analysis, maxNodes) {
  const words = analysis.words || [];
  const relatedWords = analysis.relatedWords || [];
  const text = analysis.text || '';
  const freqMap = new Map(words.map((w) => [w.text, w.frequency || 1]));
  const coreIds = new Set(words.map((w) => w.text));

  const edgeMap = new Map();

  const addEdge = (source, target, weight) => {
    if (!source || !target || source === target) return;
    const key = [source, target].sort().join('||');
    const existing = edgeMap.get(key);
    if (existing) existing.weight += weight;
    else edgeMap.set(key, { source, target, weight });
  };

  // Co-occurrence links from sentence segments
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

  if (edgeMap.size === 0 && analysis.links?.length) {
    analysis.links.forEach((l) => addEdge(l.source, l.target, l.weight || 1));
  }

  // Node selection — core first, related fill when sparse
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

  // Echo links — related node back to its source core word
  nodes
    .filter((n) => n.type === 'related' && n.source && nodeMap.has(n.source))
    .forEach((n) => addEdge(n.source, n.id, ECHO_LINK_WEIGHT));

  const allowed = new Set(nodes.map((n) => n.id));
  const links = [...edgeMap.values()].filter(
    (l) => allowed.has(l.source) && allowed.has(l.target)
  );

  const maxRelatedScore = Math.max(...nodes.filter((n) => n.type === 'related').map((n) => n.score), 1);

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

function generateNetworkData(analysis, options = {}) {
  const density = clamp01(options.density ?? 0.6);
  const maxNodes = densityToCount(density, 8, 40);
  const { nodes, links } = buildNetworkGraph(analysis, maxNodes);

  return {
    mode: 'network',
    nodes,
    links,
    particles: sliceParticles(analysis.particles || [], density),
    meta: { maxNodes, coreCount: nodes.filter((n) => n.type === 'core').length, ...analysis.meta }
  };
}

module.exports = { buildNetworkGraph, generateNetworkData };
