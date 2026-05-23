/**
 * Optional local text processing — browser fallback only.
 *
 * NOT the source of truth. Core analysis lives in backend/lib/analyzeText.js.
 * Used when the Echo API server is unavailable. Never calls Datamuse.
 */

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

export function extractWords(text) {
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

export function buildCooccurrenceLinks(words, text, windowSize = 4) {
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

/** Echo local related-word generator — no external API calls. */
export function generateLocalRelatedWords(words, text, links = []) {
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

export function buildParticles(words, relatedWords = [], density = 1) {
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

/** Offline fallback — uses Echo local generators only (never Datamuse). */
export function analyzeTextLocally(text, density = 1) {
  const { words, frequency } = extractWords(text);
  const links = buildCooccurrenceLinks(words, text);
  const relatedWords = generateLocalRelatedWords(words, text, links);
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
      enrichment: 'echo-local',
      source: 'local'
    }
  };
}

export const SAMPLE_PASSAGE =
  `I couldn't find what I was looking for, and the silence felt heavier than words.
Still, I kept walking — step by step — until the empty street became something else.
You were there, or maybe just the memory of you, and for a moment I was happy again.`;
