/** Returns true if the terminal is smaller than the required minimum. */
export function isTerminalTooSmall(width: number, height: number, minWidth: number, minHeight: number): boolean {
  return width < minWidth || height < minHeight;
}

/**
 * Compute the number of content rows available after subtracting chrome.
 * Returns at least `minRows` to avoid zero/negative values.
 */
export function rowsAvailable(height: number, reservedRows: number, minRows: number): number {
  return Math.max(minRows, height - reservedRows);
}
