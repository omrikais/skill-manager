import { describe, it, expect } from 'vitest';
import { computeUnifiedDiff } from '../../src/tui/utils/diff.js';

describe('computeUnifiedDiff', () => {
  it('returns empty hunks for identical texts', () => {
    const text = 'line1\nline2\nline3';
    expect(computeUnifiedDiff(text, text)).toEqual([]);
  });

  it('detects added lines', () => {
    const old = 'a\nb\nc';
    const new_ = 'a\nb\nnew\nc';
    const hunks = computeUnifiedDiff(old, new_);
    expect(hunks.length).toBeGreaterThan(0);
    const addLines = hunks.flatMap((h) => h.lines).filter((l) => l.type === 'add');
    expect(addLines.some((l) => l.content === 'new')).toBe(true);
  });

  it('detects removed lines', () => {
    const old = 'a\nb\nc';
    const new_ = 'a\nc';
    const hunks = computeUnifiedDiff(old, new_);
    expect(hunks.length).toBeGreaterThan(0);
    const removeLines = hunks.flatMap((h) => h.lines).filter((l) => l.type === 'remove');
    expect(removeLines.some((l) => l.content === 'b')).toBe(true);
  });

  it('detects changed lines', () => {
    const old = 'a\nb\nc';
    const new_ = 'a\nB\nc';
    const hunks = computeUnifiedDiff(old, new_);
    expect(hunks.length).toBeGreaterThan(0);
    const lines = hunks.flatMap((h) => h.lines);
    expect(lines.some((l) => l.type === 'remove' && l.content === 'b')).toBe(true);
    expect(lines.some((l) => l.type === 'add' && l.content === 'B')).toBe(true);
  });

  it('includes context lines', () => {
    const old = 'a\nb\nc\nd\ne\nf\ng';
    const new_ = 'a\nb\nc\nD\ne\nf\ng';
    const hunks = computeUnifiedDiff(old, new_, 2);
    const lines = hunks.flatMap((h) => h.lines);
    const contextLines = lines.filter((l) => l.type === 'context');
    expect(contextLines.length).toBeGreaterThan(0);
  });

  it('merges adjacent hunks when within context distance', () => {
    // Two changes close together should be in one hunk
    const old = 'a\nb\nc\nd\ne';
    const new_ = 'A\nb\nc\nd\nE';
    const hunks = computeUnifiedDiff(old, new_, 3);
    // With 3 context lines and only 3 lines between changes, they should merge
    expect(hunks.length).toBe(1);
  });

  it('handles completely different texts', () => {
    const old = 'hello\nworld';
    const new_ = 'goodbye\nearth';
    const hunks = computeUnifiedDiff(old, new_);
    expect(hunks.length).toBeGreaterThan(0);
  });

  it('handles empty old text', () => {
    const hunks = computeUnifiedDiff('', 'new line');
    expect(hunks.length).toBeGreaterThan(0);
    const addLines = hunks.flatMap((h) => h.lines).filter((l) => l.type === 'add');
    expect(addLines.length).toBeGreaterThan(0);
  });

  it('handles empty new text', () => {
    const hunks = computeUnifiedDiff('old line', '');
    expect(hunks.length).toBeGreaterThan(0);
    const removeLines = hunks.flatMap((h) => h.lines).filter((l) => l.type === 'remove');
    expect(removeLines.length).toBeGreaterThan(0);
  });

  it('hunk has correct oldStart and newStart', () => {
    const old = 'a\nb\nc\nd\ne\nf\ng\nh';
    const new_ = 'a\nb\nc\nd\ne\nF\ng\nh';
    const hunks = computeUnifiedDiff(old, new_, 2);
    expect(hunks.length).toBe(1);
    // Change at line 6, context=2 means hunk starts at line 4
    expect(hunks[0].oldStart).toBe(4);
    expect(hunks[0].newStart).toBe(4);
  });
});
