/**
 * Safely clamp a list index. Returns 0 when the list is empty,
 * preventing the -1 that `Math.min(idx, length - 1)` produces.
 */
export function clampIndex(length: number, index: number): number {
  if (length === 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}
