export interface DiffLine {
  type: 'add' | 'remove' | 'context';
  content: string;
}

export interface DiffHunk {
  oldStart: number;
  newStart: number;
  lines: DiffLine[];
}

/**
 * Compute a unified diff between two texts.
 * Returns structured hunks with context lines for rendering.
 */
export function computeUnifiedDiff(
  oldText: string,
  newText: string,
  contextLines = 3,
): DiffHunk[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  // Compute LCS table
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to produce edit script
  type Edit = { type: 'equal' | 'remove' | 'add'; oldIdx: number; newIdx: number; content: string };
  const edits: Edit[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      edits.push({ type: 'equal', oldIdx: i - 1, newIdx: j - 1, content: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      edits.push({ type: 'add', oldIdx: i - 1, newIdx: j - 1, content: newLines[j - 1] });
      j--;
    } else {
      edits.push({ type: 'remove', oldIdx: i - 1, newIdx: -1, content: oldLines[i - 1] });
      i--;
    }
  }

  edits.reverse();

  // Group into hunks with context
  const hunks: DiffHunk[] = [];
  const changeIndices = edits.map((e, idx) => e.type !== 'equal' ? idx : -1).filter((idx) => idx !== -1);

  if (changeIndices.length === 0) return [];

  // Merge overlapping context windows
  let hunkStart = Math.max(0, changeIndices[0] - contextLines);
  let hunkEnd = Math.min(edits.length - 1, changeIndices[0] + contextLines);

  const ranges: [number, number][] = [];

  for (let ci = 1; ci < changeIndices.length; ci++) {
    const start = Math.max(0, changeIndices[ci] - contextLines);
    const end = Math.min(edits.length - 1, changeIndices[ci] + contextLines);

    if (start <= hunkEnd + 1) {
      // Merge with current range
      hunkEnd = end;
    } else {
      ranges.push([hunkStart, hunkEnd]);
      hunkStart = start;
      hunkEnd = end;
    }
  }
  ranges.push([hunkStart, hunkEnd]);

  // Build hunks from ranges
  for (const [rStart, rEnd] of ranges) {
    const lines: DiffLine[] = [];
    let oldStart = 0;
    let newStart = 0;

    // Compute starting line numbers
    let oLine = 1;
    let nLine = 1;
    for (let ei = 0; ei < rStart; ei++) {
      if (edits[ei].type === 'equal' || edits[ei].type === 'remove') oLine++;
      if (edits[ei].type === 'equal' || edits[ei].type === 'add') nLine++;
    }
    oldStart = oLine;
    newStart = nLine;

    for (let ei = rStart; ei <= rEnd; ei++) {
      const edit = edits[ei];
      if (edit.type === 'equal') {
        lines.push({ type: 'context', content: edit.content });
      } else if (edit.type === 'remove') {
        lines.push({ type: 'remove', content: edit.content });
      } else {
        lines.push({ type: 'add', content: edit.content });
      }
    }

    hunks.push({ oldStart, newStart, lines });
  }

  return hunks;
}
