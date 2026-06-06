// This is the backend version of artFallback.js.
// The fallback only makes simple local payloads when the API is unavailable.
// This file uses the richer backend analysis to make fuller data for each mode.

// related-word edges should be visible, but weaker than core text edges
const ECHO_LINK_WEIGHT = 0.35;


// keeps a number between 0 and 1
// useful for sliders because density/motion/intensity are all 0 to 1
function clamp01(value) {
  if (value < 0) {
    return 0;
  }

  if (value > 1) {
    return 1;
  }

  return value;
}


// turns density into a number of items
// example: low density = fewer words/nodes, high density = more words/nodes
function densityToCount(density, min, max) {
  const d = clamp01(density);
  return Math.round(min + d * (max - min));
}


// creates particles from core words and related words
// particles are used by modes like soup, vortex, and orbit
function buildParticles(words, relatedWords, density) {
  if (!relatedWords) {
    relatedWords = [];
  }

  if (density === undefined || density === null) {
    density = 1;
  }

  // find the highest word frequency
  // this lets us scale particle size relative to the strongest word
  let maxFreq = 1;
  for (let i = 0; i < words.length; i++) {
    if (words[i].frequency > maxFreq) {
      maxFreq = words[i].frequency;
    }
  }

  // density controls how many core words become particles
  const limit = Math.max(8, Math.round(words.length * density));
  const coreParticles = [];

  for (let i = 0; i < words.length && i < limit; i++) {
    const word = words[i];

    // strength is between 0 and 1
    // frequent words become larger and more visible
    const strength = word.frequency / maxFreq;

    coreParticles.push({
      text: word.text,
      type: 'core',
      source: 'input',
      frequency: word.frequency,
      size: 0.7 + strength * 1.3,
      opacity: 0.55 + strength * 0.45,
      semanticScore: strength
    });
  }

  // related particles come from Datamuse/local related-word expansion
  const relatedLimit = Math.max(4, Math.round(relatedWords.length * density));
  const relatedParticles = [];

  for (let i = 0; i < relatedWords.length && i < relatedLimit; i++) {
    const word = relatedWords[i];

    relatedParticles.push({
      text: word.text,
      type: 'related',
      source: word.source || 'echo',
      frequency: 1,

      // earlier related words are treated as stronger
      size: 0.5 + (1 - i * 0.05) * 0.4,
      opacity: 0.15 + (1 - i * 0.08) * 0.25,

      semanticScore: word.score || 0.3
    });
  }

  // core particles come from the user's actual text
  // related particles are Echo's semantic expansion
  return coreParticles.concat(relatedParticles);
}


// keeps only some particles depending on density
// this prevents crowded visualizations when density is low
function sliceParticles(particles, density) {
  const count = densityToCount(density, 6, Math.max(6, particles.length));
  return particles.slice(0, count);
}


// creates the shared fields every art mode needs
// this keeps network/soup/vortex/orbit/ascii responses consistent
function attachAnalysisFields(analysis, payload) {
  const payloadMeta = payload.meta || {};
  const analysisMeta = analysis.meta || {};

  // mode-specific metadata can override or add to analysis metadata
  const mergedMeta = Object.assign({}, analysisMeta, payloadMeta);

  return Object.assign({}, payload, {
    text: analysis.text,
    words: analysis.words,
    relatedWords: analysis.relatedWords,
    frequency: analysis.frequency,
    cooccurrenceLinks: analysis.links,
    meta: mergedMeta
  });
}


// --- network graph helpers ---

// creates a small helper object for storing graph edges
// the main reason for this is to avoid duplicate edges
function createEdgeMap() {
  const edgeMap = new Map();

  function addEdge(source, target, weight) {
    // do not create empty edges or self-links
    if (!source || !target || source === target) {
      return;
    }

    // sort so A-B and B-A are treated as the same edge
    const key = [source, target].sort().join('||');
    const existing = edgeMap.get(key);

    if (existing) {
      // if the edge already exists, make it stronger
      existing.weight += weight;
    } else {
      edgeMap.set(key, { source: source, target: target, weight: weight });
    }
  }

  function getLinks(allowedIds) {
    const links = [];

    // only return edges where both nodes are actually in the graph
    edgeMap.forEach(function (edge) {
      if (allowedIds.has(edge.source) && allowedIds.has(edge.target)) {
        links.push(edge);
      }
    });

    return links;
  }

  function size() {
    return edgeMap.size;
  }

  return { addEdge: addEdge, getLinks: getLinks, size: size };
}


// splits the passage into sentence-like chunks
// this lets the network connect words that appear in the same thought
function splitTextSegments(text) {
  const chunks = text.split(/[.!?\n]+/);
  const segments = [];

  for (let i = 0; i < chunks.length; i++) {
    const trimmed = chunks[i].trim();

    if (trimmed) {
      segments.push(trimmed);
    }
  }

  // if punctuation splitting failed, use the whole text as one segment
  if (segments.length === 0) {
    const whole = text.trim();

    if (whole) {
      segments.push(whole);
    }
  }

  return segments;
}


// connects core words that show up in the same sentence chunk
// this usually creates cleaner network edges than random particle links
function addSentenceEdges(text, words, addEdge) {
  const segments = splitTextSegments(text);

  for (let s = 0; s < segments.length; s++) {
    const lower = segments[s].toLowerCase();
    const keywords = [];
    const seen = new Set();

    // prioritize frequent words first
    const sorted = words.slice().sort(function (a, b) {
      return b.frequency - a.frequency;
    });

    for (let i = 0; i < sorted.length; i++) {
      const w = sorted[i];

      // if this sentence contains the word, add it as a keyword
      if (lower.includes(w.text) && !seen.has(w.text)) {
        seen.add(w.text);
        keywords.push(w.text);

        // cap per sentence so one long sentence does not create too many edges
        if (keywords.length >= 6) {
          break;
        }
      }
    }

    // connect every keyword in this sentence to every other keyword
    for (let i = 0; i < keywords.length; i++) {
      for (let j = i + 1; j < keywords.length; j++) {
        addEdge(keywords[i], keywords[j], 1);
      }
    }
  }
}


// uses co-occurrence links from analysis if sentence edges did not produce any
// this is basically a backup so the network never feels empty
function addCooccurrenceEdgesIfNeeded(analysis, addEdge, edgeCount) {
  if (edgeCount > 0) {
    return;
  }

  const links = analysis.links || [];

  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    addEdge(link.source, link.target, link.weight || 1);
  }
}


// decides how many core vs related nodes fit in the graph
// most nodes should be real words from the passage
// but some space is saved for related words so the graph feels more alive
function pickCoreAndRelatedCounts(wordCount, maxNodes) {
  const minCore = Math.ceil(maxNodes * 0.6);
  const maxRelated = Math.floor(maxNodes * 0.4);
  let numCore;

  if (wordCount >= minCore) {
    numCore = Math.max(minCore, Math.min(wordCount, maxNodes - maxRelated));
  } else {
    numCore = wordCount;
  }

  const numRelated = Math.max(0, maxNodes - numCore);

  return { numCore: numCore, numRelated: numRelated };
}


// makes the main word nodes for the network
// these are the actual important words from the user's text
function makeCoreNodes(sortedCoreWords, numCore) {
  const nodes = [];

  for (let i = 0; i < sortedCoreWords.length && i < numCore; i++) {
    const w = sortedCoreWords[i];

    nodes.push({
      id: w.text,
      count: w.frequency || 1,
      type: 'core',
      score: 1
    });
  }

  return nodes;
}


// adds related-word nodes that are not already core words
// these nodes come from semantic expansion rather than the direct input text
function makeRelatedNodes(relatedWords, coreIds, remainingSlots) {
  const nodes = [];

  for (let i = 0; i < relatedWords.length && nodes.length < remainingSlots; i++) {
    const r = relatedWords[i];

    // do not duplicate a word that is already a core node
    if (coreIds.has(r.text)) {
      continue;
    }

    nodes.push({
      id: r.text,
      count: 1,
      type: 'related',
      source: r.source || null,
      score: r.score || 0.3
    });
  }

  return nodes;
}


// draws edges from each related word back to the core word it came from
// example: if "memory" generated "recollection", connect them
function addRelatedWordEdges(nodes, nodeIds, addEdge) {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];

    if (node.type === 'related' && node.source && nodeIds.has(node.source)) {
      addEdge(node.source, node.id, ECHO_LINK_WEIGHT);
    }
  }
}


// sets radius, opacity, and connection list on each node
// this is styling data for the frontend network renderer
function styleNetworkNodes(nodes, links) {
  let maxRelatedScore = 1;

  // find the strongest related-word score
  // used so related nodes can be scaled relative to each other
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].type === 'related' && nodes[i].score > maxRelatedScore) {
      maxRelatedScore = nodes[i].score;
    }
  }

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const nodeLinks = [];

    // collect all links touching this node
    for (let j = 0; j < links.length; j++) {
      const link = links[j];

      if (link.source === node.id || link.target === node.id) {
        nodeLinks.push(link);
      }
    }

    node.connections = nodeLinks;

    if (node.type === 'core') {
      // core words are larger and fully visible
      node.radius = 14 + node.count * 4;
      node.opacity = 1;
    } else {
      // related words are softer and scaled by semantic score
      const semantic = Math.min(node.score / maxRelatedScore, 1);
      node.radius = 9 + semantic * 5;
      node.opacity = 0.32 + semantic * 0.38;
    }
  }
}


// builds nodes and links for network mode
// this function combines all the smaller graph helpers above
function buildNetworkGraph(analysis, maxNodes) {
  const words = analysis.words || [];
  const relatedWords = analysis.relatedWords || [];
  const text = analysis.text || '';
  const coreIds = new Set(words.map(function (w) { return w.text; }));

  // create sentence-based edges first
  const edgeTools = createEdgeMap();
  addSentenceEdges(text, words, edgeTools.addEdge);

  // if that produced no edges, use the co-occurrence links from analysis
  addCooccurrenceEdgesIfNeeded(analysis, edgeTools.addEdge, edgeTools.size());

  // strongest core words should appear first
  const sortedCore = words.slice().sort(function (a, b) {
    return b.frequency - a.frequency;
  });

  const counts = pickCoreAndRelatedCounts(sortedCore.length, maxNodes);

  // create core nodes and related nodes separately
  const coreNodes = makeCoreNodes(sortedCore, counts.numCore);
  const relatedNodes = makeRelatedNodes(relatedWords, coreIds, counts.numRelated);
  const nodes = coreNodes.concat(relatedNodes);

  // now that nodes are chosen, only keep edges between existing nodes
  const nodeIds = new Set(nodes.map(function (n) { return n.id; }));

  // connect related words back to their source words
  addRelatedWordEdges(nodes, nodeIds, edgeTools.addEdge);

  const links = edgeTools.getLinks(nodeIds);

  // add visual sizing/opacity fields
  styleNetworkNodes(nodes, links);

  return { nodes: nodes, links: links };
}


// builds the network mode data
// density controls how many nodes are allowed in the graph
function generateNetworkData(analysis, options) {
  options = options || {};

  const density = clamp01(options.density !== undefined && options.density !== null
    ? options.density
    : 0.6);

  const maxNodes = densityToCount(density, 8, 40);
  const graph = buildNetworkGraph(analysis, maxNodes);

  let coreCount = 0;

  for (let i = 0; i < graph.nodes.length; i++) {
    if (graph.nodes[i].type === 'core') {
      coreCount += 1;
    }
  }

  return attachAnalysisFields(analysis, {
    mode: 'network',
    nodes: graph.nodes,
    links: graph.links,

    // also include particles so the frontend can reuse shared effects
    particles: sliceParticles(analysis.particles || [], density),

    meta: {
      maxNodes: maxNodes,
      coreCount: coreCount
    }
  });
}


// shared helper for soup, vortex, and orbit
// these are all floating particle modes, so the backend payload is similar
function generateFloatingModeData(analysis, mode, options) {
  options = options || {};

  const density = clamp01(options.density !== undefined && options.density !== null
    ? options.density
    : 0.6);

  return attachAnalysisFields(analysis, {
    mode: mode,
    particles: sliceParticles(analysis.particles || [], density)
  });
}


// builds the soup mode data
// the frontend decides how the soup particles float
function generateSoupData(analysis, options) {
  return generateFloatingModeData(analysis, 'soup', options);
}


// builds the vortex mode data
// same particle payload, different frontend motion
function generateVortexData(analysis, options) {
  return generateFloatingModeData(analysis, 'vortex', options);
}


// builds the orbit mode data
// same particle payload, different frontend layout
function generateOrbitData(analysis, options) {
  return generateFloatingModeData(analysis, 'orbit', options);
}


// lays out ASCII lines from the top words in the passage
// this mode turns analysis into a text-art style output
function buildAsciiLayout(analysis, options) {
  options = options || {};

  const density = clamp01(options.density !== undefined && options.density !== null
    ? options.density
    : 0.6);

  const intensity = clamp01(options.intensity !== undefined && options.intensity !== null
    ? options.intensity
    : 0.4);

  // use the most frequent words first
  const sortedWords = (analysis.words || []).slice().sort(function (a, b) {
    return b.frequency - a.frequency;
  });

  // density controls how many words appear in the ASCII piece
  const wordCount = Math.round(4 + density * 16);
  const words = sortedWords.slice(0, wordCount);

  // density/intensity affect how repeated and dramatic the text feels
  const maxRepeat = Math.round(2 + density * 6 + intensity * 2);
  const padSpread = Math.round(intensity * 3);

  // decorative title area
  const header = [
    '· · · · · · · · · · · · · · · · · · · · · · · · · · · · · · ·',
    '',
    '                         e c h o',
    '',
    '· · · · · · · · · · · · · · · · · · · · · · · · · · · · · · ·',
    ''
  ];

  const body = [];

  for (let i = 0; i < words.length; i++) {
    const w = words[i];

    // frequent words repeat more, but never beyond maxRepeat
    const repeat = Math.min(w.frequency || 1, maxRepeat);

    // padding staggers the lines so it feels more like visual poetry
    const pad = '  '.repeat(i % (padSpread + 1));

    body.push(pad + w.text.repeat(Math.max(1, repeat)));
  }

  body.push('');
  body.push('— — — — — — — — — — — — — — — — — — — — — — — — — —');

  // include a short fragment of the original text
  // this keeps the ASCII output connected to the input passage
  const fragmentLen = Math.round(8 + density * 14);
  const fragment = (analysis.text || '')
    .split(/\s+/)
    .slice(0, fragmentLen)
    .join(' ')
    .toLowerCase();

  if (fragment) {
    body.push('');
    body.push('  "' + fragment + '…"');
  }

  body.push('');

  // final keyword summary line
  body.push('  [ ' + words.map(function (w) { return w.text; }).join(' · ') + ' ]');

  return header.concat(body);
}


// builds the ascii mode data
function generateAsciiData(analysis, options) {
  return attachAnalysisFields(analysis, {
    mode: 'ascii',
    lines: buildAsciiLayout(analysis, options),

    // particles are still included so the frontend has the same shared data
    particles: analysis.particles
  });
}


// export the helpers used by server.js and analyzeText.js
module.exports = {
  buildParticles: buildParticles,
  generateNetworkData: generateNetworkData,
  generateSoupData: generateSoupData,
  generateVortexData: generateVortexData,
  generateOrbitData: generateOrbitData,
  generateAsciiData: generateAsciiData
};