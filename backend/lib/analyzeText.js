// Text analysis for Echo — word counts, links, related words, particles.
// Datamuse is optional; the server passes in fetchExternal when enabled.

const { buildParticles } = require('./artData');

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
  'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can',
  'need', 'dare', 'ought', 'used', 'it', 'its', 'this', 'that', 'these',
  'those', 'i', 'me', 'my', 'myself', 'we', 'our', 'you', 'your', 'he',
  'him', 'his', 'she', 'her', 'they', 'them', 'their', 'what', 'which',
  'who', 'whom', 'when', 'where', 'why', 'how', 'all', 'each', 'every',
  'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
  'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
  'also', 'now', 'here', 'there', 'then', 'once', 'if', 'about', 'into',
  'through', 'during', 'before', 'after', 'above', 'below', 'up', 'down',
  'out', 'off', 'over', 'under', 'again', 'further', 'any', 'because',
  'until', 'while', 'am', 'having', 'doing'
]);

const POETIC_PREFIXES = ['un', 're', 'over', 'under', 'out', 'mis'];
const POETIC_SUFFIXES = ['ness', 'ing', 'ly', 'less', 'ful', 'ward', 'like'];

function extractWords(text) {
  const raw = text.toLowerCase().match(/[a-z']+/g) || [];
  const frequency = {};
  const order = [];

  raw.forEach((word) => {
    if (word.length < 2 || STOPWORDS.has(word)) return;
    if (!frequency[word]) {
      frequency[word] = 0;
      order.push(word);
    }
    frequency[word] += 1;
  });

  const words = order.map((word) => ({
    text: word,
    frequency: frequency[word],
    type: 'core',
    source: 'input'
  }));

  return { words, frequency, rawWordCount: raw.length };
}

function buildCooccurrenceLinks(words, text, windowSize = 4) {
  const tokens = text.toLowerCase().match(/[a-z']+/g) || [];
  const wordSet = new Set(words.map((w) => w.text));
  const pairCounts = {};

  for (let i = 0; i < tokens.length; i++) {
    const anchor = tokens[i];
    if (!wordSet.has(anchor)) continue;

    for (let j = i + 1; j < Math.min(i + windowSize, tokens.length); j++) {
      const neighbor = tokens[j];
      if (!wordSet.has(neighbor) || anchor === neighbor) continue;
      const key = [anchor, neighbor].sort().join('|');
      pairCounts[key] = (pairCounts[key] || 0) + 1;
    }
  }

  return Object.entries(pairCounts).map(([key, weight]) => {
    const [source, target] = key.split('|');
    return { source, target, weight };
  });
}

function generateLocalRelatedWords(words, text, links = []) {
  const seen = new Set(words.map((w) => w.text));
  const related = [];

  const add = (text, score, sourceWord) => {
    const normalized = text.toLowerCase();
    if (seen.has(normalized) || normalized.length < 2 || STOPWORDS.has(normalized)) return;
    seen.add(normalized);
    related.push({ text: normalized, score, source: sourceWord, type: 'related' });
  };

  const topWords = words.slice(0, 8);
  const topSet = new Set(topWords.map((w) => w.text));
  const wordSet = new Set(words.map((w) => w.text));

  [...links]
    .sort((a, b) => b.weight - a.weight)
    .forEach((link) => {
      if (topSet.has(link.source)) add(link.target, 0.2 + link.weight * 0.08, link.source);
      if (topSet.has(link.target)) add(link.source, 0.2 + link.weight * 0.08, link.target);
    });

  const tokens = text.toLowerCase().match(/[a-z']+/g) || [];
  for (let i = 0; i < tokens.length - 1; i++) {
    const left = tokens[i];
    const right = tokens[i + 1];
    if (wordSet.has(left) && !wordSet.has(right)) add(right, 0.35, left);
    if (wordSet.has(right) && !wordSet.has(left)) add(left, 0.35, right);
  }

  words
    .filter((w) => w.frequency >= 2)
    .slice(0, 6)
    .forEach((w) => {
      if (w.text.length > 4) add(w.text.slice(0, Math.ceil(w.text.length / 2)), 0.18, w.text);
    });

  topWords.slice(0, 5).forEach((w) => {
    const word = w.text;
    POETIC_PREFIXES.forEach((prefix) => add(prefix + word, 0.22, word));
    POETIC_SUFFIXES.forEach((suffix) => add(word + suffix, 0.2, word));
    if (word.endsWith('s') && word.length > 3) add(word.slice(0, -1), 0.16, word);
    else if (!word.endsWith('s')) add(word + 's', 0.16, word);
  });

  return related.sort((a, b) => b.score - a.score).slice(0, 60);
}

function mergeRelatedWords(localWords, externalWords) {
  const byText = new Map();

  localWords.forEach((w) => byText.set(w.text, w));
  externalWords.forEach((w) => {
    const existing = byText.get(w.text);
    if (!existing || w.score > existing.score) {
      byText.set(w.text, w);
    }
  });

  return [...byText.values()].sort((a, b) => b.score - a.score).slice(0, 60);
}

async function fetchDatamuse(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Datamuse error: ${response.status}`);
    return await response.json();
  } catch {
    return [];
  }
}

// Optional Datamuse enrichment — only called from the server, never the browser.
async function fetchDatamuseRelatedWords(seedWords) {
  const seeds = seedWords.slice(0, 6);
  const related = new Map();
  const seen = new Set(seedWords.map((w) => (w.text || w).toLowerCase()));

  for (const item of seeds) {
    const seed = (typeof item === 'string' ? item : item.text).toLowerCase();
    const encoded = encodeURIComponent(seed);

    const urls = [
      `https://api.datamuse.com/words?ml=${encoded}&max=8`,
      `https://api.datamuse.com/words?rel_trg=${encoded}&max=8`,
      `https://api.datamuse.com/words?rel_syn=${encoded}&max=5`
    ];

    for (const url of urls) {
      const data = await fetchDatamuse(url);

      data.forEach((entry) => {
        const text = entry.word.toLowerCase();

        if (
          text.includes(' ')
          || text.includes('-')
          || text.length < 3
          || seen.has(text)
          || STOPWORDS.has(text)
        ) {
          return;
        }

        seen.add(text);
        related.set(text, {
          text,
          score: (entry.score || 0) / 100000,
          source: seed,
          type: 'related'
        });
      });
    }
  }

  return Array.from(related.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 60);
}

async function resolveRelatedWords(words, text, links, useDatamuse, fetchExternal) {
  const local = generateLocalRelatedWords(words, text, links);
  if (!useDatamuse || !fetchExternal) return local;

  try {
    const external = await fetchExternal(words);
    return mergeRelatedWords(local, external);
  } catch {
    return local;
  }
}

async function analyzeText(text, options = {}) {
  const density = Math.min(1, Math.max(0, options.density ?? 1));
  const { words, frequency } = extractWords(text);
  const links = buildCooccurrenceLinks(words, text);
  const relatedWords = await resolveRelatedWords(
    words,
    text,
    links,
    options.useDatamuse,
    options.fetchExternal
  );
  const particles = buildParticles(words, relatedWords, density);

  return {
    text,
    words,
    frequency,
    relatedWords,
    particles,
    links,
    nodes: words.map((w) => ({ id: w.text, frequency: w.frequency })),
    meta: {
      wordCount: words.length,
      relatedCount: relatedWords.length,
      enrichment: options.useDatamuse ? 'datamuse+echo' : 'echo-local',
      analyzedAt: new Date().toISOString()
    }
  };
}

module.exports = {
  STOPWORDS,
  extractWords,
  buildCooccurrenceLinks,
  generateLocalRelatedWords,
  analyzeText,
  fetchDatamuseRelatedWords
};
