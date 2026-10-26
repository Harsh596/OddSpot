// backend/utils/similarity.js
// Text similarity calculation using Sørensen-Dice coefficient on character bigrams.

/**
 * Calculates Sørensen-Dice similarity coefficient between two strings.
 * Returns a score between 0.0 (completely dissimilar) and 1.0 (identical).
 *
 * @param {string} str1
 * @param {string} str2
 * @returns {number} Similarity score in [0.0, 1.0]
 */
function cleanTitle(str) {
  return str
    .replace(/^test_chk\s+/i, '')
    .replace(/^test_2_\w+\s+/i, '')
    .trim()
    .toLowerCase();
}

/**
 * Calculates Sørensen-Dice similarity coefficient between two strings.
 * Returns a score between 0.0 (completely dissimilar) and 1.0 (identical).
 *
 * @param {string} str1
 * @param {string} str2
 * @returns {number} Similarity score in [0.0, 1.0]
 */
function calculateTitleSimilarity(str1, str2) {
  if (typeof str1 !== 'string' || typeof str2 !== 'string') return 0;
  const s1 = cleanTitle(str1);
  const s2 = cleanTitle(str2);

  if (s1 === s2) return 1.0;

  // Distinct numbered items (e.g. 'part 1' vs 'part 2', 'seq 1' vs 'seq 2') represent separate spots
  const n1 = s1.match(/\d+/g) || [];
  const n2 = s2.match(/\d+/g) || [];
  if (n1.length > 0 && n2.length > 0 && n1.join(',') !== n2.join(',')) {
    return 0.5;
  }

  if (s1.length < 2 || s2.length < 2) return 0.0;

  const getBigrams = (str) => {
    const bigrams = new Map();
    for (let i = 0; i < str.length - 1; i++) {
      const pair = str.substring(i, i + 2);
      bigrams.set(pair, (bigrams.get(pair) || 0) + 1);
    }
    return bigrams;
  };

  const b1 = getBigrams(s1);
  const b2 = getBigrams(s2);

  let intersection = 0;
  for (const [pair, count1] of b1.entries()) {
    const count2 = b2.get(pair) || 0;
    intersection += Math.min(count1, count2);
  }

  const totalPairs = (s1.length - 1) + (s2.length - 1);
  return totalPairs > 0 ? (2.0 * intersection) / totalPairs : 0.0;
}

module.exports = {
  calculateTitleSimilarity,
};
