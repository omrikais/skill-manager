import { describe, it, expect } from 'vitest';
import { scoreSuggestion } from '../../src/core/triggers.js';

describe('scoreSuggestion', () => {
  it('returns high for >= 75% match', () => {
    expect(scoreSuggestion(3, 4)).toBe('high');
    expect(scoreSuggestion(4, 4)).toBe('high');
    expect(scoreSuggestion(75, 100)).toBe('high');
  });

  it('returns medium for >= 33% match', () => {
    expect(scoreSuggestion(1, 3)).toBe('medium');
    expect(scoreSuggestion(2, 4)).toBe('medium');
    expect(scoreSuggestion(34, 100)).toBe('medium');
  });

  it('returns low for < 33% match', () => {
    expect(scoreSuggestion(1, 4)).toBe('low');
    expect(scoreSuggestion(1, 5)).toBe('low');
    expect(scoreSuggestion(0, 5)).toBe('low');
  });

  it('returns low for zero total triggers', () => {
    expect(scoreSuggestion(0, 0)).toBe('low');
  });

  it('returns high for 1/1 match', () => {
    expect(scoreSuggestion(1, 1)).toBe('high');
  });
});
