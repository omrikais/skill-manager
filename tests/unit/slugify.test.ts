import { describe, it, expect } from 'vitest';
import { slugify } from '../../src/utils/slug.js';

describe('slugify', () => {
  it('converts normal text', () => {
    expect(slugify('My Skill Name')).toBe('my-skill-name');
  });

  it('handles spaces', () => {
    expect(slugify('hello world')).toBe('hello-world');
  });

  it('returns empty string for empty input', () => {
    expect(slugify('')).toBe('');
  });

  it('strips path traversal characters', () => {
    expect(slugify('../etc/passwd')).toBe('etc-passwd');
  });

  it('collapses multiple hyphens', () => {
    expect(slugify('foo---bar___baz')).toBe('foo-bar-baz');
  });

  it('handles ALL CAPS', () => {
    expect(slugify('MY SKILL')).toBe('my-skill');
  });

  it('strips leading and trailing non-alnum', () => {
    expect(slugify('--foo-bar--')).toBe('foo-bar');
  });

  it('handles special characters', () => {
    expect(slugify('hello@world#test!')).toBe('hello-world-test');
  });

  it('preserves numbers', () => {
    expect(slugify('version 2.0')).toBe('version-2-0');
  });

  it('handles single character', () => {
    expect(slugify('a')).toBe('a');
  });

  it('handles only special characters', () => {
    expect(slugify('!@#$%')).toBe('');
  });
});
