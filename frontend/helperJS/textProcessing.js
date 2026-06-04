// textProcessing.js
// simple local text processing for Echo

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'it', 'this', 'that', 'i', 'me', 'my', 'we', 'you', 'your',
  'he', 'she', 'they', 'them', 'what', 'when', 'where', 'why', 'how',
  'not', 'only', 'just', 'very', 'so', 'than', 'too', 'into', 'out',
  'up', 'down', 'over', 'under', 'again', 'until', 'while'
]);


// turns a passage into a clean list of words
function getWords(text) {
  const matches = text.toLowerCase().match(/[a-z']+/g);
  const words = matches || [];

  return words.filter((word) => {
    return word.length > 1 && !STOPWORDS.has(word);
  });
}


// counts how often each word appears
function countWords(words) {
  const counts = {};

  words.forEach((word) => {
    if (!counts[word]) {
      counts[word] = 0;
    }

    counts[word]++;
  });

  return counts;
}


// creates the main word list used by the visuals
function makeWordList(counts) {
  const words = Object.keys(counts);

  words.sort((a, b) => {
    return counts[b] - counts[a];
  });

  //map the words to an object with the word, frequency, type, and source
  return words.map((word) => {
    return {
      text: word,
      frequency: counts[word],
      type: 'core',
      source: 'input'
    };
  });
}


// connects words that appear near each other
function makeLinks(cleanWords, wordList) {
  const importantWords = new Set(wordList.map((word) => word.text));
  const links = [];

  for (let i = 0; i < cleanWords.length - 1; i++) {
    const firstWord = cleanWords[i];
    const secondWord = cleanWords[i + 1];

    if (!importantWords.has(firstWord) || !importantWords.has(secondWord)) {
      continue;
    }

    if (firstWord === secondWord) {
      continue;
    }

    links.push({
      source: firstWord,
      target: secondWord,
      weight: 1
    });
  }

  return links;
}


// creates word particles for the animated views
function makeParticles(wordList, density = 1) {
  const amount = Math.max(8, Math.round(wordList.length * density));
  const pickedWords = wordList.slice(0, amount);

  const maxFrequency = pickedWords[0]?.frequency || 1;

  return pickedWords.map((word) => {
    const strength = word.frequency / maxFrequency;

    return {
      text: word.text,
      type: 'core',
      source: 'input',
      frequency: word.frequency,
      size: 0.8 + strength,
      opacity: 0.5 + strength * 0.5,
      semanticScore: strength
    };
  });
}


// main function when the server is offline — same shape as the API, but no related words
export function analyzeTextLocally(text, density = 1) {
  const cleanWords = getWords(text);
  const counts = countWords(cleanWords);
  const wordList = makeWordList(counts);
  const particles = makeParticles(wordList, density);
  const links = makeLinks(cleanWords, wordList);

  const nodes = wordList.map((word) => {
    return {
      id: word.text,
      frequency: word.frequency
    };
  });

  return {
    text: text,
    words: wordList,
    frequency: counts,
    relatedWords: [],
    particles: particles,
    links: links,
    nodes: nodes,
    meta: {
      wordCount: wordList.length,
      relatedCount: 0,
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