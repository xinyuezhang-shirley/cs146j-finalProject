// Turns analyzed text into JSON payloads for each visualization mode.

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function densityToCount(density, min = 8, max = 40) {
  const d = clamp01(density);
  return Math.round(min + d * (max - min));
}

function buildParticles(words, relatedWords = [], density = 1) {
  const maxFreq = Math.max(...words.map((w) => w.frequency), 1);
  const limit = Math.max(8, Math.round(words.length * density));

  const coreParticles = words.slice(0, limit).map((word) => ({
    text: word.text,
    type: 'core',
    source: 'input',
    frequency: word.frequency,
    size: 0.7 + (word.frequency / maxFreq) * 1.3,
    opacity: 0.55 + (word.frequency / maxFreq) * 0.45,
    semanticScore: word.frequency / maxFreq
  }));

  const relatedLimit = Math.max(4, Math.round(relatedWords.length * density));
  const relatedParticles = relatedWords.slice(0, relatedLimit).map((word, i) => ({
    text: word.text,
    type: 'related',
    source: word.source || 'echo',
    frequency: 1,
    size: 0.5 + (1 - i * 0.05) * 0.4,
    opacity: 0.15 + (1 - i * 0.08) * 0.25,
    semanticScore: word.score || 0.3
  }));

  return [...coreParticles, ...relatedParticles];
}

function sliceParticles(particles, density) {
  const count = densityToCount(density, 6, Math.max(6, particles.length));
  return particles.slice(0, count);
}

const ECHO_LINK_WEIGHT = 0.35;

function buildNetworkGraph(analysis, maxNodes) {
  const words = analysis.words || [];
  const relatedWords = analysis.relatedWords || [];
  const text = analysis.text || '';
  const coreIds = new Set(words.map((w) => w.text));
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

  if (edgeMap.size === 0 && analysis.links?.length) {
    analysis.links.forEach((l) => addEdge(l.source, l.target, l.weight || 1));
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

function generateSoupData(analysis, options = {}) {
  const density = clamp01(options.density ?? 0.6);
  return {
    mode: 'soup',
    particles: sliceParticles(analysis.particles || [], density),
    meta: analysis.meta
  };
}

function generateVortexData(analysis, options = {}) {
  const density = clamp01(options.density ?? 0.6);
  return {
    mode: 'vortex',
    particles: sliceParticles(analysis.particles || [], density),
    meta: analysis.meta
  };
}

function generateOrbitData(analysis, options = {}) {
  const density = clamp01(options.density ?? 0.6);
  return {
    mode: 'orbit',
    particles: sliceParticles(analysis.particles || [], density),
    meta: analysis.meta
  };
}

function buildAsciiLayout(analysis, options = {}) {
  const density = clamp01(options.density ?? 0.6);
  const intensity = clamp01(options.intensity ?? 0.4);

  const words = [...(analysis.words || [])]
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, Math.round(4 + density * 16));

  const maxRepeat = Math.round(2 + density * 6 + intensity * 2);
  const padSpread = Math.round(intensity * 3);

  const header = [
    '· · · · · · · · · · · · · · · · · · · · · · · · · · · · · · ·',
    '',
    '                         e c h o',
    '',
    '· · · · · · · · · · · · · · · · · · · · · · · · · · · · · · ·',
    ''
  ];

  const body = words.map((w, i) => {
    const repeat = Math.min(w.frequency || 1, maxRepeat);
    const pad = '  '.repeat(i % (padSpread + 1));
    return `${pad}${w.text.repeat(Math.max(1, repeat))}`;
  });

  body.push('');
  body.push('— — — — — — — — — — — — — — — — — — — — — — — — — —');

  const fragmentLen = Math.round(8 + density * 14);
  const fragment = (analysis.text || '')
    .split(/\s+/)
    .slice(0, fragmentLen)
    .join(' ')
    .toLowerCase();

  if (fragment) {
    body.push('');
    body.push(`  "${fragment}…"`);
  }

  body.push('');
  body.push('  [ ' + words.map((w) => w.text).join(' · ') + ' ]');

  return [...header, ...body];
}

function generateAsciiData(analysis, options = {}) {
  return {
    mode: 'ascii',
    lines: buildAsciiLayout(analysis, options),
    words: analysis.words,
    particles: analysis.particles,
    meta: analysis.meta
  };
}

module.exports = {
  buildParticles,
  generateNetworkData,
  generateSoupData,
  generateVortexData,
  generateOrbitData,
  generateAsciiData
};
