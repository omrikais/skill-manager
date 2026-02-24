import { describe, it, expect } from 'vitest';
import { hashContent } from '../../src/core/hash.js';

describe('hashContent', () => {
  it('returns a deterministic hash', () => {
    const hash1 = hashContent('hello world');
    const hash2 = hashContent('hello world');
    expect(hash1).toBe(hash2);
  });

  it('is idempotent', () => {
    const content = 'some content\nwith newlines\n';
    expect(hashContent(content)).toBe(hashContent(content));
  });

  it('trims whitespace before hashing', () => {
    const hash1 = hashContent('  hello  ');
    const hash2 = hashContent('hello');
    expect(hash1).toBe(hash2);
  });

  it('returns a 64-char hex string (SHA-256)', () => {
    const hash = hashContent('test');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('handles empty string', () => {
    const hash = hashContent('');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('different content produces different hashes', () => {
    const hash1 = hashContent('foo');
    const hash2 = hashContent('bar');
    expect(hash1).not.toBe(hash2);
  });
});
