/**
 * Frecency calculation — shared across all runtimes.
 *
 * Score = frequency * 10 * decayFactor
 * decayFactor drops from 1.0 to ~0.5 over 7 days of inactivity.
 *
 * @param {number} frequency - Number of times the tag has been used
 * @param {number} lastUsed - Unix milliseconds of last use
 * @returns {number} Rounded frecency score
 */
export function calculateFrecency(frequency, lastUsed) {
  const currentTime = Date.now();
  const daysSinceUse = (currentTime - lastUsed) / (1000 * 60 * 60 * 24);
  const decayFactor = 1 / (1 + daysSinceUse / 7);
  return Math.round(frequency * 10 * decayFactor);
}
