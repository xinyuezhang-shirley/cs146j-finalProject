// This started as the server version of the simple browser textProcessing.js
// It keeps the same basic output shape, but adds stronger links, related words,
// and Datamuse enrichment so the visualizations have more material to work with

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


// turns a passage into a clean list of words (keeps order, skips stopwords)
function getWords(text) {
  const matches = text.toLowerCase().match(/[a-z']+/g) || [];

  return matches.filter(function (word) {
    return word.length >= 2 && !STOPWORDS.has(word);
  });
}


// counts how often each word appears and remembers first-seen order
function countWords(cleanWords) {
  const counts = {};
  const order = [];

  cleanWords.forEach(function (word) {
    if (!counts[word]) {
      counts[word] = 0;
      order.push(word);
    }
    counts[word] += 1;
  });

  return { counts: counts, order: order };
}


// creates the main word list used by the visuals
function makeWordList(counts, order) {
  return order.map(function (word) {
    return {
      text: word,
      frequency: counts[word],
      type: 'core',
      source: 'input'
    };
  });
}


// connects words that appear near each other in the passage (weighted window)
function makeLinks(wordList, text, windowSize) {
  const tokens = text.toLowerCase().match(/[a-z']+/g) || [];
  const wordSet = new Set(wordList.map(function (w) { return w.text; }));
  const pairCounts = {};
  const links = [];

  for (let i = 0; i < tokens.length; i++) {
    const anchor = tokens[i];
    if (!wordSet.has(anchor)) {
      continue;
    }

    const end = Math.min(i + windowSize, tokens.length);
    for (let j = i + 1; j < end; j++) {
      const neighbor = tokens[j];
      if (!wordSet.has(neighbor) || anchor === neighbor) {
        continue;
      }

      const key = [anchor, neighbor].sort().join('|');
      if (!pairCounts[key]) {
        pairCounts[key] = 0;
      }
      pairCounts[key] += 1;
    }
  }

  const keys = Object.keys(pairCounts);
  for (let k = 0; k < keys.length; k++) {
    const key = keys[k];
    const parts = key.split('|');
    links.push({
      source: parts[0],
      target: parts[1],
      weight: pairCounts[key]
    });
  }

  return links;
}


// guesses related words from links, neighbors, and small word-shape tweaks
function makeLocalRelatedWords(wordList, text, links) {
  const seen = new Set(wordList.map(function (w) { return w.text; }));
  const related = [];

  function addRelated(wordText, score, sourceWord) {
    const normalized = wordText.toLowerCase();
    if (seen.has(normalized) || normalized.length < 2 || STOPWORDS.has(normalized)) {
      return;
    }
    seen.add(normalized);
    related.push({
      text: normalized,
      score: score,
      source: sourceWord,
      type: 'related'
    });
  }

  const topWords = wordList.slice(0, 8);
  const topSet = new Set(topWords.map(function (w) { return w.text; }));
  const wordSet = new Set(wordList.map(function (w) { return w.text; }));

  const sortedLinks = links.slice().sort(function (a, b) {
    return b.weight - a.weight;
  });

  sortedLinks.forEach(function (link) {
    if (topSet.has(link.source)) {
      addRelated(link.target, 0.2 + link.weight * 0.08, link.source);
    }
    if (topSet.has(link.target)) {
      addRelated(link.source, 0.2 + link.weight * 0.08, link.target);
    }
  });

  const tokens = text.toLowerCase().match(/[a-z']+/g) || [];
  for (let i = 0; i < tokens.length - 1; i++) {
    const left = tokens[i];
    const right = tokens[i + 1];
    if (wordSet.has(left) && !wordSet.has(right)) {
      addRelated(right, 0.35, left);
    }
    if (wordSet.has(right) && !wordSet.has(left)) {
      addRelated(left, 0.35, right);
    }
  }

  const repeatedWords = wordList.filter(function (w) {
    return w.frequency >= 2;
  }).slice(0, 6);

  repeatedWords.forEach(function (w) {
    if (w.text.length > 4) {
      const half = Math.ceil(w.text.length / 2);
      addRelated(w.text.slice(0, half), 0.18, w.text);
    }
  });

  const seedWords = topWords.slice(0, 5);
  seedWords.forEach(function (w) {
    const word = w.text;
    let p = 0;
    for (p = 0; p < POETIC_PREFIXES.length; p++) {
      addRelated(POETIC_PREFIXES[p] + word, 0.22, word);
    }
    for (p = 0; p < POETIC_SUFFIXES.length; p++) {
      addRelated(word + POETIC_SUFFIXES[p], 0.2, word);
    }
    if (word.endsWith('s') && word.length > 3) {
      addRelated(word.slice(0, -1), 0.16, word);
    } else if (!word.endsWith('s')) {
      addRelated(word + 's', 0.16, word);
    }
  });

  related.sort(function (a, b) {
    return b.score - a.score;
  });

  return related.slice(0, 60);
}


// combines local related words and Datamuse words, keeping the stronger score
function mergeRelatedWords(localWords, datamuseWords) {
  const byText = new Map();

  localWords.forEach(function (w) {
    byText.set(w.text, w);
  });

  datamuseWords.forEach(function (w) {
    const existing = byText.get(w.text);
    if (!existing || w.score > existing.score) {
      byText.set(w.text, w);
    }
  });

  const merged = Array.from(byText.values());
  merged.sort(function (a, b) {
    return b.score - a.score;
  });

  return merged.slice(0, 60);
}


// one Datamuse request; returns an empty list if the network fails
async function fetchDatamuseJson(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Datamuse error: ' + response.status);
    }
    return await response.json();
  } catch (err) {
    return [];
  }
}


// asks Datamuse for words that feel related to the main words in the passage
async function getDatamuseWords(wordList) {
  const seeds = wordList.slice(0, 6);
  const related = new Map();
  const seen = new Set(wordList.map(function (w) {
    return (w.text || w).toLowerCase();
  }));

  for (let s = 0; s < seeds.length; s++) {
    const item = seeds[s];
    const seed = (typeof item === 'string' ? item : item.text).toLowerCase();
    const encoded = encodeURIComponent(seed);

    const urls = [
      'https://api.datamuse.com/words?ml=' + encoded + '&max=8',
      'https://api.datamuse.com/words?rel_trg=' + encoded + '&max=8',
      'https://api.datamuse.com/words?rel_syn=' + encoded + '&max=5'
    ];

    for (let u = 0; u < urls.length; u++) {
      const data = await fetchDatamuseJson(urls[u]);

      for (let d = 0; d < data.length; d++) {
        const entry = data[d];
        const wordText = entry.word.toLowerCase();

        if (
          wordText.includes(' ')
          || wordText.includes('-')
          || wordText.length < 3
          || seen.has(wordText)
          || STOPWORDS.has(wordText)
        ) {
          continue;
        }

        seen.add(wordText);
        related.set(wordText, {
          text: wordText,
          score: (entry.score || 0) / 100000,
          source: seed,
          type: 'related'
        });
      }
    }
  }

  const list = Array.from(related.values());
  list.sort(function (a, b) {
    return b.score - a.score;
  });

  return list.slice(0, 60);
}


// builds the final related-word list (local guesses plus Datamuse)
async function buildRelatedWords(wordList, text, links) {
  const local = makeLocalRelatedWords(wordList, text, links);

  try {
    const fromDatamuse = await getDatamuseWords(wordList);
    return mergeRelatedWords(local, fromDatamuse);
  } catch (err) {
    return local;
  }
}


// pulls words, links, related words, and particles out of a passage
function extractWords(text) {
  const cleanWords = getWords(text);
  const counted = countWords(cleanWords);
  const words = makeWordList(counted.counts, counted.order);
  const raw = text.toLowerCase().match(/[a-z']+/g) || [];

  return {
    words: words,
    frequency: counted.counts,
    rawWordCount: raw.length
  };
}


// main analysis used by the API routes
async function analyzeText(text, options) {
  options = options || {};
  let density = options.density;
  if (density === undefined || density === null) {
    density = 1;
  }
  density = Math.min(1, Math.max(0, density));

  const extracted = extractWords(text);
  const words = extracted.words;
  const frequency = extracted.frequency;
  const links = makeLinks(words, text, 4);
  const relatedWords = await buildRelatedWords(words, text, links);
  const particles = buildParticles(words, relatedWords, density);

  const nodes = words.map(function (w) {
    return {
      id: w.text,
      frequency: w.frequency
    };
  });

  return {
    text: text,
    words: words,
    frequency: frequency,
    relatedWords: relatedWords,
    particles: particles,
    links: links,
    nodes: nodes,
    meta: {
      wordCount: words.length,
      relatedCount: relatedWords.length,
      enrichment: 'datamuse+echo',
      analyzedAt: new Date().toISOString()
    }
  };
}


// older names kept so other backend files can still require them
const buildCooccurrenceLinks = makeLinks;
const generateLocalRelatedWords = makeLocalRelatedWords;

module.exports = {
  STOPWORDS: STOPWORDS,
  extractWords: extractWords,
  buildCooccurrenceLinks: buildCooccurrenceLinks,
  generateLocalRelatedWords: generateLocalRelatedWords,
  analyzeText: analyzeText
};
