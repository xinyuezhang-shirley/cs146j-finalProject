// Browser fallback when the Echo server is not running.

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

// pull out the important words from the passage
export function extractWords(text) {
  const lower = text.toLowerCase();
  const match = lower.match(/[a-z']+/g);
  const tokens = match ? match : [];

  const frequency = {};
  for (let i = 0; i < tokens.length; i++) {
    const word = tokens[i];
    if (word.length < 2) {
      continue;
    }
    if (STOPWORDS.has(word)) {
      continue;
    }
    if (!frequency[word]) {
      frequency[word] = 0;
    }
    frequency[word] = frequency[word] + 1;
  }

  const wordTexts = Object.keys(frequency);
  wordTexts.sort(function (a, b) {
    return frequency[b] - frequency[a];
  });

  const words = [];
  for (let i = 0; i < wordTexts.length; i++) {
    const word = wordTexts[i];
    words.push({
      text: word,
      frequency: frequency[word],
      type: 'core',
      source: 'input'
    });
  }

  return {
    words: words,
    frequency: frequency,
    rawWordCount: tokens.length
  };
}

// connect words that appear near each other
export function buildCooccurrenceLinks(words, text, windowSize) {
  if (windowSize === undefined) {
    windowSize = 4;
  }

  const lower = text.toLowerCase();
  const match = lower.match(/[a-z']+/g);
  const tokens = match ? match : [];

  const wordSet = {};
  for (let i = 0; i < words.length; i++) {
    wordSet[words[i].text] = true;
  }

  const pairCounts = {};

  for (let i = 0; i < tokens.length; i++) {
    const anchor = tokens[i];
    if (!wordSet[anchor]) {
      continue;
    }

    const end = i + windowSize;
    const limit = end < tokens.length ? end : tokens.length;

    for (let j = i + 1; j < limit; j++) {
      const neighbor = tokens[j];
      if (!wordSet[neighbor]) {
        continue;
      }
      if (anchor === neighbor) {
        continue;
      }

      let first = anchor;
      let second = neighbor;
      if (first > second) {
        const temp = first;
        first = second;
        second = temp;
      }
      const key = first + '|' + second;

      if (!pairCounts[key]) {
        pairCounts[key] = 0;
      }
      pairCounts[key] = pairCounts[key] + 1;
    }
  }

  const links = [];
  const keys = Object.keys(pairCounts);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const parts = key.split('|');
    links.push({
      source: parts[0],
      target: parts[1],
      weight: pairCounts[key]
    });
  }

  return links;
}

// find softer related words from the same passage
export function generateLocalRelatedWords(words, text, links) {
  if (!links) {
    links = [];
  }

  const coreSet = {};
  for (let i = 0; i < words.length; i++) {
    coreSet[words[i].text] = true;
  }

  const related = [];
  const added = {};

  function addRelated(wordText, score, sourceWord) {
    if (added[wordText]) {
      return;
    }
    if (wordText.length < 2) {
      return;
    }
    if (STOPWORDS.has(wordText)) {
      return;
    }
    added[wordText] = true;
    related.push({
      text: wordText,
      score: score,
      source: sourceWord,
      type: 'related'
    });
  }

  // top core words pull in their linked neighbors as softer echoes
  const topCount = 8;
  const topSet = {};
  for (let i = 0; i < words.length && i < topCount; i++) {
    topSet[words[i].text] = true;
  }

  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    if (topSet[link.source]) {
      addRelated(link.target, 0.5, link.source);
    }
    if (topSet[link.target]) {
      addRelated(link.source, 0.5, link.target);
    }
  }

  // words sitting next to a core word in the original text
  const lower = text.toLowerCase();
  const match = lower.match(/[a-z']+/g);
  const tokens = match ? match : [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!coreSet[token]) {
      continue;
    }

    if (i > 0) {
      const before = tokens[i - 1];
      if (!coreSet[before]) {
        addRelated(before, 0.4, token);
      }
    }

    if (i < tokens.length - 1) {
      const after = tokens[i + 1];
      if (!coreSet[after]) {
        addRelated(after, 0.4, token);
      }
    }
  }

  related.sort(function (a, b) {
    return b.score - a.score;
  });

  if (related.length > 40) {
    return related.slice(0, 40);
  }
  return related;
}

// make the word objects used by the visualizations
export function buildParticles(words, relatedWords, density) {
  if (!relatedWords) {
    relatedWords = [];
  }
  if (density === undefined) {
    density = 1;
  }

  let maxFreq = 1;
  for (let i = 0; i < words.length; i++) {
    if (words[i].frequency > maxFreq) {
      maxFreq = words[i].frequency;
    }
  }

  const coreCount = Math.max(8, Math.round(words.length * density));
  const coreWords = words.slice(0, coreCount);

  const coreParticles = [];
  for (let i = 0; i < coreWords.length; i++) {
    const word = coreWords[i];
    const ratio = word.frequency / maxFreq;
    coreParticles.push({
      text: word.text,
      type: 'core',
      source: 'input',
      frequency: word.frequency,
      size: 0.7 + ratio * 1.3,
      opacity: 0.55 + ratio * 0.45,
      semanticScore: ratio
    });
  }

  const relatedCount = Math.max(4, Math.round(relatedWords.length * density));
  const pickedRelated = relatedWords.slice(0, relatedCount);

  const relatedParticles = [];
  for (let i = 0; i < pickedRelated.length; i++) {
    const word = pickedRelated[i];
    let score = 0.3;
    if (word.score) {
      score = word.score;
    }
    let source = 'echo';
    if (word.source) {
      source = word.source;
    }
    relatedParticles.push({
      text: word.text,
      type: 'related',
      source: source,
      frequency: 1,
      size: 0.5 + (1 - i * 0.05) * 0.4,
      opacity: 0.15 + (1 - i * 0.08) * 0.25,
      semanticScore: score
    });
  }

  return coreParticles.concat(relatedParticles);
}

// run local text analysis when the server is offline
export function analyzeTextLocally(text, density) {
  if (density === undefined) {
    density = 1;
  }

  const extracted = extractWords(text);
  const words = extracted.words;
  const frequency = extracted.frequency;

  const links = buildCooccurrenceLinks(words, text);
  const relatedWords = generateLocalRelatedWords(words, text, links);
  const particles = buildParticles(words, relatedWords, density);

  const nodes = [];
  for (let i = 0; i < words.length; i++) {
    nodes.push({
      id: words[i].text,
      frequency: words[i].frequency
    });
  }

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
      enrichment: 'echo-local',
      source: 'local'
    }
  };
}

export const SAMPLE_PASSAGE =
  `Romantic Death- Linguistic Tragedy
That words flow from the tip of my tongue, 
Lolita’s spell upon me. Each stair case another drawn
Out syllable, dancing, seducing my loss. Romantic. 

Tragedy. 
I speak not your language. I cannot
Waltz your steps, you curious soul.
I cannot caress the paragraphs like some long lost home, 
For every grain of sand marks me foreign
alone in the wilderness, a mournful tone.
You will be the death of me, if not my lover
Each syllable a perfect rhyme with mine
Each sentence a centimeter more somber
Until I lie forever under your spells
Until I forever mistreat you as well. Still,
Your step a little lighter, and I willingly close
my eyes forever.
To live a romantic death, to suffer a beautiful tragedy. 
Is this not the beauty of language? To die,
yet live, eternally?
`;
