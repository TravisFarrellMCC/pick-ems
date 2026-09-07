/**
 * Extracts a signed decimal number from free-form text (e.g. "+3.5", "-192",
 * "o44.5" once a prefix is stripped). Returns null if no number is found.
 */
export function parseSignedNumber(text: string): number | null {
  const match = text.match(/[-+]?\d+(\.\d+)?/);
  if (match == null) {
    return null;
  }
  const parsed = parseFloat(match[0]);
  return Number.isNaN(parsed) ? null : parsed;
}
