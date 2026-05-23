/**
 * Optional external enrichment for the Echo API.
 *
 * Datamuse is a stretch feature — server-side only, never called from the browser.
 * Echo's core art generation never depends on this module; failures fall back gracefully.
 */

const { STOPWORDS } = require('./analyzeText');

async function fetchDatamuse(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Datamuse error: ${response.status}`);
    return await response.json();
  } catch {
    return [];
  }
}

/**
 * Fetch semantically related words from Datamuse (prototype-style).
 * Returns echo nodes with source = seed word, type = "related".
 */
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
          text.includes(' ') ||
          text.includes('-') ||
          text.length < 3 ||
          seen.has(text) ||
          STOPWORDS.has(text)
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

module.exports = { fetchDatamuseRelatedWords };
