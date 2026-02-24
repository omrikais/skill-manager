import { describe, it, expect } from 'vitest';
import { truncate } from '../../../src/tui/utils/truncate.js';

describe('truncate', () => {
  it('returns string unchanged when within max', () => {
    expect(truncate('hello', 10)).toBe('hello');
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('truncates long strings with ellipsis', () => {
    expect(truncate('hello world', 5)).toBe('hell\u2026');
    expect(truncate('abcdef', 3)).toBe('ab\u2026');
  });

  it('handles max of 1 as just ellipsis', () => {
    expect(truncate('hello', 1)).toBe('\u2026');
  });

  it('returns empty string for max <= 0', () => {
    expect(truncate('hello', 0)).toBe('');
    expect(truncate('hello', -5)).toBe('');
  });

  it('returns empty string for empty input', () => {
    expect(truncate('', 10)).toBe('');
    expect(truncate('', 0)).toBe('');
  });
});
