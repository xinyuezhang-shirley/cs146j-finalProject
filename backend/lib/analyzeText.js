// This started as the server version of the simple browser textProcessing.js
// It keeps the same basic output shape, but adds stronger links, related words,
// and Datamuse enrichment so the visualizations have more material to work with

const { buildParticles } = require('./artData');

// common filler words that do not add much meaning to the visualization
// these are removed before counting important words
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

// simple word fragments used to create extra related words
// not perfect linguistics, just enough to make the visual output richer
const POETIC_PREFIXES = ['un', 're', 'over', 'under', 'out', 'mis'];
const POETIC_SUFFIXES = ['ness', 'ing', 'ly', 'less', 'ful', 'ward', 'like'];


// turns a passage into a clean list of words
// keeps the original order, but removes stopwords and tiny words
function getWords(text) {
  const matches = text.toLowerCase().match(/[a-z']+/g) || [];

  return matches.filter(function (word) {
    return word.length >= 2 && !STOPWORDS.has(word);
  });
}


// counts how often each word appears and remembers first-seen order
// counts is used for frequency
// order is used so the words still follow the original text structure
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
// each word becomes an object instead of staying as plain text
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


// connects words that appear near each other in the passage
// this creates the link data used by Network mode
function makeLinks(wordList, text, windowSize) {
  const tokens = text.toLowerCase().match(/[a-z']+/g) || [];
  const wordSet = new Set(wordList.map(function (w) { return w.text; }));

  // pairCounts remembers how often two words appear close together
  // example key: "fear|death" -> 3
  const pairCounts = {};
  const links = [];

  for (let i = 0; i < tokens.length; i++) {
    const anchor = tokens[i];

    // only make links from words that are in our cleaned word list
    if (!wordSet.has(anchor)) {
      continue;
    }

    // look at a small window of words after the current word
    const end = Math.min(i + windowSize, tokens.length);

    for (let j = i + 1; j < end; j++) {
      const neighbor = tokens[j];

      // skip words we are not visualizing and skip self-links
      if (!wordSet.has(neighbor) || anchor === neighbor) {
        continue;
      }

      // sort the pair so "fear|death" and "death|fear" count as the same link
      const key = [anchor, neighbor].sort().join('|');

      if (!pairCounts[key]) {
        pairCounts[key] = 0;
      }

      pairCounts[key] += 1;
    }
  }

  // turn the pairCounts object into an array of link objects
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
// this is the local fallback version, meaning it does not need the internet
function makeLocalRelatedWords(wordList, text, links) {
  const seen = new Set(wordList.map(function (w) { return w.text; }));
  const related = [];

  // helper so all related words get cleaned and stored the same way
  function addRelated(wordText, score, sourceWord) {
    const normalized = wordText.toLowerCase();

    // do not add duplicate words, stopwords, or very tiny words
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

  // top words are treated as the main ideas of the passage
  const topWords = wordList.slice(0, 8);
  const topSet = new Set(topWords.map(function (w) { return w.text; }));
  const wordSet = new Set(wordList.map(function (w) { return w.text; }));

  // stronger links should matter more, so sort by weight first
  const sortedLinks = links.slice().sort(function (a, b) {
    return b.weight - a.weight;
  });

  // if a top word is strongly linked to another word,
  // treat that other word as related
  sortedLinks.forEach(function (link) {
    if (topSet.has(link.source)) {
      addRelated(link.target, 0.2 + link.weight * 0.08, link.source);
    }

    if (topSet.has(link.target)) {
      addRelated(link.source, 0.2 + link.weight * 0.08, link.target);
    }
  });

  // also look for neighboring words in the raw text
  // if a core word sits beside a non-core word, that neighbor may still be meaningful
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

  // repeated words are often important themes
  // so we generate a few extra fragments from them
  const repeatedWords = wordList.filter(function (w) {
    return w.frequency >= 2;
  }).slice(0, 6);

  repeatedWords.forEach(function (w) {
    if (w.text.length > 4) {
      const half = Math.ceil(w.text.length / 2);
      addRelated(w.text.slice(0, half), 0.18, w.text);
    }
  });

  // create simple poetic variations of the top words
  // examples:
  // fear -> fearful
  // death -> deathless
  // memory -> unmemory
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

    // basic singular/plural variation
    if (word.endsWith('s') && word.length > 3) {
      addRelated(word.slice(0, -1), 0.16, word);
    } else if (!word.endsWith('s')) {
      addRelated(word + 's', 0.16, word);
    }
  });

  // highest scoring related words come first
  related.sort(function (a, b) {
    return b.score - a.score;
  });

  return related.slice(0, 60);
}


// combines local related words and Datamuse words
// if both sources suggest the same word, keep the stronger score
function mergeRelatedWords(localWords, datamuseWords) {
  const byText = new Map();

  // start with locally generated related words
  localWords.forEach(function (w) {
    byText.set(w.text, w);
  });

  // then add/replace with Datamuse words if they are stronger
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


// one Datamuse request
// returns an empty list if the network fails
// this keeps Echo working even when the API is unavailable
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
  // only use a few seed words so the API calls do not get too large
  const seeds = wordList.slice(0, 6);
  const related = new Map();

  // seen prevents returning words already present in the original input
  const seen = new Set(wordList.map(function (w) {
    return (w.text || w).toLowerCase();
  }));

  for (let s = 0; s < seeds.length; s++) {
    const item = seeds[s];
    const seed = (typeof item === 'string' ? item : item.text).toLowerCase();

    // encode the word so it is safe inside a URL
    const encoded = encodeURIComponent(seed);

    // Datamuse relationship types:
    // ml      = words with similar meaning
    // rel_trg = words often associated with the seed
    // rel_syn = synonyms
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

        // skip results that are noisy or hard to visualize
        // for example: phrases, hyphenated words, stopwords, and duplicates
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

          // Datamuse scores are large, so scale them down
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


// builds the final related-word list
// local guesses make sure the app still works offline
// Datamuse makes the output richer when the API works
async function buildRelatedWords(wordList, text, links) {
  const local = makeLocalRelatedWords(wordList, text, links);

  try {
    const fromDatamuse = await getDatamuseWords(wordList);
    return mergeRelatedWords(local, fromDatamuse);
  } catch (err) {
    return local;
  }
}


// pulls words and word frequency out of a passage
// this is the first stage of the analysis pipeline
function extractWords(text) {
  const cleanWords = getWords(text);
  const counted = countWords(cleanWords);
  const words = makeWordList(counted.counts, counted.order);

  // raw word count includes stopwords
  // useful for metadata, but not for visualization nodes
  const raw = text.toLowerCase().match(/[a-z']+/g) || [];

  return {
    words: words,
    frequency: counted.counts,
    rawWordCount: raw.length
  };
}


// main analysis used by the API routes
// this is the function server.js calls when the user enters text
async function analyzeText(text, options) {
  options = options || {};

  // density controls how crowded the generated particles feel
  let density = options.density;

  if (density === undefined || density === null) {
    density = 1;
  }

  // keep density between 0 and 1
  density = Math.min(1, Math.max(0, density));

  // basic text processing
  const extracted = extractWords(text);
  const words = extracted.words;
  const frequency = extracted.frequency;

  // graph-style relationships between words
  const links = makeLinks(words, text, 4);

  // extra related words from local logic + Datamuse
  const relatedWords = await buildRelatedWords(words, text, links);

  // particle data used by several visualization modes
  const particles = buildParticles(words, relatedWords, density);

  // simplified node list for the network graph
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
// this avoids breaking code that used the previous helper names
const buildCooccurrenceLinks = makeLinks;
const generateLocalRelatedWords = makeLocalRelatedWords;

module.exports = {
  STOPWORDS: STOPWORDS,
  extractWords: extractWords,
  buildCooccurrenceLinks: buildCooccurrenceLinks,
  generateLocalRelatedWords: generateLocalRelatedWords,
  analyzeText: analyzeText
};