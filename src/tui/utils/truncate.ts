/**
 * Truncate a string to fit within `max` characters.
 * Appends a single ellipsis character when truncation occurs.
 * Handles tiny widths safely (returns empty string for max <= 0).
 */
export function truncate(str: string, max: number): string {
  if (max <= 0) return '';
  if (str.length <= max) return str;
  if (max === 1) return '\u2026';
  return str.slice(0, max - 1) + '\u2026';
}
